export interface User {
  username: string;
  displayName?: string;
  profilePicture?: string;
  status?: 'online' | 'offline' | 'typing' | string;
  role: 'user' | 'moderator' | 'admin';
  isOnline?: boolean;
}

export interface Message {
  id: number;
  room?: string;
  to?: string;
  username: string;
  displayName?: string;
  profilePicture?: string;
  message: string;
  timestamp: string;
  edited?: boolean;
  link_preview?: string;
  parent_message_id?: number | null;
  reply_count?: number;
  userColor?: string;
  reactions?: { emoji: string, count: number }[];
  status?: 'sending' | 'sent' | 'error';
}

export interface Reaction {
  emoji: string;
  count: number;
  usernames: string[];
}

export interface Room {
  name: string;
  isPrivate: boolean;
  isCustom?: boolean;
}

export interface DMConversation {
  [username: string]: Message[];
}
