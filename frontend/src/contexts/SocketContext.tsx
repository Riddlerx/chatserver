import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { useChatStore } from '../store/useChatStore';
import type { Message, Room, User } from '../types/chatTypes';
import { SocketContext } from './socketContext';

interface SocketAckResponse {
  success: boolean;
}

interface ThreadHistoryPayload {
  messages: Message[];
}

type ReactionSummary = NonNullable<Message['reactions']>;

interface ReactionsUpdatedPayload {
  messageId: number;
  reactions: ReactionSummary;
}

// Refresh the access token using the stored refresh token
const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const response = await axios.post('https://eain.duckdns.org/api/auth/refresh', {
      refreshToken,
    });
    const { token } = response.data;
    localStorage.setItem('chatToken', token);
    return token;
  } catch {
    return null;
  }
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const isRefreshingRef = useRef(false);
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
    prependMessages,
    prependDMMessages,
    setDMRead,
    setUnreadCounts,
    updateUserProfile,
    updateMessageReactions,
    removeMessage,
    removeDMMessage,
    currentRoom,
    currentDMUser,
    isLoggedIn 
  } = useChatStore();

  useEffect(() => {
    if (isLoggedIn && token) {
      if (!socketRef.current) {
        const nextSocket = io('https://eain.duckdns.org', {
          auth: { token },
          autoConnect: true,
        });

        nextSocket.on('connect', () => {
          console.log('Connected to socket');
        });

        // Handle auth errors — refresh token and reconnect
        nextSocket.on('connect_error', async (err) => {
          const isAuthError = err.message?.includes('token') || 
                              err.message?.includes('Authentication') ||
                              err.message?.includes('Invalid');
          
          if (isAuthError && !isRefreshingRef.current) {
            isRefreshingRef.current = true;
            console.log('Socket auth failed, attempting token refresh...');
            
            const newToken = await refreshAccessToken();
            isRefreshingRef.current = false;

            if (newToken) {
              // Update socket auth and reconnect
              nextSocket.auth = { token: newToken };
              // Update the store with the new token
              const storedUser = localStorage.getItem('user');
              if (storedUser) {
                useChatStore.getState().setAuth(JSON.parse(storedUser), newToken);
              }
              nextSocket.connect();
            } else {
              // Refresh failed — force logout
              console.log('Token refresh failed, logging out');
              useChatStore.getState().logout();
            }
          }
        });

        nextSocket.on('userList', (users: User[]) => {
          setOnlineUsers(users);
        });

        nextSocket.on('unreadCounts', (counts: { [key: string]: number } = {}) => {
          setUnreadCounts(counts);
        });

        nextSocket.on('dmRead', ({ byUser, at }: { byUser: string, at: string }) => {
          setDMRead(byUser, at);
        });

        nextSocket.on('userStatusChanged', (user: User) => {
          updateUserProfile(user.username, user);
        });

        nextSocket.on('custom rooms', (rooms: Room[]) => {
          setRooms(rooms);
        });

        nextSocket.on('chat message', (message: Message) => {
          addMessage(message);
        });

        nextSocket.on('messageHistory', (data: any) => {
          if (Array.isArray(data)) {
            setMessages(data, false);
          } else if (data && Array.isArray(data.messages)) {
            setMessages(data.messages, !!data.hasMore);
          }
        });

        nextSocket.on('thread message', (message: Message) => {
          addThreadMessage(message);
        });

        nextSocket.on('thread history', ({ messages }: ThreadHistoryPayload) => {
          setThreadMessages(messages);
        });

        nextSocket.on('receive dm', (message: Message) => {
          addDMMessage(message);
        });

        nextSocket.on('dm history', (data: any) => {
          if (data && data.withUser && Array.isArray(data.messages)) {
            setDMHistory(data.withUser, data.messages, !!data.hasMore);
          }
        });

        nextSocket.on('reactions updated', ({ messageId, reactions }: ReactionsUpdatedPayload) => {
          updateMessageReactions(messageId, reactions);
        });

        nextSocket.on('message deleted', ({ id }: { id: number }) => {
          removeMessage(id);
        });

        nextSocket.on('dm deleted', ({ id }: { id: number }) => {
          removeDMMessage(id);
        });

        socketRef.current = nextSocket;
        setSocket(nextSocket);
        }
        } else {
        if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        }
        }
        }, [isLoggedIn, token, setOnlineUsers, setRooms, addMessage, setMessages, addThreadMessage, setThreadMessages, addDMMessage, setDMHistory, prependMessages, prependDMMessages, setDMRead, setUnreadCounts, updateUserProfile, updateMessageReactions, removeMessage, removeDMMessage]);

        // Handle Room Joining on connect or room change
        useEffect(() => {
          if (socket) {
            if (currentDMUser) {
              socket.emit('get dm history', { withUser: currentDMUser });
              socket.emit('markDMAsRead', { withUser: currentDMUser });
            } else if (currentRoom) {
              socket.emit('joinRoom', { room: currentRoom });
              socket.emit('markRoomAsRead', { room: currentRoom });
            }
          }
        }, [socket, currentRoom, currentDMUser]);
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

    socketRef.current?.emit('sendMessage', { message, roomId, parentMessageId }, (response?: SocketAckResponse) => {
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
    socketRef.current?.emit('markRoomAsRead', { room });
  };

  const loadMoreMessages = (room: string, beforeTimestamp: string): Promise<void> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('loadMoreMessages', { room, beforeTimestamp }, (response: { success: boolean, messages: Message[], hasMore: boolean }) => {
        if (response.success) {
          prependMessages(response.messages, response.hasMore);
        }
        resolve();
      });
    });
  };

  const loadMoreDMs = (withUser: string, beforeTimestamp: string): Promise<void> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('loadMoreDMs', { withUser, beforeTimestamp }, (response: { success: boolean, messages: Message[], hasMore: boolean }) => {
        if (response.success) {
          prependDMMessages(withUser, response.messages, response.hasMore);
        }
        resolve();
      });
    });
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

    socketRef.current?.emit('send dm', { toUser, message }, (response?: SocketAckResponse) => {
      if (!response || !response.success) {
        const { dmConversations } = useChatStore.getState();
        const data = dmConversations[toUser] || { messages: [], hasMore: false };
        const history = data.messages;
        const updatedHistory = history.map((m): Message =>
          m.id === optimisticMessage.id ? { ...m, status: 'error' as const } : m
        );
        useChatStore.setState({
          dmConversations: { ...dmConversations, [toUser]: { ...data, messages: updatedHistory } }
        });
      }
    });
  };

  const addReaction = (messageId: number, emoji: string) => {
    socketRef.current?.emit('add reaction', { messageId, emoji });
  };

  const removeReaction = (messageId: number, emoji: string) => {
    if (socket) {
      socket.emit('remove reaction', { messageId, emoji });
    }
  };

  const deleteMessage = (messageId: number, roomId: string) => {
    if (socket) {
      socket.emit('deleteMessage', { messageId, roomId });
    }
  };

  const deleteDM = (messageId: number) => {
    if (socket) {
      socket.emit('delete dm', { messageId });
    }
  };

  return (
    <SocketContext.Provider value={{ 
      socket, 
      sendMessage, 
      sendDM, 
      joinRoom, 
      loadMoreMessages, 
      loadMoreDMs,
      addReaction,
      removeReaction,
      deleteMessage,
      deleteDM
    }}>
      {children}
    </SocketContext.Provider>
  );
};
