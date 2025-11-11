import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { User, Conversation, Message, Room, RoomMessage } from '@shared/types';
export type AppState = {
  currentUser: User | null;
  users: User[];
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
  rooms: Record<string, Room>;
  roomMessages: Record<string, RoomMessage[]>;
  activeRoomId: string | null;
};
export type AppActions = {
  setCurrentUser: (user: User) => void;
  setUsers: (users: User[]) => void;
  setActiveConversationId: (userId: string | null) => void;
  setConversation: (conversation: Conversation) => void;
  addMessage: (message: Message) => void;
  updateMessageProgress: (conversationId: string, messageId: string, progress: number) => void;
  setRooms: (rooms: Room[]) => void;
  setRoom: (room: Room) => void;
  setActiveRoomId: (roomId: string | null) => void;
  setRoomMessages: (roomId: string, messages: RoomMessage[]) => void;
  addRoomMessage: (roomId: string, message: RoomMessage) => void;
  updateRoomMessageProgress: (roomId: string, messageId: string, progress: number) => void;
  logout: () => void;
};
export const useAppStore = create<AppState & AppActions>()(
  immer((set) => ({
    currentUser: null,
    users: [],
    conversations: {},
    activeConversationId: null,
    rooms: {},
    roomMessages: {},
    activeRoomId: null,
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
        if (userId) {
          state.activeRoomId = null;
        }
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
    setRooms: (rooms) => {
      set((state) => {
        state.rooms = rooms.reduce<Record<string, Room>>((acc, room) => {
          acc[room.id] = room;
          return acc;
        }, {});
      });
    },
    setRoom: (room) => {
      set((state) => {
        state.rooms[room.id] = room;
      });
    },
    setActiveRoomId: (roomId) => {
      set((state) => {
        state.activeRoomId = roomId;
        if (roomId) {
          state.activeConversationId = null;
        }
      });
    },
    setRoomMessages: (roomId, messages) => {
      set((state) => {
        state.roomMessages[roomId] = messages;
      });
    },
    addRoomMessage: (roomId, message) => {
      set((state) => {
        if (!state.roomMessages[roomId]) {
          state.roomMessages[roomId] = [];
        }
        const exists = state.roomMessages[roomId].some(m => m.id === message.id);
        if (!exists) {
          state.roomMessages[roomId].push(message);
        }
      });
    },
    updateRoomMessageProgress: (roomId, messageId, progress) => {
      set((state) => {
        const messages = state.roomMessages[roomId];
        if (messages) {
          const message = messages.find(m => m.id === messageId);
          if (message) {
            message.progress = progress;
          }
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
        state.activeRoomId = null;
        state.conversations = {};
        state.rooms = {};
        state.roomMessages = {};
        // Keep user list for login screen
      });
    },
  }))
);
