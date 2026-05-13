import React, { createContext, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../store/useChatStore';
import type { Message } from '../types/chatTypes';

export const SocketContext = createContext<{
  socket: Socket | null;
  sendMessage: (message: string, roomId: string, parentMessageId?: number | null) => void;
  sendDM: (toUser: string, message: string) => void;
  joinRoom: (room: string, password?: string) => void;
  addReaction: (messageId: number, emoji: string) => void;
  removeReaction: (messageId: number, emoji: string) => void;
} | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  useEffect(() => {
    if (isLoggedIn && token) {
      if (!socketRef.current) {
        const socket = io({
          auth: { token },
          autoConnect: true,
        });

        socket.on('connect', () => {
          console.log('Connected to socket');
          // Join default room on connection
          socket.emit('joinRoom', { room: 'general' });
        });

        socket.on('userList', (users) => {
          setOnlineUsers(users);
        });
// ... (rest of the listeners)

        socket.on('custom rooms', (rooms) => {
          setRooms(rooms);
        });

        socket.on('chat message', (message) => {
          addMessage(message);
        });

        socket.on('messageHistory', (messages) => {
          setMessages(messages);
        });

        socket.on('thread message', (message) => {
          addThreadMessage(message);
        });

        socket.on('thread history', ({ messages }) => {
          setThreadMessages(messages);
        });

        socket.on('receive dm', (message) => {
          addDMMessage(message);
        });

        socket.on('dm history', ({ withUser, messages }) => {
          setDMHistory(withUser, messages);
        });

        socket.on('reactions updated', ({ messageId, reactions }) => {
          updateMessageReactions(messageId, reactions);
        });

        socketRef.current = socket;
      }
    } else {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }
  }, [isLoggedIn, token, setOnlineUsers, setRooms, addMessage, setMessages, addThreadMessage, setThreadMessages, addDMMessage, setDMHistory, updateMessageReactions]);

  const sendMessage = (message: string, roomId: string, parentMessageId?: number | null) => {
    const { user, addMessage } = useChatStore.getState();
    if (!user) return;

    const optimisticMessage: Message = {
      id: Date.now(), 
      room: roomId,
      username: user.username,
      displayName: user.displayName || user.username,
      profilePicture: user.profilePicture,
      message,
      timestamp: new Date().toISOString(),
      status: 'sending',
      parent_message_id: parentMessageId,
    };

    addMessage(optimisticMessage);

    socketRef.current?.emit('sendMessage', { message, roomId, parentMessageId }, (response: any) => {
      if (!response || !response.success) {
        const updatedMessages = useChatStore.getState().messages.map((m): Message =>
          m.id === optimisticMessage.id ? { ...m, status: 'error' as const } : m
        );
        useChatStore.setState({ messages: updatedMessages });
      }
    });
  };

  const joinRoom = (room: string, password?: string) => {
    socketRef.current?.emit('joinRoom', { room, password });
  };

  const sendDM = (toUser: string, message: string) => {
    const { user, addDMMessage } = useChatStore.getState();
    if (!user) return;

    const optimisticMessage: Message = {
      id: Date.now(),
      room: '',
      to: toUser,
      username: user.username,
      displayName: user.displayName || user.username,
      profilePicture: user.profilePicture,
      message,
      timestamp: new Date().toISOString(),
      status: 'sending',
    };

    addDMMessage(optimisticMessage);

    socketRef.current?.emit('send dm', { toUser, message }, (response: any) => {
      if (!response || !response.success) {
        const { dmConversations } = useChatStore.getState();
        const history = dmConversations[toUser] || [];
        const updatedHistory = history.map((m): Message =>
          m.id === optimisticMessage.id ? { ...m, status: 'error' as const } : m
        );
        useChatStore.setState({
          dmConversations: { ...dmConversations, [toUser]: updatedHistory }
        });
      }
    });
  };

  const addReaction = (messageId: number, emoji: string) => {
    socketRef.current?.emit('add reaction', { messageId, emoji });
  };

  const removeReaction = (messageId: number, emoji: string) => {
    socketRef.current?.emit('remove reaction', { messageId, emoji });
  };

  return (
    <SocketContext.Provider value={{ 
      socket: socketRef.current, 
      sendMessage, 
      sendDM, 
      joinRoom, 
      addReaction, 
      removeReaction 
    }}>
      {children}
    </SocketContext.Provider>
  );
};
