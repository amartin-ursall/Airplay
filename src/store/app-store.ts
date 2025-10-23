import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { User, Conversation, Message } from '@shared/types';
export type AppState = {
  currentUser: User | null;
  users: User[];
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
};
export type AppActions = {
  setCurrentUser: (user: User) => void;
  setUsers: (users: User[]) => void;
  setActiveConversationId: (userId: string | null) => void;
  setConversation: (conversation: Conversation) => void;
  addMessage: (message: Message) => void;
  updateMessageProgress: (conversationId: string, messageId: string, progress: number) => void;
  logout: () => void;
};
export const useAppStore = create<AppState & AppActions>()(
  immer((set) => ({
    currentUser: null,
    users: [],
    conversations: {},
    activeConversationId: null,
    setCurrentUser: (user) => {
      set((state) => {
        state.currentUser = user;
      });
    },
    setUsers: (users) => {
      set((state) => {
        state.users = users;
      });
    },
    setActiveConversationId: (userId) => {
      set((state) => {
        state.activeConversationId = userId;
      });
    },
    setConversation: (conversation) => {
      set((state) => {
        state.conversations[conversation.id] = conversation;
      });
    },
    addMessage: (message) => {
      set((state) => {
        const conversation = state.conversations[message.conversationId];
        if (conversation) {
          // Avoid duplicates
          if (!conversation.messages.some(m => m.id === message.id)) {
            conversation.messages.push(message);
          }
        } else {
          // Create conversation if it doesn't exist
          state.conversations[message.conversationId] = {
            id: message.conversationId,
            participants: [message.senderId, message.conversationId],
            messages: [message]
          };
        }
      });
    },
    updateMessageProgress: (conversationId, messageId, progress) => {
      set((state) => {
        const conversation = state.conversations[conversationId];
        if (conversation) {
          const message = conversation.messages.find(m => m.id === messageId);
          if (message) {
            message.progress = progress;
          }
        }
      });
    },
    logout: () => {
      set((state) => {
        state.currentUser = null;
        state.activeConversationId = null;
        state.conversations = {};
        // Keep user list for login screen
      });
    },
  }))
);