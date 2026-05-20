import React, { useState } from 'react';
import { isAxiosError } from 'axios';
import { motion } from 'framer-motion';
import { useChatStore } from '../store/useChatStore';
import api from '../api';
import { LogIn, UserPlus, MessageCircle } from 'lucide-react';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useChatStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const response = await api.post(endpoint, { username, password });
      
      if (response.data.success) {
        if (isLogin) {
          const { token, refreshToken, username: user, role, displayName, profilePicture } = response.data;
          setAuth({ username: user, role, displayName, profilePicture }, token, refreshToken);
        } else {
          setIsLogin(true);
          setPassword('');
          setError('Registration successful! Please login.');
        }
      } else {
        setError(response.data.error || 'Authentication failed');
      }
    } catch (err) {
      setError(isAxiosError<{ error?: string }>(err) ? (err.response?.data?.error || 'Connection error') : 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '40px',
          background: 'var(--panel-bg)',
          backdropFilter: 'blur(10px)',
          borderRadius: '24px',
          border: 'var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
          textAlign: 'center'
        }}
      >
        <div style={{ 
          display: 'inline-flex', 
          padding: '16px', 
          background: 'var(--accent-gradient)', 
          borderRadius: '16px', 
          marginBottom: '24px' 
        }}>
          <MessageCircle size={32} color="white" />
        </div>
        
        <h2 style={{ marginBottom: '8px', fontSize: '24px', fontWeight: 700 }}>
          {isLogin ? 'Welcome Back' : 'Join the Chat'}
        </h2>
        <p style={{ color: 'var(--muted)', marginBottom: '32px' }}>
          {isLogin ? 'Enter your details to continue' : 'Create an account to get started'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input 
            type="text" 
            placeholder="Username" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              border: 'var(--glass-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none'
            }}
            required
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              border: 'var(--glass-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none'
            }}
            required
          />
          
          {error && (
            <p style={{ color: '#ef4444', fontSize: '12px', margin: '4px 0' }}>{error}</p>
          )}

          <button 
            type="submit" 
            disabled={loading}
            style={{
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
              gap: '8px',
              marginTop: '8px'
            }}
          >
            {loading ? (
              <span className="spinner"></span>
            ) : isLogin ? (
              <>
                <LogIn size={18} />
                Sign In
              </>
            ) : (
              <>
                <UserPlus size={18} />
                Create Account
              </>
            )}
          </button>
        </form>

        <p style={{ marginTop: '24px', fontSize: '14px', color: 'var(--muted)' }}>
          {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
          <button 
            onClick={() => setIsLogin(!isLogin)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0
            }}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
