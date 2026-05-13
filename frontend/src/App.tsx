import { useState, useEffect } from 'react';
import { useChatStore } from './store/useChatStore';
import Auth from './components/Auth';
import Chat from './components/Chat';
import { AnimatePresence } from 'framer-motion';

function App() {
  const { isLoggedIn, setAuth, token, theme } = useChatStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  useEffect(() => {
    const checkToken = async () => {
      if (token) {
        try {
          // Decode token to get user info (basic way)
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload && payload.username) {
            setAuth({
              username: payload.username,
              role: payload.role || 'user',
              displayName: payload.displayName,
              profilePicture: payload.profilePicture
            }, token);
          }
        } catch {
          localStorage.removeItem('chatToken');
        }
      }
      setIsInitializing(false);
    };

    checkToken();
  }, [token, setAuth]);

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
