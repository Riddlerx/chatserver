import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { Hash, Settings, Bell, Search, Sun, Moon, AtSign, Trash2, CheckCircle, Menu, Users, Pin } from 'lucide-react';
import api from '../api';
import Modal from './Modal';
import ProfileModal from './ProfileModal';
import { getAvatarStyle } from '../utils/userUtils';
import { format } from 'date-fns';
import type { Message } from '../types/chatTypes';
import type { Notification } from '../store/useChatStore';

type SearchResult = Pick<Message, 'id' | 'username' | 'timestamp' | 'message'>;

interface HeaderProps {
  isMobile?: boolean;
  onOpenSidebar?: () => void;
  onOpenUsers?: () => void;
}

const Header = ({ isMobile = false, onOpenSidebar, onOpenUsers }: HeaderProps) => {
  const { 
    currentRoom, 
    theme, 
    setTheme, 
    user, 
    currentDMUser, 
    notifications, 
    markNotificationsAsRead, 
    clearNotifications,
    setCurrentRoom,
    setCurrentDMUser,
    activeRightPanel,
    setActiveRightPanel
  } = useChatStore();
  const { joinRoom, socket } = useSocket();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setIsSearchOpen(true);
    try {
      const roomParam = currentDMUser ? '' : `&room=${encodeURIComponent(currentRoom)}`;
      const response = await api.get<SearchResult[]>(`/messages/search?q=${encodeURIComponent(searchQuery)}${roomParam}`);
      setSearchResults(response.data);
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.link) {
      if (notification.link.type === 'room') {
        setCurrentDMUser(null);
        joinRoom(notification.link.value);
        setCurrentRoom(notification.link.value);
      } else if (notification.link.type === 'dm') {
        setCurrentRoom('');
        setCurrentDMUser(notification.link.value);
        if (socket) {
          socket.emit('get dm history', { withUser: notification.link.value });
        }
      }
    }
    setIsNotificationsOpen(false);
    markNotificationsAsRead();
  };

  return (
    <header style={{
      height: '64px',
      padding: isMobile ? '0 12px' : '0 24px',
      background: 'var(--panel-bg)',
      backdropFilter: 'blur(10px)',
      borderBottom: 'var(--glass-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 5
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '8px', minWidth: 0 }}>
        {isMobile && (
          <button
            onClick={onOpenSidebar}
            style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', padding: '4px' }}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
        )}
        {currentDMUser ? (
          <>
            <AtSign size={20} color="var(--accent)" />
            <h2 style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentDMUser}</h2>
          </>
        ) : (
          <>
            <Hash size={20} color="var(--accent)" />
            <h2 style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentRoom}</h2>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '16px', minWidth: 0 }}>
        <form onSubmit={handleSearch} style={{ position: 'relative' }}>
          <Search size={18} color="var(--muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="Search messages..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 12px 8px 36px',
              borderRadius: '10px',
              border: 'var(--glass-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: '13px',
              width: isMobile ? '112px' : '200px',
              outline: 'none'
            }}
          />
        </form>
        
        <Modal 
          isOpen={isSearchOpen} 
          onClose={() => setIsSearchOpen(false)}
          title={`Search results for "${searchQuery}"`}
        >
          <div style={{ width: isMobile ? 'calc(100vw - 48px)' : undefined, minWidth: isMobile ? undefined : '400px', maxWidth: '600px' }}>
            {isSearching ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <span className="spinner" style={{ width: '32px', height: '32px' }}></span>
              </div>
            ) : searchResults.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>No messages found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {searchResults.map((msg) => (
                  <div key={msg.id} style={{ 
                    padding: '12px', 
                    background: 'var(--input-bg)', 
                    borderRadius: '12px',
                    border: 'var(--glass-border)'
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700 }}>{msg.username}</span>
                      <span>{format(new Date(msg.timestamp), 'MMM d, HH:mm')}</span>
                    </div>
                    <div style={{ fontSize: '14px' }}>{msg.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>

        <button 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {isMobile && (
          <button
            onClick={onOpenUsers}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}
            aria-label="Open user list"
          >
            <Users size={20} />
          </button>
        )}

        {/* Notification Bell */}
        <div style={{ position: 'relative' }} ref={notificationRef}>
          <button 
            onClick={() => {
              setIsNotificationsOpen(!isNotificationsOpen);
              if (!isNotificationsOpen) markNotificationsAsRead();
            }}
            style={{ background: 'none', border: 'none', color: unreadCount > 0 ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', position: 'relative' }}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: '#ef4444',
                color: 'white',
                fontSize: '9px',
                fontWeight: 700,
                padding: '2px 4px',
                borderRadius: '10px',
                minWidth: '14px',
                border: '2px solid var(--panel-bg)'
              }}>
                {unreadCount}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 15px)',
              right: '-10px',
              width: isMobile ? 'min(320px, calc(100vw - 24px))' : '320px',
              background: 'var(--panel-bg)',
              backdropFilter: 'blur(20px)',
              border: 'var(--glass-border)',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              overflow: 'hidden',
              zIndex: 100
            }}>
              <div style={{ padding: '16px', borderBottom: 'var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>Notifications</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={markNotificationsAsRead} title="Mark all as read" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                    <CheckCircle size={16} />
                  </button>
                  <button onClick={clearNotifications} title="Clear all" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                    <Bell size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
                    <p style={{ fontSize: '13px' }}>No notifications yet</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => handleNotificationClick(n)}
                      style={{ 
                        padding: '16px', 
                        borderBottom: 'rgba(255,255,255,0.03) 1px solid',
                        cursor: 'pointer',
                        background: n.read ? 'transparent' : 'rgba(var(--accent-rgb), 0.05)',
                        transition: 'background 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseOut={(e) => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(var(--accent-rgb), 0.05)'}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px', color: n.read ? 'var(--text)' : 'var(--accent)' }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {n.content}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>
                        {format(new Date(n.timestamp), 'HH:mm')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {!currentDMUser && (
          <button 
            onClick={() => setActiveRightPanel(activeRightPanel === 'pinned' ? null : 'pinned')}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: activeRightPanel === 'pinned' ? 'var(--accent)' : 'var(--muted)', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            title="Pinned Messages"
          >
            <Pin size={20} />
          </button>
        )}

        <button 
          onClick={() => setIsSettingsOpen(true)}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--muted)', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          title="Profile Settings"
        >
          {user && (
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 700,
              color: 'white',
              ...getAvatarStyle(user.profilePicture, user.username)
            }}>
              {!user.profilePicture && (user.displayName || user.username || 'U')[0].toUpperCase()}
            </div>
          )}
          <Settings size={20} />
        </button>
      </div>

      {user && (
        <ProfileModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          targetUsername={user.username} 
        />
      )}
    </header>
  );
};

export default Header;
