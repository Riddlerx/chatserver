import { useEffect, useMemo, useRef } from 'react';
import { useChatStore } from '../store/useChatStore';
import MessageItem from './MessageItem';
import { motion, AnimatePresence } from 'framer-motion';

const MessageList = () => {
  const { messages, typingUsers, user, currentDMUser, dmConversations } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayMessages = useMemo(
    () => (currentDMUser ? (dmConversations[currentDMUser] || []) : messages),
    [currentDMUser, dmConversations, messages],
  );

  const filteredTypingUsers = typingUsers.filter(u => u !== (user?.displayName || user?.username));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages, filteredTypingUsers.length]);

  return (
    <div 
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}
    >
      {displayMessages.length === 0 ? (
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'var(--muted)',
          gap: '12px'
        }}>
          <div style={{ fontSize: '48px' }}>{currentDMUser ? '👤' : '💬'}</div>
          <p style={{ fontStyle: 'italic' }}>
            {currentDMUser 
              ? `This is the beginning of your conversation with ${currentDMUser}.` 
              : 'No messages yet. Start the conversation!'}
          </p>
        </div>
      ) : (
        <>
          {displayMessages.map((msg) => (
            <MessageItem key={msg.id || `${msg.timestamp}-${msg.username}`} message={msg} />
          ))}
          
          <AnimatePresence>
            {filteredTypingUsers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                style={{
                  fontSize: '12px',
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  paddingLeft: '52px' // Align with bubble
                }}
              >
                <div style={{ display: 'flex', gap: '3px' }}>
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }}>•</motion.span>
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}>•</motion.span>
                  <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}>•</motion.span>
                </div>
                {filteredTypingUsers.length === 1 
                  ? `${filteredTypingUsers[0]} is typing...`
                  : `${filteredTypingUsers.length} people are typing...`
                }
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};

export default MessageList;
