import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import UserList from './UserList';
import ChatInput from './ChatInput';
import Header from './Header';
import ThreadPanel from './ThreadPanel';
import PinnedMessages from './PinnedMessages';
import { UploadCloud } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';

const Chat = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserListOpen, setIsUserListOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { activeRightPanel, setActiveRightPanel, isConnected } = useChatStore();

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Only set to false if we're leaving the window or moving back to a non-file type
      if (e.relatedTarget === null) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        window.dispatchEvent(new CustomEvent('chat:file-dropped', { detail: files[0] }));
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

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
          onOpenUsers={() => setActiveRightPanel(activeRightPanel === 'users' ? null : 'users')}
        />
        
        {!isConnected && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.9)',
            color: 'white',
            textAlign: 'center',
            padding: '6px',
            fontSize: '13px',
            fontWeight: 600,
            backdropFilter: 'blur(5px)',
            zIndex: 50
          }}>
            Connection lost. Reconnecting to server...
          </div>
        )}

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            minWidth: 0 
          }}>
            <MessageList />
            <ChatInput />
          </div>
          
          <AnimatePresence>
            {!isMobile && activeRightPanel === 'users' && <UserList key="users" />}
            {!isMobile && activeRightPanel === 'thread' && <ThreadPanel key="thread" />}
            {!isMobile && activeRightPanel === 'pinned' && <PinnedMessages key="pinned" />}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                position: 'absolute',
                inset: '16px',
                background: 'rgba(var(--accent-rgb), 0.1)',
                backdropFilter: 'blur(10px)',
                border: '2px dashed var(--accent)',
                borderRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                zIndex: 1000,
                pointerEvents: 'none'
              }}
            >
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 8px 32px rgba(99, 102, 241, 0.4)'
              }}>
                <UploadCloud size={40} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700 }}>Drop to upload</h3>
              <p style={{ color: 'var(--muted)' }}>Share images instantly</p>
            </motion.div>
          )}
        </AnimatePresence>
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
            transform: (isUserListOpen || activeRightPanel) ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.25s ease',
            zIndex: 50
          }}
        >
          {activeRightPanel === 'thread' && <ThreadPanel />}
          {activeRightPanel === 'pinned' && <PinnedMessages />}
          {(activeRightPanel === 'users' || (!activeRightPanel && isUserListOpen)) && <UserList mobile />}
        </div>
      )}
    </motion.div>
  );
};

export default Chat;
