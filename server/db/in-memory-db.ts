import type { User, Conversation, Message } from '../../shared/types';

/**
 * Base de datos en memoria para almacenar usuarios y conversaciones
 * Los mensajes y archivos se persisten en el sistema de archivos
 */
class InMemoryDB {
  private users: Map<string, User> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private fileUploads: Map<string, {
    meta: any;
    chunks: Map<number, ArrayBuffer>;
    totalChunks: number;
    uploadedChunks: number;
    uploadedAt: number | null;
  }> = new Map();

  // ========== USERS ==========

  createUser(user: User): void {
    this.users.set(user.id, user);
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  getUserByName(name: string): User | undefined {
    const normalizedName = name.trim().toLowerCase();
    return Array.from(this.users.values()).find(
      user => user.name.trim().toLowerCase() === normalizedName
    );
  }

  updateUserLastSeen(userId: string, lastSeen: number): void {
    const user = this.users.get(userId);
    if (user) {
      user.lastSeen = lastSeen;
      this.users.set(userId, user);
    }
  }

  setUserOnline(userId: string, online: boolean): void {
    const user = this.users.get(userId);
    if (user) {
      user.online = online;
      this.users.set(userId, user);
    }
  }

  // ========== CONVERSATIONS ==========

  static getConversationId(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join(':');
  }

  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  createConversation(conversation: Conversation): void {
    this.conversations.set(conversation.id, conversation);
  }

  addMessageToConversation(conversationId: string, message: Message): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.messages.push(message);
      this.conversations.set(conversationId, conversation);
    }
  }

  getConversationMessages(conversationId: string): Message[] {
    const conversation = this.conversations.get(conversationId);
    return conversation ? conversation.messages : [];
  }

  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  // ========== FILE UPLOADS (Temporary storage for chunked uploads) ==========

  initiateFileUpload(fileId: string, metadata: any, totalChunks: number): void {
    this.fileUploads.set(fileId, {
      meta: metadata,
      chunks: new Map(),
      totalChunks,
      uploadedChunks: 0,
      uploadedAt: null
    });
  }

  addFileChunk(fileId: string, chunkIndex: number, chunkData: ArrayBuffer): boolean {
    const upload = this.fileUploads.get(fileId);
    if (!upload) {
      throw new Error('File upload not initiated');
    }

    upload.chunks.set(chunkIndex, chunkData);
    upload.uploadedChunks++;

    const isComplete = upload.uploadedChunks === upload.totalChunks;
    if (isComplete) {
      upload.uploadedAt = Date.now();
    }

    this.fileUploads.set(fileId, upload);
    return isComplete;
  }

  getFileUpload(fileId: string) {
    return this.fileUploads.get(fileId);
  }

  getCompleteFile(fileId: string): Buffer | null {
    const upload = this.fileUploads.get(fileId);
    if (!upload || upload.uploadedChunks !== upload.totalChunks) {
      return null;
    }

    // Combinar todos los chunks en un solo buffer
    const chunks: Buffer[] = [];
    for (let i = 0; i < upload.totalChunks; i++) {
      const chunk = upload.chunks.get(i);
      if (!chunk) {
        throw new Error(`Missing chunk ${i} for file ${fileId}`);
      }
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  deleteFileUpload(fileId: string): void {
    this.fileUploads.delete(fileId);
  }

  getFileMetadata(fileId: string) {
    const upload = this.fileUploads.get(fileId);
    return upload ? upload.meta : null;
  }
}

// Singleton instance
export const db = new InMemoryDB();
export { InMemoryDB };
