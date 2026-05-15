import { useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import { getAvatarStyle } from '../utils/userUtils';
import ProfileModal from './ProfileModal';
import type { User } from '../types/chatTypes';

interface UserListProps {
  mobile?: boolean;
}

const UserList = ({ mobile = false }: UserListProps) => {
  const { onlineUsers, user: currentUser } = useChatStore();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const resolvedUsers = onlineUsers.map((onlineUser) =>
    onlineUser.username === currentUser?.username
      ? {
          ...onlineUser,
          displayName: currentUser.displayName ?? onlineUser.displayName,
          profilePicture: currentUser.profilePicture ?? onlineUser.profilePicture,
        }
      : onlineUser
  );

  const typingUsers = resolvedUsers.filter(u => u.isOnline && u.status === 'typing');
  const activeUsers = resolvedUsers.filter(u => u.isOnline && u.status !== 'typing' && u.status?.toLowerCase() !== 'away');
  const awayUsers = resolvedUsers.filter(u => u.isOnline && u.status?.toLowerCase() === 'away');
  const offlineUsers = resolvedUsers.filter(u => !u.isOnline);

  const getStatusColor = (user: User) => {
    if (!user.isOnline) return '#6b7280'; // gray
    if (user.status === 'typing') return '#6366f1'; // indigo/purple
    if (user.status?.toLowerCase() === 'away') return '#f59e0b'; // amber/orange
    return '#10b981'; // green
  };

  const UserItem = ({ user }: { user: User }) => (
    <div 
      onClick={(e) => {
          e.stopPropagation();
          setSelectedUser(user.username);
      }}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px',
        cursor: 'pointer',
        padding: '6px 8px',
        borderRadius: '8px',
        transition: 'background 0.2s',
        opacity: user.isOnline ? 1 : 0.6
      }}
      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseOut={(e) => e.currentTarget.style.background = 'none'}
    >
      <div style={{ position: 'relative' }}>
        <div
          key={`${user.username}:${user.profilePicture || 'default'}`}
          style={{ 
          width: '32px', 
          height: '32px', 
          borderRadius: '10px', 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '12px',
          color: 'white',
          ...getAvatarStyle(user.profilePicture, user.username)
        }}>
          {!user.profilePicture && (user.displayName || user.username)[0].toUpperCase()}
        </div>
        <div style={{ 
          position: 'absolute', 
          bottom: '-2px', 
          right: '-2px', 
          width: '10px', 
          height: '10px', 
          borderRadius: '50%', 
          background: getStatusColor(user), 
          border: '2px solid var(--sidebar-bg)',
          animation: user.status === 'typing' ? 'pulse 1.5s infinite' : 'none'
        }} />
      </div>
      <div style={{ overflow: 'hidden' }}>
        <p style={{ fontSize: '14px', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.displayName || user.username}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.status === 'typing' ? 'typing...' : (user.status || (user.isOnline ? 'Active' : 'Offline'))}
        </p>
      </div>
    </div>
  );

  const Section = ({ title, users, countColor }: { title: string, users: User[], countColor?: string }) => {
    if (users.length === 0) return null;
    return (
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ 
          fontSize: '11px', 
          fontWeight: 600, 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em', 
          color: 'var(--muted)',
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{title}</span>
          <span style={{ 
            background: countColor || 'rgba(255,255,255,0.08)', 
            padding: '2px 6px', 
            borderRadius: '10px', 
            fontSize: '10px',
            color: countColor ? 'white' : 'inherit'
          }}>
            {users.length}
          </span>
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {users.map((user) => <UserItem key={user.username} user={user} />)}
        </div>
      </div>
    );
  };

  return (
    <aside style={{
      width: mobile ? '100%' : '240px',
      background: 'var(--sidebar-bg)',
      backdropFilter: 'blur(12px)',
      borderLeft: 'var(--glass-border)',
      padding: mobile ? '20px 14px' : '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box',
      boxShadow: mobile ? '-18px 0 36px rgba(0,0,0,0.28)' : 'none'
    }}>
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.8; }
          }
        `}
      </style>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
        <Section title="Typing" users={typingUsers} countColor="#6366f1" />
        <Section title="Online" users={activeUsers} />
        <Section title="Away" users={awayUsers} countColor="#f59e0b" />
        <Section title="Offline" users={offlineUsers} />
      </div>

      {selectedUser && (
        <ProfileModal 
          isOpen={!!selectedUser} 
          onClose={() => setSelectedUser(null)} 
          targetUsername={selectedUser} 
        />
      )}
    </aside>
  );
};

export default UserList;
