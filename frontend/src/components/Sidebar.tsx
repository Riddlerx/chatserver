import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { Hash, Lock, Plus, LogOut, Shield, Search, X } from 'lucide-react';
import ProfileModal from './ProfileModal';
import AdminPanel from './AdminPanel';
import { getAvatarStyle } from '../utils/userUtils';
import api from '../api';
import type { User } from '../types/chatTypes';

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

const Sidebar = ({ mobile = false, onNavigate }: SidebarProps) => {
  const { 
    rooms, 
    currentRoom, 
    setCurrentRoom, 
    logout, 
    user, 
    onlineUsers,
    currentDMUser,
    setCurrentDMUser,
    unreadCounts
  } = useChatStore();
  const { joinRoom, socket } = useSocket();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearching(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      try {
        const response = await api.get<User[]>(`/profile/search?q=${searchQuery}`);
        setSearchResults(response.data);
      } catch (err) {
        console.error('Search failed', err);
      }
    };

    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleRoomClick = (roomName: string) => {
    setCurrentDMUser(null);
    joinRoom(roomName);
    setCurrentRoom(roomName);
    onNavigate?.();
  };

  const handleDMClick = (username: string) => {
    setCurrentRoom('');
    setCurrentDMUser(username);
    setIsSearching(false);
    setSearchQuery('');
    if (socket) {
      socket.emit('get dm history', { withUser: username });
      socket.emit('markDMAsRead', { withUser: username });
    }
    onNavigate?.();
  };

  const Badge = ({ count }: { count: number }) => {
    if (!count || count <= 0) return null;
    return (
      <span style={{
        marginLeft: 'auto',
        background: '#ef4444',
        color: 'white',
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '10px',
        minWidth: '18px',
        textAlign: 'center'
      }}>
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  return (
    <aside style={{
      width: mobile ? '100%' : '260px',
      height: mobile ? '100dvh' : 'auto',
      background: 'var(--sidebar-bg)',
      backdropFilter: 'blur(12px)',
      borderRight: 'var(--glass-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: mobile ? '20px 14px' : '24px 16px',
      boxShadow: mobile ? '18px 0 36px rgba(0,0,0,0.28)' : 'none'
    }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em' }}>CHAT SERVER</h1>
        <button 
          onClick={logout}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--muted)', 
            cursor: 'pointer',
            padding: '4px'
          }}
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* User Search */}
      <div ref={searchRef} style={{ position: 'relative', marginBottom: '24px' }}>
        <div style={{ position: 'relative' }}>
          <Search 
            size={16} 
            style={{ 
              position: 'absolute', 
              left: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: 'var(--muted)'
            }} 
          />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearching(true);
            }}
            onFocus={() => setIsSearching(true)}
            style={{
              width: '100%',
              background: 'var(--input-bg)',
              border: 'var(--glass-border)',
              borderRadius: '12px',
              padding: '10px 12px 10px 36px',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {isSearching && searchQuery.trim().length >= 2 && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'var(--panel)',
            border: 'var(--glass-border)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            zIndex: 100,
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '8px'
          }}>
            {searchResults.length > 0 ? (
              searchResults.map((u) => (
                <button
                  key={u.username}
                  onClick={() => handleDMClick(u.username)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ 
                    width: '24px', 
                    height: '24px', 
                    borderRadius: '8px', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '10px',
                    color: 'white',
                    ...getAvatarStyle(u.profilePicture, u.username)
                  }}>
                    {!u.profilePicture && (u.displayName || u.username)[0].toUpperCase()}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.displayName || u.username}
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0 }}>@{u.username}</p>
                  </div>
                </button>
              ))
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '12px', padding: '12px', margin: 0 }}>
                No users found
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', color: 'var(--muted)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Channels</span>
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <Plus size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {rooms.map((room) => (
            <button
              key={room.name}
              onClick={() => handleRoomClick(room.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '12px',
                border: 'none',
                background: (!currentDMUser && currentRoom === room.name) ? 'var(--accent-gradient)' : 'transparent',
                color: (!currentDMUser && currentRoom === room.name) ? 'white' : 'var(--muted)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                fontWeight: 600,
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              {room.isPrivate ? <Lock size={16} /> : <Hash size={16} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
              <Badge count={unreadCounts[room.name]} />
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '32px', marginBottom: '16px', color: 'var(--muted)' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Direct Messages</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {onlineUsers.filter(u => u.username !== user?.username).map((u) => (
            <button
              key={u.username}
              onClick={() => handleDMClick(u.username)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '12px',
                border: 'none',
                background: currentDMUser === u.username ? 'var(--accent-gradient)' : 'transparent',
                color: currentDMUser === u.username ? 'white' : 'var(--muted)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                fontWeight: 600,
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: u.isOnline ? '#10b981' : 'rgba(255,255,255,0.1)',
                border: u.isOnline ? 'none' : '1px solid currentColor'
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName || u.username}</span>
              <Badge count={unreadCounts[u.username]} />
            </button>
          ))}
        </div>

        {user?.role === 'admin' && (
            <button
              onClick={() => setIsAdminOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '12px',
                border: 'none',
                background: 'rgba(251, 191, 36, 0.1)',
                color: '#fbbf24',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                fontWeight: 600,
                fontSize: '14px',
                marginTop: '32px',
                transition: 'all 0.2s'
              }}
            >
              <Shield size={16} />
              Admin Panel
            </button>
        )}
      </div>

      <div 
        onClick={() => user && setIsProfileOpen(true)}
        style={{ 
          marginTop: 'auto', 
          padding: '16px', 
          background: 'rgba(255,255,255,0.03)', 
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer'
        }}
      >
        <div style={{ 
          width: '32px', 
          height: '32px', 
          borderRadius: '10px', 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '12px',
          color: 'white',
          ...getAvatarStyle(user?.profilePicture, user?.username)
        }}>
          {!user?.profilePicture && user?.username?.[0].toUpperCase()}
        </div>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.displayName || user?.username}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--muted)' }}>{user?.role}</p>
        </div>
      </div>

      {user && (
        <ProfileModal 
          isOpen={isProfileOpen} 
          onClose={() => setIsProfileOpen(false)} 
          targetUsername={user.username} 
        />
      )}

      {user?.role === 'admin' && (
        <AdminPanel 
          isOpen={isAdminOpen} 
          onClose={() => setIsAdminOpen(false)} 
        />
      )}
    </aside>
  );
};

export default Sidebar;
