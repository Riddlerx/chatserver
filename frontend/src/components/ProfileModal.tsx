import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { useChatStore } from '../store/useChatStore';
import api from '../api';
import { Camera, Save } from 'lucide-react';
import { getAvatarStyle } from '../utils/userUtils';
import type { User } from '../types/chatTypes';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUsername: string;
}

interface ProfileData extends User {
  bio?: string;
  background?: string;
  created_at?: string;
}

const ProfileModal = ({ isOpen, onClose, targetUsername }: ProfileModalProps) => {
  const { user: currentUser, setAuth, token } = useChatStore();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = currentUser?.username === targetUsername;

  useEffect(() => {
    if (isOpen) {
      const fetchProfile = async () => {
        setLoading(true);
        try {
          const response = await api.get<ProfileData>(`/profile/${targetUsername}`);
          setProfile(response.data);
          setDisplayName(response.data.displayName || '');
          setBio(response.data.bio || '');
          setStatus(response.data.status || '');
        } catch (err) {
          console.error('Failed to fetch profile', err);
        } finally {
          setLoading(false);
        }
      };
      fetchProfile();
    }
  }, [isOpen, targetUsername]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post(`/profile/${targetUsername}`, {
        displayName,
        bio,
        status
      });
      if (isOwnProfile && currentUser) {
        setAuth({ ...currentUser, displayName, profilePicture: profile?.profilePicture ?? currentUser.profilePicture }, token);
      }
      onClose();
    } catch (err) {
      console.error('Failed to update profile', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (response.data.filePath) {
        await api.post(`/profile/${targetUsername}`, {
          profilePicture: response.data.filePath
        });
        setProfile((prev) => (prev ? { ...prev, profilePicture: response.data.filePath } : prev));
        if (isOwnProfile && currentUser) {
          setAuth({ ...currentUser, profilePicture: response.data.filePath }, token);
        }
      }
    } catch (err) {
      console.error('Avatar upload failed', err);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Profile">
      <div style={{ minWidth: '350px', padding: '10px 0' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <span className="spinner" style={{ width: '32px', height: '32px' }}></span>
          </div>
        ) : profile ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: '100px',
                height: '100px',
                borderRadius: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '40px',
                fontWeight: 700,
                color: 'white',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                ...getAvatarStyle(profile.profilePicture, profile.username)
              }}>
                {!profile.profilePicture && (profile.displayName || profile.username)[0].toUpperCase()}
              </div>
              {isOwnProfile && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    position: 'absolute',
                    bottom: '-4px',
                    right: '-4px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'var(--panel)',
                    border: 'var(--glass-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                >
                  <Camera size={16} />
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*"
                    onChange={handleAvatarUpload}
                  />
                </button>
              )}
            </div>

            <div style={{ textAlign: 'center', width: '100%' }}>
              {isOwnProfile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}>Display Name</label>
                    <input 
                      value={displayName} 
                      onChange={(e) => setDisplayName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        border: 'var(--glass-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--text)',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}>Status</label>
                    <input 
                      value={status} 
                      onChange={(e) => setStatus(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        border: 'var(--glass-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--text)',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}>Bio</label>
                    <textarea 
                      value={bio} 
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        border: 'var(--glass-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--text)',
                        outline: 'none',
                        resize: 'none'
                      }}
                    />
                  </div>
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      marginTop: '8px',
                      padding: '12px',
                      background: 'var(--accent-gradient)',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'white',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {saving ? <span className="spinner"></span> : <><Save size={18} /> Save Profile</>}
                  </button>
                </div>
              ) : (
                <>
                  <h2 style={{ margin: '0 0 4px 0' }}>{profile.displayName || profile.username}</h2>
                  <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '16px' }}>@{profile.username}</p>
                  
                  {profile.status && (
                    <div style={{ 
                      padding: '12px', 
                      background: 'var(--input-bg)', 
                      borderRadius: '12px', 
                      marginBottom: '16px',
                      fontStyle: 'italic',
                      fontSize: '14px'
                    }}>
                      "{profile.status}"
                    </div>
                  )}
                  
                  {profile.bio && (
                    <div style={{ textAlign: 'left', fontSize: '14px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px', display: 'block' }}>About</label>
                      <p style={{ lineHeight: 1.5 }}>{profile.bio}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <p>User not found.</p>
        )}
      </div>
    </Modal>
  );
};

export default ProfileModal;
