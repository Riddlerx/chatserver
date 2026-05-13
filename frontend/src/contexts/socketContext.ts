import { createContext } from 'react';
import type { Socket } from 'socket.io-client';

export interface SocketContextValue {
  socket: Socket | null;
  sendMessage: (message: string, roomId: string, parentMessageId?: number | null) => void;
  sendDM: (toUser: string, message: string) => void;
  joinRoom: (room: string, password?: string) => void;
  addReaction: (messageId: number, emoji: string) => void;
  removeReaction: (messageId: number, emoji: string) => void;
}

export const SocketContext = createContext<SocketContextValue | null>(null);
