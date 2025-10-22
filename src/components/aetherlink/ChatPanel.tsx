import { useAppStore } from "@/store/app-store";
import { useShallow } from 'zustand/react/shallow';
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { UserAvatar } from "./UserAvatar";
import { Message } from "./Message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Paperclip, Send, Bot } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "@/components/ui/sonner";
import type { Conversation, Message as MessageType } from "@shared/types";
import { motion, AnimatePresence } from "framer-motion";
const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
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
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recipient = users.find(u => u.id === activeConversationId);
  const conversation = activeConversationId ? conversations[activeConversationId] : null;
  useEffect(() => {
    const fetchConversation = async () => {
      if (activeConversationId) {
        setIsLoading(true);
        try {
          const conv = await api<Conversation>(`/api/conversations/${activeConversationId}`);
          setConversation(conv);
        } catch (error) {
          console.error("Failed to fetch conversation:", error);
          toast.error("Could not load conversation.");
        } finally {
          setIsLoading(false);
        }
      }
    };
    fetchConversation();
  }, [activeConversationId, setConversation]);
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [conversation?.messages, isLoading]);
  const handleSendMessage = async () => {
    if (!message.trim() || !currentUser || !activeConversationId) return;
    const tempId = crypto.randomUUID();
    const newMessage: MessageType = {
      id: tempId,
      conversationId: activeConversationId,
      senderId: currentUser.id,
      content: message.trim(),
      timestamp: Date.now(),
      type: 'text',
    };
    addMessage(newMessage);
    setMessage("");
    try {
      await api<MessageType>('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          recipientId: activeConversationId,
          content: message.trim(),
          type: 'text',
        }),
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message.");
    }
  };
  const handleSendFile = async (file: File) => {
    if (!currentUser || !activeConversationId) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File is too large. Maximum size is 1GB.`);
      return;
    }
    const tempMessageId = crypto.randomUUID();
    const placeholderMessage: MessageType = {
      id: tempMessageId,
      conversationId: activeConversationId,
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
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = start + CHUNK_SIZE;
        const chunk = file.slice(start, end);
        const res = await fetch(`/api/files/upload/${fileId}/${i}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-User-Id': currentUser.id },
          body: chunk,
        });
        if (!res.ok) {
          throw new Error('Chunk upload failed');
        }
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        updateMessageProgress(activeConversationId, tempMessageId, progress);
      }
    } catch (error) {
      console.error("File upload failed:", error);
      toast.error("File upload failed. Please try again.");
      updateMessageProgress(activeConversationId, tempMessageId, -1); // Indicate error
    }
  };
  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleSendFile(file);
    }
    if (e.target) e.target.value = '';
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  const usersById = new Map(users.map(u => [u.id, u]));
  if (currentUser) usersById.set(currentUser.id, currentUser);
  if (!activeConversationId || !recipient) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-slate-50 dark:bg-slate-900/50 text-center p-8">
        {mobileNav && <div className="absolute top-4 left-4">{mobileNav}</div>}
        <Bot size={64} className="text-slate-400 dark:text-slate-600 mb-4" />
        <h2 className="text-2xl font-semibold text-foreground">Welcome to AetherLink</h2>
        <p className="text-muted-foreground mt-2 max-w-sm">Select a user from the left panel to start a conversation. Your messages are secure and private.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full">
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
              {conversation?.messages.map((msg) => (
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
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
      <footer className="p-4 border-t border-slate-200 dark:border-slate-800 bg-background">
        <div className="relative">
          <Textarea
            placeholder="Type a message..."
            className="pr-28 min-h-[52px] resize-none"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="absolute top-1/2 right-3 -translate-y-1/2 flex items-center gap-1">
            <input type="file" ref={fileInputRef} onChange={onFileSelect} className="hidden" />
            <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={20} />
            </Button>
            <Button size="icon" onClick={handleSendMessage} disabled={!message.trim()}>
              <Send size={20} />
            </Button>
          </div>
        </div>
      </footer>
      <Toaster richColors />
    </div>
  );
}