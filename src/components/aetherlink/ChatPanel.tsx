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
import type { Conversation, Message as MessageType, Room, RoomMessage } from "@shared/types";
import { motion, AnimatePresence } from "framer-motion";
import { usePolling } from "@/hooks/use-polling";
const CHUNK_SIZE = 512 * 1024; // 512KB chunks - smaller for better reliability
const MAX_FILE_SIZE = 350 * 1024 * 1024; // 350MB maximum file size
const CHUNK_TIMEOUT = 120000; // 120 seconds timeout per chunk (2 minutes)
const MAX_RETRIES = 5; // Maximum retries per chunk
const CONCURRENT_UPLOADS = 3; // Upload 3 chunks in parallel for better speed

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
  const {
    currentUser,
    activeConversationId,
    conversations,
    users,
    setConversation,
    addMessage,
    updateMessageProgress,
    rooms,
    roomMessages,
    activeRoomId,
    setRoom,
    setRoomMessages,
    addRoomMessage,
    updateRoomMessageProgress,
  } = useAppStore(
    useShallow((state) => ({
      currentUser: state.currentUser,
      activeConversationId: state.activeConversationId,
      conversations: state.conversations,
      users: state.users,
      setConversation: state.setConversation,
      addMessage: state.addMessage,
      updateMessageProgress: state.updateMessageProgress,
      rooms: state.rooms,
      roomMessages: state.roomMessages,
      activeRoomId: state.activeRoomId,
      setRoom: state.setRoom,
      setRoomMessages: state.setRoomMessages,
      addRoomMessage: state.addRoomMessage,
      updateRoomMessageProgress: state.updateRoomMessageProgress,
    }))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const recipient = users.find(u => u.id === activeConversationId);
  // Generate the correct conversation ID for lookup
  const conversationId = currentUser && activeConversationId
    ? [currentUser.id, activeConversationId].sort().join(':')
    : null;
  const conversation = conversationId ? conversations[conversationId] : null;
  const activeRoom = activeRoomId ? rooms[activeRoomId] : null;
  const roomThread = activeRoomId ? roomMessages[activeRoomId] : undefined;
  const isRoomChat = Boolean(activeRoomId);
  const currentMessages = isRoomChat
    ? (roomThread ?? [])
    : (conversation?.messages ?? []);
  const messageCount = currentMessages.length;
  const formatRoomExpiration = (expiresAt?: number) => {
    if (!expiresAt) return '';
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expirada';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m restantes`;
    }
    return `${minutes}m restantes`;
  };

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

  const fetchRoomData = useCallback(async () => {
    if (activeRoomId) {
      try {
        const data = await api<{ room: Room; messages: RoomMessage[] }>(`/api/rooms/${activeRoomId}`);
        setRoom(data.room);
        setRoomMessages(activeRoomId, data.messages);
      } catch (error) {
        console.error("Failed to fetch room:", error);
      }
    }
  }, [activeRoomId, setRoom, setRoomMessages]);

  useEffect(() => {
    const loadData = async () => {
      if (!activeConversationId && !activeRoomId) return;
      setIsLoading(true);
      try {
        if (activeConversationId) {
          await fetchConversation();
        } else if (activeRoomId) {
          await fetchRoomData();
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [activeConversationId, activeRoomId, fetchConversation, fetchRoomData]);

  // Poll conversation/room for new messages
  usePolling(fetchConversation, activeConversationId ? 3000 : null);
  usePolling(fetchRoomData, activeRoomId ? 4000 : null);
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [messageCount, isLoading]);
  // Helper function to upload a chunk with timeout and retries
  const uploadChunkWithRetry = async (
    fileId: string,
    chunkIndex: number,
    chunk: Blob,
    currentUserId: string,
    targetHeader: { key: string; value: string },
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
          [targetHeader.key]: targetHeader.value
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
          console.warn(`[Upload] Chunk ${chunkIndex + 1}/${totalChunks} failed (${errorName}), retry ${retryCount + 1}/${MAX_RETRIES} in ${delaySeconds}s...`);

          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
          return uploadChunkWithRetry(fileId, chunkIndex, chunk, currentUserId, targetHeader, totalChunks, retryCount + 1);
      }
      }

      console.error(`✗ Chunk ${chunkIndex + 1}/${totalChunks} failed permanently: ${errorMsg}`);
      throw error;
    }
  };

  const handleSendFile = async (file: File) => {
    if (!currentUser) return;
    const roomIdForUpload = activeRoomId;
    const targetId = roomIdForUpload ?? activeConversationId;
    if (!targetId) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File is too large. Maximum size is 350MB.');
      return;
    }

    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const isRoomTarget = Boolean(roomIdForUpload);
    const tempMessageId = generateUUID();
    const fileMeta = { name: file.name, size: file.size, type: file.type };

    toast.info(`Uploading ${file.name} (${fileSizeMB} MB)...`);

    const conversationKey = !isRoomTarget && activeConversationId && currentUser
      ? [currentUser.id, activeConversationId].sort().join(':')
      : null;

    if (isRoomTarget && roomIdForUpload) {
      const placeholder: RoomMessage = {
        id: tempMessageId,
        roomId: roomIdForUpload,
        senderId: currentUser.id,
        content: '',
        timestamp: Date.now(),
        type: 'file',
        file: fileMeta,
        progress: 0,
      };
      addRoomMessage(roomIdForUpload, placeholder);
    } else if (conversationKey) {
      const placeholderMessage: MessageType = {
        id: tempMessageId,
        conversationId: conversationKey,
        senderId: currentUser.id,
        content: '',
        timestamp: Date.now(),
        type: 'file',
        file: fileMeta,
        progress: 0,
      };
      addMessage(placeholderMessage);
    }

    try {
      const payload = isRoomTarget
        ? { roomId: targetId, file: fileMeta }
        : { recipientId: targetId, file: fileMeta };

      const { fileId } = await api<{ fileId: string }>('/api/files/initiate', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const estimatedTime = Math.ceil((totalChunks * 1.5) / 60);
      const startTime = Date.now();
      let completedChunks = 0;

      console.log(`[Upload] Starting: ${totalChunks} chunks (${CONCURRENT_UPLOADS} parallel, ~${estimatedTime} min)`);

      const targetHeader = isRoomTarget
        ? { key: 'X-Room-Id', value: targetId }
        : { key: 'X-Recipient-Id', value: targetId };

      const updateProgress = (progress: number) => {
        if (isRoomTarget && roomIdForUpload) {
          updateRoomMessageProgress(roomIdForUpload, tempMessageId, progress);
        } else if (conversationKey) {
          updateMessageProgress(conversationKey, tempMessageId, progress);
        }
      };

      const uploadChunksInParallel = async () => {
        const queue: number[] = Array.from({ length: totalChunks }, (_, i) => i);
        const activeUploads: Set<Promise<void>> = new Set();

        while (queue.length > 0 || activeUploads.size > 0) {
          while (activeUploads.size < CONCURRENT_UPLOADS && queue.length > 0) {
            const chunkIndex = queue.shift()!;
            const start = chunkIndex * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            const chunk = file.slice(start, end);

            const uploadPromise = (async () => {
              await uploadChunkWithRetry(fileId, chunkIndex, chunk, currentUser.id, targetHeader, totalChunks);

              completedChunks++;
              const progress = Math.round((completedChunks / totalChunks) * 100);
              updateProgress(progress);

              if (completedChunks % 10 === 0 || completedChunks === totalChunks) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const speed = (completedChunks * CHUNK_SIZE / 1024 / 1024 / (Date.now() - startTime) * 1000).toFixed(2);
                console.log(`[Upload] Progress: ${progress}% (${completedChunks}/${totalChunks} chunks, ${elapsed}s, ${speed} MB/s)`);
              }
            })();

            activeUploads.add(uploadPromise);
            uploadPromise.finally(() => activeUploads.delete(uploadPromise));
          }

          if (activeUploads.size > 0) {
            await Promise.race(activeUploads);
          }
        }
      };

      await uploadChunksInParallel();

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const avgSpeed = (file.size / 1024 / 1024 / (Date.now() - startTime) * 1000).toFixed(2);

      toast.success(`${file.name} uploaded successfully!`, {
        description: `${fileSizeMB} MB uploaded in ${totalTime}s (${avgSpeed} MB/s)`,
        duration: 4000,
      });

      updateProgress(100);
    } catch (error) {
      console.error('File upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error('File upload failed', {
        description: `Error: ${errorMessage}. Please try again.`,
        duration: 5000,
      });
      if (isRoomTarget && roomIdForUpload) {
        updateRoomMessageProgress(roomIdForUpload, tempMessageId, -1);
      } else if (conversationKey) {
        updateMessageProgress(conversationKey, tempMessageId, -1);
      }
    }
  };

  const handleSendText = async () => {
    if (!currentUser || !textMessage.trim()) return;
    const trimmed = textMessage.trim();

    if (activeRoomId) {
      const message: RoomMessage = {
        id: generateUUID(),
        roomId: activeRoomId,
        senderId: currentUser.id,
        content: trimmed,
        timestamp: Date.now(),
        type: 'text',
      };

      addRoomMessage(activeRoomId, message);
      setTextMessage('');

      try {
        await api(`/api/rooms/${activeRoomId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: trimmed }),
        });
      } catch (error) {
        console.error('Failed to send room message:', error);
        toast.error('No se pudo enviar el mensaje');
      }
      return;
    }

    if (!activeConversationId) return;

    const convId = [currentUser.id, activeConversationId].sort().join(':');
    const messageId = generateUUID();

    const newMessage: MessageType = {
      id: messageId,
      conversationId: convId,
      senderId: currentUser.id,
      content: trimmed,
      timestamp: Date.now(),
      type: 'text',
    };

    addMessage(newMessage);
    setTextMessage('');

    try {
      await api('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          recipientId: activeConversationId,
          content: trimmed,
        }),
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Add all selected files to the queue
      const fileArray = Array.from(files);
      addFilesToQueue(fileArray);
    }
    if (e.target) e.target.value = '';
  };

  // Add files to upload queue
  const addFilesToQueue = (files: File[]) => {
    const validFiles = files.filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large (max 350MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      setUploadQueue(prev => [...prev, ...validFiles]);
      toast.info(`${validFiles.length} file(s) added to queue`);
    }
  };

  // Remove file from queue
  const removeFromQueue = (index: number) => {
    setUploadQueue(prev => prev.filter((_, i) => i !== index));
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
      // Add all dropped files to the queue
      const fileArray = Array.from(files);
      addFilesToQueue(fileArray);
    }
  };

  // Process upload queue
  useEffect(() => {
    const processQueue = async () => {
      if (uploadQueue.length > 0 && !isUploading) {
        setIsUploading(true);
        const file = uploadQueue[0];

        try {
          await handleSendFile(file);
          // Remove successfully uploaded file from queue
          setUploadQueue(prev => prev.slice(1));
        } catch (error) {
          console.error('File upload failed:', error);
          // Keep file in queue but mark as failed or remove
          setUploadQueue(prev => prev.slice(1));
        } finally {
          setIsUploading(false);
        }
      }
    };

    processQueue();
  }, [uploadQueue, isUploading]);
  const usersById = new Map(users.map(u => [u.id, u]));
  if (currentUser) usersById.set(currentUser.id, currentUser);

  if (!activeConversationId && !activeRoomId) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-slate-50 dark:bg-slate-900/50 text-center p-8">
        {mobileNav && <div className="absolute top-4 left-4">{mobileNav}</div>}
        <Bot size={64} className="text-slate-400 dark:text-slate-600 mb-4" />
        <h2 className="text-2xl font-semibold text-foreground">Bienvenido a Airplay</h2>
        <p className="text-muted-foreground mt-2 max-w-sm">Selecciona un usuario o entra a una sala temporal para comenzar.</p>
      </div>
    );
  }

  if (!isRoomChat && (!activeConversationId || !recipient)) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-slate-50 dark:bg-slate-900/50 text-center p-8">
        {mobileNav && <div className="absolute top-4 left-4">{mobileNav}</div>}
        <Bot size={64} className="text-slate-400 dark:text-slate-600 mb-4" />
        <h2 className="text-2xl font-semibold text-foreground">Sin conversaci�n</h2>
        <p className="text-muted-foreground mt-2 max-w-sm">Elige un destinatario disponible para comenzar.</p>
      </div>
    );
  }

  if (isRoomChat && !activeRoom) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50 dark:bg-slate-900/50">
        <Skeleton className="w-1/2 h-32" />
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
        {isRoomChat && activeRoom ? (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center shadow">
              #{activeRoom.code}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{activeRoom.name}</h2>
              <p className="text-sm text-muted-foreground">
                {activeRoom.participants?.length || 1} participantes • {formatRoomExpiration(activeRoom.expiresAt)}
              </p>
            </div>
          </div>
        ) : (
          recipient && (
            <>
              <UserAvatar user={recipient} isOnline={recipient.online} />
              <div>
                <h2 className="text-lg font-semibold">{recipient.name}</h2>
                <p className="text-sm text-muted-foreground">{recipient.online ? 'Online' : 'Offline'}</p>
              </div>
            </>
          )
        )}
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
              {currentMessages.length > 0 ? (
                currentMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8, y: 50 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 50 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    <Message
                      message={msg}
                      sender={usersById.get(msg.senderId)}
                      context={
                        isRoomChat && activeRoomId
                          ? { type: 'room', roomId: activeRoomId }
                          : { type: 'direct', otherUserId: activeConversationId! }
                      }
                    />
                  </motion.div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>
                    {isRoomChat
                      ? 'Aún no hay archivos en esta sala. Comparte el código para invitar a alguien.'
                      : 'No hay mensajes todavía. Sube un archivo para iniciar la conversación.'}
                  </p>
                </div>
              )}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>

      {/* Upload Queue UI */}
      {uploadQueue.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              Upload Queue ({uploadQueue.length} file{uploadQueue.length !== 1 ? 's' : ''})
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUploadQueue([])}
              className="h-6 text-xs"
              disabled={isUploading}
            >
              Clear All
            </Button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {uploadQueue.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-3 py-2 bg-background rounded border border-slate-200 dark:border-slate-700"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                    {index === 0 && isUploading && ' - Uploading...'}
                  </p>
                </div>
                {index !== 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFromQueue(index)}
                    className="h-6 w-6 p-0 ml-2"
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="p-4 border-t border-slate-200 dark:border-slate-800 bg-background">
        <div className="flex items-center gap-2">
          <input type="file" ref={fileInputRef} onChange={onFileSelect} className="hidden" multiple />
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
