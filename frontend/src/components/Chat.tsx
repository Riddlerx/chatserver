import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import UserList from './UserList';
import ChatInput from './ChatInput';
import Header from './Header';

const Chat = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserListOpen, setIsUserListOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const updateLayout = () => {
      const mobile = mediaQuery.matches;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(false);
        setIsUserListOpen(false);
      }
    };

    updateLayout();
    mediaQuery.addEventListener('change', updateLayout);

    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--bg-gradient)'
      }}
    >
      {!isMobile && <Sidebar />}
      
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        position: 'relative',
        minWidth: 0
      }}>
        <Header
          isMobile={isMobile}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onOpenUsers={() => setIsUserListOpen(true)}
        />
        
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            minWidth: 0 
          }}>
            <MessageList />
            <ChatInput />
          </div>
          
          {!isMobile && <UserList />}
        </div>
      </main>

      {isMobile && (isSidebarOpen || isUserListOpen) && (
        <div
          onClick={() => {
            setIsSidebarOpen(false);
            setIsUserListOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4, 7, 13, 0.72)',
            backdropFilter: 'blur(8px)',
            zIndex: 40
          }}
        />
      )}

      {isMobile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: 'min(320px, 86vw)',
            transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            zIndex: 50
          }}
        >
          <Sidebar onNavigate={() => setIsSidebarOpen(false)} mobile />
        </div>
      )}

      {isMobile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(320px, 86vw)',
            transform: isUserListOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.25s ease',
            zIndex: 50
          }}
        >
          <UserList mobile />
        </div>
      )}
    </motion.div>
  );
};

export default Chat;
