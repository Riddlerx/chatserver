import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSocket } from '../hooks/useSocket';
import { useChatStore } from '../store/useChatStore';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import UserList from './UserList';
import ChatInput from './ChatInput';
import Header from './Header';

const Chat = () => {
  // Initialize socket connection
  const { joinRoom } = useSocket();
  const { currentRoom } = useChatStore();

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-gradient)'
      }}
    >
      <Sidebar />
      
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        position: 'relative'
      }}>
        <Header />
        
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
          
          <UserList />
        </div>
      </main>
    </motion.div>
  );
};

export default Chat;
