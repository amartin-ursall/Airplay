export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
export interface User {
  id: string;
  name: string;
  online: boolean;
  lastSeen: number;
}
export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string; // For files, this will be the file ID
  timestamp: number; // epoch millis
  type: 'text' | 'file';
  file?: FileMetadata;
  progress?: number; // 0-100 for upload progress
}
export interface Conversation {
  id: string;
  participants: string[];
  messages: Message[];
}