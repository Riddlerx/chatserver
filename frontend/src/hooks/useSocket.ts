import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../store/useChatStore';
import type { Message, User, Room } from '../types/chatTypes';

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const { 
    token, 
    setOnlineUsers, 
    setRooms, 
    addMessage, 
    setMessages, 
    addThreadMessage, 
    setThreadMessages,
    addDMMessage,
    setDMHistory,
    updateMessageReactions,
    isLoggedIn
  } = useChatStore();

  const connect = useCallback(() => {
    if (!token || socketRef.current?.connected) return;

    const socket = io({
      auth: { token },
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('Connected to socket');
    });

    socket.on('userList', (users: User[]) => {
      setOnlineUsers(users);
    });

    socket.on('custom rooms', (rooms: Room[]) => {
      setRooms(rooms);
    });

    socket.on('chat message', (message: Message) => {
      addMessage(message);
    });

    socket.on('messageHistory', (messages: Message[]) => {
      setMessages(messages);
    });

    socket.on('thread message', (message: Message) => {
      addThreadMessage(message);
    });

    socket.on('thread history', ({ messages }: { messages: Message[] }) => {
      setThreadMessages(messages);
    });

    socket.on('receive dm', (message: Message) => {
      addDMMessage(message);
    });

    socket.on('dm history', ({ withUser, messages }: { withUser: string, messages: Message[] }) => {
      setDMHistory(withUser, messages);
    });

    socket.on('reactions updated', ({ messageId, reactions }: { messageId: number, reactions: { emoji: string, count: number }[] }) => {
      updateMessageReactions(messageId, reactions);
    });

    socketRef.current = socket;
  }, [token, setOnlineUsers, setRooms, addMessage, setMessages, addThreadMessage, setThreadMessages, addDMMessage, setDMHistory, updateMessageReactions]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && token) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isLoggedIn, token, connect, disconnect]);

  const sendMessage = useCallback((message: string, roomId: string, parentMessageId?: number | null) => {
    socketRef.current?.emit('sendMessage', { message, roomId, parentMessageId });
  }, []);

  const joinRoom = useCallback((room: string, password?: string) => {
    socketRef.current?.emit('joinRoom', { room, password });
  }, []);

  const sendDM = useCallback((toUser: string, message: string) => {
    socketRef.current?.emit('send dm', { toUser, message });
  }, []);

  const addReaction = useCallback((messageId: number, emoji: string) => {
    socketRef.current?.emit('add reaction', { messageId, emoji });
  }, []);

  const removeReaction = useCallback((messageId: number, emoji: string) => {
    socketRef.current?.emit('remove reaction', { messageId, emoji });
  }, []);

  return {
    sendMessage,
    joinRoom,
    sendDM,
    addReaction,
    removeReaction,
    socket: socketRef.current
  };
};
