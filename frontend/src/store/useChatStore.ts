import { create } from 'zustand';
import type { User, Message, Room, Reaction } from '../types/chatTypes';

export interface Notification {
  id: string;
  type: 'mention' | 'dm' | 'system';
  title: string;
  content: string;
  timestamp: string;
  read: boolean;
  link?: { type: 'room' | 'dm', value: string };
}

interface ChatState {
  // Auth State
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;

  // UI State
  currentRoom: string;
  rooms: Room[];
  onlineUsers: User[];
  typingUsers: string[];
  
  // Message State
  messages: Message[];
  hasMoreMessages: boolean;
  currentThreadId: number | null;
  threadMessages: Message[];
  
  // DM State
  currentDMUser: string | null;
  dmConversations: { [username: string]: { messages: Message[], hasMore: boolean } };
  unreadCounts: { [key: string]: number };
  notifications: Notification[];
  theme: 'dark' | 'light';

  // Actions
  setAuth: (user: User | null, token: string | null) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setCurrentRoom: (room: string) => void;
  setRooms: (rooms: Room[]) => void;
  setOnlineUsers: (users: User[]) => void;
  updateUserProfile: (username: string, updates: Partial<User>) => void;
  setMessages: (messages: Message[], hasMore?: boolean) => void;
  prependMessages: (messages: Message[], hasMore: boolean) => void;
  addMessage: (message: Message) => void;
  setCurrentThreadId: (id: number | null) => void;
  setThreadMessages: (messages: Message[]) => void;
  addThreadMessage: (message: Message) => void;
  setCurrentDMUser: (username: string | null) => void;
  setDMHistory: (username: string, messages: Message[], hasMore: boolean) => void;
  prependDMMessages: (username: string, messages: Message[], hasMore: boolean) => void;
  addDMMessage: (message: Message) => void;
  setDMRead: (username: string, at: string) => void;
  setUnreadCounts: (counts: { [key: string]: number }) => void;
  updateMessageReactions: (messageId: number, reactions: Reaction[]) => void;
  incrementUnread: (key: string) => void;
  clearUnread: (key: string) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void;
  markNotificationsAsRead: () => void;
  clearNotifications: () => void;
  logout: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  // Initial State
  user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null,
  token: localStorage.getItem('chatToken'),
  isLoggedIn: !!localStorage.getItem('chatToken'),
  currentRoom: 'general',
  rooms: [],
  onlineUsers: [],
  typingUsers: [],
  messages: [],
  hasMoreMessages: false,
  currentThreadId: null,
  threadMessages: [],
  currentDMUser: null,
  dmConversations: {},
  unreadCounts: {},
  notifications: [],
  theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',

  // Actions
  setAuth: (user, token) => {
    if (token) localStorage.setItem('chatToken', token);
    else localStorage.removeItem('chatToken');
    
    if (user) localStorage.setItem('user', JSON.stringify(user));
    else localStorage.removeItem('user');
    
    set({ user, token, isLoggedIn: !!user });
  },

  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },
  
  setCurrentRoom: (currentRoom) => {
    set((state) => ({ 
      currentRoom, 
      messages: [], 
      hasMoreMessages: false,
      unreadCounts: { ...state.unreadCounts, [currentRoom]: 0 } 
    }));
  },
  
  setRooms: (rooms) => set({ rooms }),
  
  setOnlineUsers: (onlineUsers) => {
    if (!Array.isArray(onlineUsers)) return;
    
    const typingUsers = onlineUsers
      .filter(u => u && u.status === 'typing')
      .map(u => u.displayName || u.username);
      
    set((state) => {
      const currentMessages = Array.isArray(state.messages) ? state.messages : [];
      const currentThreadMessages = Array.isArray(state.threadMessages) ? state.threadMessages : [];

      // Sync messages with updated user profile info
      const updatedMessages = currentMessages.map(message => {
        const user = onlineUsers.find(u => u.username === message.username);
        if (user) {
          return {
            ...message,
            displayName: user.displayName || user.username,
            profilePicture: user.profilePicture
          };
        }
        return message;
      });

      const updatedThreadMessages = currentThreadMessages.map(message => {
        const user = onlineUsers.find(u => u.username === message.username);
        if (user) {
          return {
            ...message,
            displayName: user.displayName || user.username,
            profilePicture: user.profilePicture
          };
        }
        return message;
      });

      const updatedDMConversations = { ...state.dmConversations };
      Object.keys(updatedDMConversations).forEach(userKey => {
        const conversation = updatedDMConversations[userKey];
        if (conversation && Array.isArray(conversation.messages)) {
          updatedDMConversations[userKey] = {
            ...conversation,
            messages: conversation.messages.map(message => {
              const user = onlineUsers.find(u => u.username === message.username);
              if (user) {
                return {
                  ...message,
                  displayName: user.displayName || user.username,
                  profilePicture: user.profilePicture
                };
              }
              return message;
            })
          };
        }
      });

      return { 
        onlineUsers, 
        typingUsers, 
        messages: updatedMessages, 
        threadMessages: updatedThreadMessages,
        dmConversations: updatedDMConversations
      };
    });
  },

  updateUserProfile: (username, updates) => set((state) => {
    const user = state.user?.username === username ? { ...state.user, ...updates } : state.user;
    const onlineUsers = (state.onlineUsers || []).map((onlineUser) =>
      onlineUser.username === username ? { ...onlineUser, ...updates } : onlineUser
    );
    const messages = (state.messages || []).map((message) =>
      message.username === username
        ? {
            ...message,
            displayName: updates.displayName ?? message.displayName,
            profilePicture: updates.profilePicture ?? message.profilePicture,
          }
        : message
    );
    const threadMessages = (state.threadMessages || []).map((message) =>
      message.username === username
        ? {
            ...message,
            displayName: updates.displayName ?? message.displayName,
            profilePicture: updates.profilePicture ?? message.profilePicture,
          }
        : message
    );
    const dmConversations = Object.fromEntries(
      Object.entries(state.dmConversations || {}).map(([key, data]) => {
        if (!data || !Array.isArray(data.messages)) return [key, data];
        return [
          key,
          {
            ...data,
            messages: data.messages.map((message) =>
              message.username === username
                ? {
                    ...message,
                    displayName: updates.displayName ?? message.displayName,
                    profilePicture: updates.profilePicture ?? message.profilePicture,
                  }
                : message
            )
          }
        ];
      })
    );

    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }

    return { user, onlineUsers, messages, threadMessages, dmConversations };
  }),
  
  setMessages: (messages, hasMore = false) => set({ 
    messages: Array.isArray(messages) ? messages : [], 
    hasMoreMessages: hasMore 
  }),

  prependMessages: (newMessages, hasMore) => set((state) => ({
    messages: [...(Array.isArray(newMessages) ? newMessages : []), ...(Array.isArray(state.messages) ? state.messages : [])],
    hasMoreMessages: hasMore
  })),
  
  addMessage: (message) => set((state) => {
    const currentMessages = Array.isArray(state.messages) ? state.messages : [];
    
    // Check if this message is a confirmation of an optimistic message
    const existingIndex = currentMessages.findIndex(m => 
      m.status === 'sending' && m.message === message.message && m.username === message.username
    );

    if (existingIndex !== -1) {
      const newMessages = [...currentMessages];
      newMessages[existingIndex] = { ...message, status: 'sent' };
      return { messages: newMessages };
    }

    const isCurrentRoom = state.currentRoom === message.room && !state.currentDMUser;
    const newUnread = { ...state.unreadCounts };
    const newNotifications = [...state.notifications];

    const isMention = message.message.includes(`@${state.user?.username}`) || 
                      (state.user?.displayName && message.message.includes(`@${state.user.displayName}`));

    if (!isCurrentRoom && message.room) {
      newUnread[message.room] = (newUnread[message.room] || 0) + 1;

      if (isMention) {
        newNotifications.unshift({
          id: Math.random().toString(36).substr(2, 9),
          type: 'mention',
          title: `Mentioned in #${message.room}`,
          content: `${message.displayName || message.username}: ${message.message}`,
          timestamp: new Date().toISOString(),
          read: false,
          link: { type: 'room', value: message.room }
        });
      }
    }
    return {
      messages: isCurrentRoom ? [...currentMessages, message] : currentMessages,
      unreadCounts: newUnread,
      notifications: newNotifications.slice(0, 50)
    };
  }),

  
  setCurrentThreadId: (currentThreadId) => set({ currentThreadId, threadMessages: [] }),
  
  setThreadMessages: (threadMessages) => set({ 
    threadMessages: Array.isArray(threadMessages) ? threadMessages : [] 
  }),
  
  addThreadMessage: (message) => set((state) => {
    const currentThreadMessages = Array.isArray(state.threadMessages) ? state.threadMessages : [];
    return {
      threadMessages: state.currentThreadId === message.parent_message_id 
        ? [...currentThreadMessages, message] 
        : currentThreadMessages
    };
  }),
  
  setCurrentDMUser: (currentDMUser) => set((state) => ({ 
    currentDMUser, 
    unreadCounts: currentDMUser ? { ...state.unreadCounts, [currentDMUser]: 0 } : state.unreadCounts 
  })),
  
  setDMHistory: (username, messages, hasMore) => set((state) => ({
    dmConversations: { ...state.dmConversations, [username]: { messages: Array.isArray(messages) ? messages : [], hasMore } }
  })),

  prependDMMessages: (username, newMessages, hasMore) => set((state) => {
    const current = state.dmConversations[username] || { messages: [], hasMore: false };
    const currentHistory = Array.isArray(current.messages) ? current.messages : [];
    return {
      dmConversations: {
        ...state.dmConversations,
        [username]: {
          messages: [...(Array.isArray(newMessages) ? newMessages : []), ...currentHistory],
          hasMore
        }
      }
    };
  }),
  
  addDMMessage: (message) => set((state) => {
    // If it's a confirmation of an optimistic message, replace it
    const recipient = message.to || (state.currentDMUser && message.username === state.user?.username ? state.currentDMUser : message.username);
    const data = state.dmConversations[recipient] || { messages: [], hasMore: false };
    const history = Array.isArray(data.messages) ? data.messages : [];
    
    const existingIndex = history.findIndex(m => 
      m.status === 'sending' && m.message === message.message && m.username === message.username
    );

    if (existingIndex !== -1) {
      const updatedHistory = [...history];
      updatedHistory[existingIndex] = { ...message, status: 'sent' };
      return {
        dmConversations: {
          ...state.dmConversations,
          [recipient]: { ...data, messages: updatedHistory }
        }
      };
    }

    const isFromMe = message.username === state.user?.username;
    const otherUser = isFromMe ? (state.currentDMUser || '') : message.username;
    const isCurrent = state.currentDMUser === otherUser;
    const currentData = state.dmConversations[otherUser] || { messages: [], hasMore: false };
    const currentHistoryData = Array.isArray(currentData.messages) ? currentData.messages : [];
    const newUnread = { ...state.unreadCounts };
    const newNotifications = [...state.notifications];

    if (!isCurrent && !isFromMe) {
      newUnread[otherUser] = (newUnread[otherUser] || 0) + 1;
      newNotifications.unshift({
        id: Math.random().toString(36).substr(2, 9),
        type: 'dm',
        title: `Message from ${message.displayName || message.username}`,
        content: message.message,
        timestamp: new Date().toISOString(),
        read: false,
        link: { type: 'dm', value: otherUser }
      });
    }

    return {
      dmConversations: {
        ...state.dmConversations,
        [otherUser]: {
          ...currentData,
          messages: [...currentHistoryData, message]
        }
      },
      unreadCounts: newUnread,
      notifications: newNotifications.slice(0, 50)
    };
  }),

  setDMRead: (username, at) => set((state) => {
    const data = state.dmConversations[username];
    if (!data || !Array.isArray(data.messages)) return state;

    return {
      dmConversations: {
        ...state.dmConversations,
        [username]: {
          ...data,
          messages: data.messages.map(m => 
            m.username === state.user?.username && !m.read_at ? { ...m, read_at: at } : m
          )
        }
      }
    };
  }),

  setUnreadCounts: (unreadCounts) => set({ unreadCounts: unreadCounts || {} }),

  updateMessageReactions: (messageId, reactions) => set((state) => ({
    messages: (state.messages || []).map(m => m.id === messageId ? { ...m, reactions } : m),
    threadMessages: (state.threadMessages || []).map(m => m.id === messageId ? { ...m, reactions } : m)
  })),

  incrementUnread: (key) => set((state) => ({
    unreadCounts: { ...state.unreadCounts, [key]: (state.unreadCounts[key] || 0) + 1 }
  })),

  clearUnread: (key) => set((state) => ({
    unreadCounts: { ...state.unreadCounts, [key]: 0 }
  })),

  addNotification: (notification) => set((state) => ({
    notifications: [{
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      read: false
    }, ...(state.notifications || [])].slice(0, 50)
  })),

  markNotificationsAsRead: () => set((state) => ({
    notifications: (state.notifications || []).map(n => ({ ...n, read: true }))
  })),

  clearNotifications: () => set({ notifications: [] }),

  logout: () => {
    localStorage.removeItem('chatToken');
    set({ user: null, token: null, isLoggedIn: false, messages: [], rooms: [], onlineUsers: [], unreadCounts: {}, notifications: [] });
  }
}));
