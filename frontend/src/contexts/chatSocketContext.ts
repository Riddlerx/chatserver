import { createContext } from 'react';
import type { Socket } from 'socket.io-client';

export interface SocketContextValue {
  socket: Socket | null;
  sendMessage: (message: string, roomId: string, parentMessageId?: number | null) => void;
  sendDM: (toUser: string, message: string) => void;
  joinRoom: (room: string, password?: string) => void;
  loadMoreMessages: (room: string, beforeTimestamp: string) => Promise<void>;
  loadMoreDMs: (withUser: string, beforeTimestamp: string) => Promise<void>;
  addReaction: (messageId: number, emoji: string) => void;
  removeReaction: (messageId: number, emoji: string) => void;
  deleteMessage: (messageId: number, roomId: string) => void;
  deleteDM: (messageId: number) => void;
  editMessage: (messageId: number, newMessage: string, roomId: string) => void;
  editDM: (messageId: number, newMessage: string) => void;
  pinMessage: (messageId: number, roomId: string) => void;
  unpinMessage: (messageId: number, roomId: string) => void;
  getThread: (parent_message_id: number) => void;
  leaveThread: (parent_message_id: number) => void;
}

export const SocketContext = createContext<SocketContextValue | null>(null);
