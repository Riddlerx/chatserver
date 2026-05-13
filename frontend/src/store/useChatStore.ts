import { create } from 'zustand';
import type { User, Message, Room, DMConversation } from '../types/chatTypes';

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
  currentThreadId: number | null;
  threadMessages: Message[];
  
  // DM State
  currentDMUser: string | null;
  dmConversations: DMConversation;
  unreadCounts: { [key: string]: number };
  notifications: Notification[];
  theme: 'dark' | 'light';

  // Actions
  setAuth: (user: User | null, token: string | null) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setCurrentRoom: (room: string) => void;
  setRooms: (rooms: Room[]) => void;
  setOnlineUsers: (users: User[]) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setCurrentThreadId: (id: number | null) => void;
  setThreadMessages: (messages: Message[]) => void;
  addThreadMessage: (message: Message) => void;
  setCurrentDMUser: (username: string | null) => void;
  setDMHistory: (username: string, messages: Message[]) => void;
  addDMMessage: (message: Message) => void;
  updateMessageReactions: (messageId: number, reactions: { emoji: string, count: number }[]) => void;
  incrementUnread: (key: string) => void;
  clearUnread: (key: string) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void;
  markNotificationsAsRead: () => void;
  clearNotifications: () => void;
  logout: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  // Initial State
  user: null,
  token: localStorage.getItem('chatToken'),
  isLoggedIn: false,
  currentRoom: 'general',
  rooms: [],
  onlineUsers: [],
  typingUsers: [],
  messages: [],
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
      unreadCounts: { ...state.unreadCounts, [currentRoom]: 0 } 
    }));
  },
  
  setRooms: (rooms) => set({ rooms }),
  
  setOnlineUsers: (onlineUsers) => {
    const typingUsers = onlineUsers
      .filter(u => u.status === 'typing')
      .map(u => u.displayName || u.username);
    set({ onlineUsers, typingUsers });
  },
  
  setMessages: (messages) => set({ messages }),
  
  addMessage: (message) => set((state) => {
    const isCurrent = state.currentRoom === message.room && !state.currentDMUser;
    const newUnread = { ...state.unreadCounts };
    const newNotifications = [...state.notifications];
    
    const isMention = message.message.includes(`@${state.user?.username}`) || 
                      (state.user?.displayName && message.message.includes(`@${state.user.displayName}`));

    if (!isCurrent) {
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
      messages: isCurrent ? [...state.messages, message] : state.messages,
      unreadCounts: newUnread,
      notifications: newNotifications.slice(0, 50) // Keep last 50
    };
  }),
  
  setCurrentThreadId: (currentThreadId) => set({ currentThreadId, threadMessages: [] }),
  
  setThreadMessages: (threadMessages) => set({ threadMessages }),
  
  addThreadMessage: (message) => set((state) => ({
    threadMessages: state.currentThreadId === message.parent_message_id ? [...state.threadMessages, message] : state.threadMessages
  })),
  
  setCurrentDMUser: (currentDMUser) => set((state) => ({ 
    currentDMUser, 
    unreadCounts: currentDMUser ? { ...state.unreadCounts, [currentDMUser]: 0 } : state.unreadCounts 
  })),
  
  setDMHistory: (username, messages) => set((state) => ({
    dmConversations: { ...state.dmConversations, [username]: messages }
  })),
  
  addDMMessage: (message) => set((state) => {
    const isFromMe = message.username === state.user?.username;
    const otherUser = isFromMe ? (state.currentDMUser || '') : message.username;
    const isCurrent = state.currentDMUser === otherUser;
    const history = state.dmConversations[otherUser] || [];
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
        [otherUser]: [...history, message]
      },
      unreadCounts: newUnread,
      notifications: newNotifications.slice(0, 50)
    };
  }),

  updateMessageReactions: (messageId, reactions) => set((state) => ({
    messages: state.messages.map(m => m.id === messageId ? { ...m, reactions } : m),
    threadMessages: state.threadMessages.map(m => m.id === messageId ? { ...m, reactions } : m)
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
    }, ...state.notifications].slice(0, 50)
  })),

  markNotificationsAsRead: () => set((state) => ({
    notifications: state.notifications.map(n => ({ ...n, read: true }))
  })),

  clearNotifications: () => set({ notifications: [] }),

  logout: () => {
    localStorage.removeItem('chatToken');
    set({ user: null, token: null, isLoggedIn: false, messages: [], rooms: [], onlineUsers: [], unreadCounts: {}, notifications: [] });
  }
}));
