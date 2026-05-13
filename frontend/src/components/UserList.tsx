import { useState } from 'react';
import { useChatStore } from '../store/useChatStore';
import ProfileModal from './ProfileModal';
import { getAvatarStyle } from '../utils/userUtils';

const UserList = () => {
  const { onlineUsers } = useChatStore();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  return (
    <aside style={{
      width: '240px',
      background: 'var(--sidebar-bg)',
      backdropFilter: 'blur(12px)',
      borderLeft: 'var(--glass-border)',
      padding: '24px 16px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h3 style={{ 
        fontSize: '12px', 
        fontWeight: 600, 
        textTransform: 'uppercase', 
        letterSpacing: '0.05em', 
        color: 'var(--muted)',
        marginBottom: '20px'
      }}>
        Online — {onlineUsers.length}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
        {onlineUsers.map((user) => (
          <div 
            key={user.username} 
            onClick={(e) => {
                e.stopPropagation();
                setSelectedUser(user.username);
            }}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              opacity: user.isOnline ? 1 : 0.5,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '8px',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'none'}
          >
            <div style={{ position: 'relative' }}>
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
                ...getAvatarStyle(user.profilePicture ? (user.profilePicture.startsWith('/uploads/') ? user.profilePicture : `/uploads/${user.profilePicture}`) : undefined, user.username)
              }}>
                {!user.profilePicture && (user.displayName || user.username)[0].toUpperCase()}
              </div>
              {user.isOnline && (
                <div style={{ 
                  position: 'absolute', 
                  bottom: '-2px', 
                  right: '-2px', 
                  width: '10px', 
                  height: '10px', 
                  borderRadius: '50%', 
                  background: '#10b981', 
                  border: '2px solid var(--sidebar-bg)' 
                }} />
              )}
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600 }}>
                {user.displayName || user.username}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {user.status || 'Active'}
              </p>
            </div>
          </div>
        ))}
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
