import { IndexedEntity, Entity } from "./core-utils";
import type { User, Conversation, Message, FileMetadata } from "@shared/types";
export class UserEntity extends IndexedEntity<User> {
  static readonly entityName = "user";
  static readonly indexName = "users";
  static readonly initialState: User = { id: "", name: "", online: false };
  async setOnline(online: boolean): Promise<void> {
    await this.patch({ online });
  }
}
export class ConversationEntity extends Entity<Conversation> {
  static readonly entityName = "conversation";
  static readonly initialState: Conversation = { id: "", participants: [], messages: [] };
  static getConversationId(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join(':');
  }
  async addMessage(senderId: string, content: string, type: 'text' | 'file', file?: FileMetadata): Promise<Message> {
    const message: Message = {
      id: crypto.randomUUID(),
      conversationId: this.id,
      senderId,
      content,
      timestamp: Date.now(),
      type,
      file
    };
    await this.mutate((s) => ({ ...s, messages: [...s.messages, message] }));
    return message;
  }
}