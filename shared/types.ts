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
  content: string; // File ID for 'file' type, text content for 'text' type
  timestamp: number; // epoch millis
  type: 'file' | 'text';
  file?: FileMetadata; // Only for 'file' type
  progress?: number; // 0-100 for upload progress (only for 'file' type)
}
export interface Conversation {
  id: string;
  participants: string[];
  messages: Message[];
}

export interface RoomParticipant {
  userId: string;
  joinedAt: number;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  createdBy: string;
  createdAt: number;
  expiresAt?: number;
  isPermanent: boolean;
  participants: RoomParticipant[];
}

export interface RoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  timestamp: number;
  type: 'file' | 'text';
  file?: FileMetadata;
  progress?: number;
}

export interface ClientErrorReport {
  message: string;
  url: string;
  userAgent: string;
  timestamp: string;
  stack?: string;
  componentStack?: string;
  errorBoundary?: boolean;
  errorBoundaryProps?: Record<string, unknown>;
  source?: string;
  lineno?: number;
  colno?: number;
  error?: unknown;
}
