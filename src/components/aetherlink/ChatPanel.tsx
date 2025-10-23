import { useAppStore } from "@/store/app-store";
import { useShallow } from 'zustand/react/shallow';
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { UserAvatar } from "./UserAvatar";
import { Message } from "./Message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Upload, Bot, Send, Paperclip } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "@/components/ui/sonner";
import type { Conversation, Message as MessageType } from "@shared/types";
import { motion, AnimatePresence } from "framer-motion";
import { usePolling } from "@/hooks/use-polling";
const CHUNK_SIZE = 512 * 1024; // 512KB chunks - smaller for better reliability
const MAX_FILE_SIZE = 350 * 1024 * 1024; // 350MB maximum file size
const CHUNK_TIMEOUT = 120000; // 120 seconds timeout per chunk (2 minutes)
const MAX_RETRIES = 5; // Maximum retries per chunk
const CONCURRENT_UPLOADS = 1; // Upload chunks sequentially to avoid overwhelming the server

// Polyfill for crypto.randomUUID
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
interface ChatPanelProps {
  mobileNav?: React.ReactNode;
}
export function ChatPanel({ mobileNav }: ChatPanelProps) {
  const { currentUser, activeConversationId, conversations, users, setConversation, addMessage, updateMessageProgress } = useAppStore(
    useShallow((state) => ({
      currentUser: state.currentUser,
      activeConversationId: state.activeConversationId,
      conversations: state.conversations,
      users: state.users,
      setConversation: state.setConversation,
      addMessage: state.addMessage,
      updateMessageProgress: state.updateMessageProgress,
    }))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const recipient = users.find(u => u.id === activeConversationId);
  // Generate the correct conversation ID for lookup
  const conversationId = currentUser && activeConversationId
    ? [currentUser.id, activeConversationId].sort().join(':')
    : null;
  const conversation = conversationId ? conversations[conversationId] : null;

  const fetchConversation = useCallback(async () => {
    if (activeConversationId) {
      try {
        const conv = await api<Conversation>(`/api/conversations/${activeConversationId}`);
        setConversation(conv);
      } catch (error) {
        console.error("Failed to fetch conversation:", error);
      }
    }
  }, [activeConversationId, setConversation]);

  useEffect(() => {
    const loadConversation = async () => {
      setIsLoading(true);
      await fetchConversation();
      setIsLoading(false);
    };
    loadConversation();
  }, [activeConversationId, fetchConversation]);

  // Poll conversation for new messages/files every 3 seconds
  usePolling(fetchConversation, 3000);
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [conversation?.messages, isLoading]);
  // Helper function to upload a chunk with timeout and retries
  const uploadChunkWithRetry = async (
    fileId: string,
    chunkIndex: number,
    chunk: Blob,
    currentUserId: string,
    recipientId: string,
    totalChunks: number,
    retryCount = 0
  ): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHUNK_TIMEOUT);

    try {
      const startTime = Date.now();
      const res = await fetch(`/api/files/upload/${fileId}/${chunkIndex}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-User-Id': currentUserId,
          'X-Recipient-Id': recipientId
        },
        body: chunk,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!res.ok) {
        throw new Error(`Chunk upload failed with status ${res.status}`);
      }

      // Log successful upload with timing
      if (chunkIndex % 10 === 0) {
        console.log(`✓ Chunk ${chunkIndex + 1}/${totalChunks} uploaded in ${duration}s`);
      }

      return res;
    } catch (error) {
      clearTimeout(timeoutId);

      const errorName = error instanceof Error ? error.name : 'Unknown';
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if it's a timeout or network error and retry if possible
      if (retryCount < MAX_RETRIES) {
        const isTimeout = errorName === 'AbortError';
        const isNetworkError = errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('ERR_CONNECTION');

        if (isTimeout || isNetworkError) {
          const delaySeconds = 2 * Math.pow(2, retryCount); // 2s, 4s, 8s, 16s, 32s
          console.warn(`⚠ Chunk ${chunkIndex + 1}/${totalChunks} failed (${errorName}), retry ${retryCount + 1}/${MAX_RETRIES} in ${delaySeconds}s...`);

          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
          return uploadChunkWithRetry(fileId, chunkIndex, chunk, currentUserId, recipientId, totalChunks, retryCount + 1);
        }
      }

      console.error(`✗ Chunk ${chunkIndex + 1}/${totalChunks} failed permanently: ${errorMsg}`);
      throw error;
    }
  };

  const handleSendFile = async (file: File) => {
    if (!currentUser || !activeConversationId) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File is too large. Maximum size is 350MB.`);
      return;
    }

    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    toast.info(`Uploading ${file.name} (${fileSizeMB} MB)...`);

    // Generate the correct conversation ID (sorted user IDs joined with ':')
    const convId = [currentUser.id, activeConversationId].sort().join(':');

    const tempMessageId = generateUUID();
    const placeholderMessage: MessageType = {
      id: tempMessageId,
      conversationId: convId,
      senderId: currentUser.id,
      content: '', // Will be file ID
      timestamp: Date.now(),
      type: 'file',
      file: { name: file.name, size: file.size, type: file.type },
      progress: 0,
    };
    addMessage(placeholderMessage);

    try {
      const { fileId } = await api<{ fileId: string }>('/api/files/initiate', {
        method: 'POST',
        body: JSON.stringify({
          recipientId: activeConversationId,
          file: { name: file.name, size: file.size, type: file.type },
        }),
      });

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const estimatedTime = Math.ceil((totalChunks * 3) / 60); // Rough estimate: 3s per chunk
      console.log(`📤 Starting upload: ${totalChunks} chunks of ${CHUNK_SIZE / 1024}KB each (~${estimatedTime} min)`);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = start + CHUNK_SIZE;
        const chunk = file.slice(start, end);

        // Upload chunk with timeout and retry logic
        await uploadChunkWithRetry(fileId, i, chunk, currentUser.id, activeConversationId, totalChunks);

        const progress = Math.round(((i + 1) / totalChunks) * 100);
        updateMessageProgress(convId, tempMessageId, progress);

        // Log progress every 10%
        if (progress % 10 === 0) {
          const elapsed = ((Date.now() - Date.now()) / 1000 / 60).toFixed(1);
          console.log(`📊 Progress: ${progress}% (${i + 1}/${totalChunks} chunks)`);
        }
      }

      // Success notification
      toast.success(`${file.name} uploaded successfully!`, {
        description: `${fileSizeMB} MB uploaded. File is now available for download.`,
        duration: 4000,
      });

      // Mark as complete
      updateMessageProgress(convId, tempMessageId, 100);

    } catch (error) {
      console.error("File upload failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error("File upload failed", {
        description: `Error: ${errorMessage}. Please try again.`,
        duration: 5000,
      });
      updateMessageProgress(convId, tempMessageId, -1); // Indicate error
    }
  };
  const handleSendText = async () => {
    if (!currentUser || !activeConversationId || !textMessage.trim()) return;

    const convId = [currentUser.id, activeConversationId].sort().join(':');
    const messageId = generateUUID();

    const newMessage: MessageType = {
      id: messageId,
      conversationId: convId,
      senderId: currentUser.id,
      content: textMessage.trim(),
      timestamp: Date.now(),
      type: 'text',
    };

    // Add message locally
    addMessage(newMessage);
    setTextMessage('');

    // Send to server
    try {
      await api('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          recipientId: activeConversationId,
          content: textMessage.trim(),
        }),
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleSendFile(file);
    }
    if (e.target) e.target.value = '';
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      handleSendFile(file);
    }
  };
  const usersById = new Map(users.map(u => [u.id, u]));
  if (currentUser) usersById.set(currentUser.id, currentUser);
  if (!activeConversationId || !recipient) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-slate-50 dark:bg-slate-900/50 text-center p-8">
        {mobileNav && <div className="absolute top-4 left-4">{mobileNav}</div>}
        <Bot size={64} className="text-slate-400 dark:text-slate-600 mb-4" />
        <h2 className="text-2xl font-semibold text-foreground">Bienvenido a Airplay</h2>
        <p className="text-muted-foreground mt-2 max-w-sm">Selecciona un Usuario para iniciar una conversación.</p>
      </div>
    );
  }
  return (
    <div
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag and drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-indigo-500/20 dark:bg-indigo-500/30 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-indigo-500 dark:border-indigo-400 rounded-lg">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl text-center">
            <Upload size={64} className="mx-auto mb-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-2xl font-bold text-foreground mb-2">Inserta tus archivos aqui.</h3>
            <p className="text-muted-foreground"> Liberar para subir (max 350MB)</p>
          </div>
        </div>
      )}

      <header className="flex items-center gap-4 p-4 border-b border-slate-200 dark:border-slate-800 bg-background">
        {mobileNav}
        <UserAvatar user={recipient} isOnline={recipient.online} />
        <div>
          <h2 className="text-lg font-semibold">{recipient.name}</h2>
          <p className="text-sm text-muted-foreground">{recipient.online ? 'Online' : 'Offline'}</p>
        </div>
      </header>
      <ScrollArea className="flex-1 bg-slate-50 dark:bg-slate-900/50" ref={scrollAreaRef}>
        <div className="p-4 md:p-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="h-16 w-3/4 ml-auto" />
              <Skeleton className="h-16 w-2/4" />
            </div>
          ) : (
            <AnimatePresence>
              {conversation?.messages && conversation.messages.length > 0 ? (
                conversation.messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8, y: 50 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 50 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    <Message message={msg} sender={usersById.get(msg.senderId)} />
                  </motion.div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>No messages yet. Upload a file to start the conversation.</p>
                </div>
              )}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
      <footer className="p-4 border-t border-slate-200 dark:border-slate-800 bg-background">
        <div className="flex items-center gap-2">
          <input type="file" ref={fileInputRef} onChange={onFileSelect} className="hidden" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0"
            title="Upload file"
          >
            <Paperclip size={20} />
          </Button>
          <input
            type="text"
            value={textMessage}
            onChange={(e) => setTextMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendText();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <Button
            onClick={handleSendText}
            disabled={!textMessage.trim()}
            size="icon"
            className="flex-shrink-0"
          >
            <Send size={20} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">Tamaño máximo de archivo: 350 MB • Presione Enter para enviar</p>
      </footer>
      <Toaster richColors />
    </div>
  );
}