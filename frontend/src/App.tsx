import { useState, useEffect } from 'react';
import { useChatStore } from './store/useChatStore';
import api from './api';
import Auth from './components/Auth';
import Chat from './components/Chat';
import { AnimatePresence } from 'framer-motion';

function App() {
  const { isLoggedIn, setAuth, theme } = useChatStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  useEffect(() => {
    const fetchUser = async () => {
        try {
          const storedUser = localStorage.getItem('user');
          const username = storedUser ? JSON.parse(storedUser).username : null;
          if (username) {
              const response = await api.get(`/profile/${username}`);
              setAuth(response.data);
          }
        } catch (err) {
          console.error("Failed to fetch user profile", err);
          localStorage.removeItem('user');
          setAuth(null);
        }
      setIsInitializing(false);
    };

    fetchUser();
  }, [setAuth]);

  if (isInitializing) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'var(--bg-gradient)'
      }}>
        <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ height: '100vh' }}>
      <AnimatePresence mode="wait">
        {!isLoggedIn ? (
          <Auth key="auth" />
        ) : (
          <Chat key="chat" />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
