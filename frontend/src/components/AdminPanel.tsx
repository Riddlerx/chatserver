import { useState, useEffect } from 'react';
import Modal from './Modal';
import api from '../api';
import { Ban, Search } from 'lucide-react';
import { format } from 'date-fns';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const AdminPanel = ({ isOpen, onClose }: AdminPanelProps) => {
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await api.get('/admin/audit-log');
      setAuditLogs(response.data);
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([fetchUsers(), fetchAuditLogs()]).finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleRoleChange = async (username: string, role: string) => {
    try {
      await api.post(`/admin/role/${username}`, { role });
      fetchUsers();
      fetchAuditLogs();
    } catch (err) {
      console.error('Failed to change role', err);
    }
  };

  const handleBan = async (username: string) => {
    const reason = window.prompt(`Reason for banning ${username}:`);
    if (reason !== null) {
      try {
        await api.post('/admin/ban', { username, reason });
        fetchUsers();
        fetchAuditLogs();
      } catch (err) {
        console.error('Failed to ban user', err);
      }
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase()) || 
    (u.displayName && u.displayName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Administrator Panel">
      <div style={{ width: '800px', maxWidth: '100%', height: '600px', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', borderBottom: 'var(--glass-border)' }}>
          <button 
            onClick={() => setActiveTab('users')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'users' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'users' ? 'var(--text)' : 'var(--muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px'
            }}
          >
            User Management
          </button>
          <button 
            onClick={() => setActiveTab('audit')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'audit' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'audit' ? 'var(--text)' : 'var(--muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px'
            }}
          >
            Audit Logs
          </button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
          </div>
        ) : activeTab === 'users' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Search size={16} color="var(--muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Search users..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  borderRadius: '12px',
                  border: 'var(--glass-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredUsers.map((u) => (
                <div key={u.username} style={{ 
                  padding: '12px 16px', 
                  background: 'var(--input-bg)', 
                  borderRadius: '16px',
                  border: 'var(--glass-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      width: '36px', 
                      height: '36px', 
                      borderRadius: '10px', 
                      background: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      backgroundImage: u.profilePicture ? `url(${u.profilePicture})` : 'none',
                      backgroundSize: 'cover'
                    }}>
                      {!u.profilePicture && u.username[0].toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '14px' }}>{u.displayName || u.username}</p>
                      <p style={{ fontSize: '11px', color: 'var(--muted)' }}>@{u.username} • Joined {format(new Date(u.created_at), 'MMM d, yyyy')}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <select 
                      value={u.role} 
                      onChange={(e) => handleRoleChange(u.username, e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: 'var(--glass-border)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    >
                      <option value="user">User</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button 
                      onClick={() => handleBan(u.username)}
                      style={{
                        padding: '8px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex'
                      }}
                      title="Ban User"
                    >
                      <Ban size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: 'var(--glass-border)' }}>
                  <th style={{ padding: '12px 8px' }}>Admin</th>
                  <th style={{ padding: '12px 8px' }}>Action</th>
                  <th style={{ padding: '12px 8px' }}>Target</th>
                  <th style={{ padding: '12px 8px' }}>Reason</th>
                  <th style={{ padding: '12px 8px' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600 }}>{log.admin_username}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ 
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        background: 'var(--accent)', 
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        fontWeight: 700
                      }}>
                        {log.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>{log.target_username || '-'}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--muted)', fontStyle: 'italic' }}>{log.reason || '-'}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--muted)' }}>{format(new Date(log.timestamp), 'MMM d, HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AdminPanel;
