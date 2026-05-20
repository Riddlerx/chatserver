import { useEffect, useMemo, useRef, useState, useContext } from 'react';
import { useChatStore } from '../store/useChatStore';
import MessageItem from './MessageItem';
import { motion, AnimatePresence } from 'framer-motion';
import { SocketContext } from '../contexts/socketContext';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';

const MessageList = () => {
  const { messages, typingUsers, user, currentDMUser, dmConversations, hasMoreMessages, currentRoom } = useChatStore();
  const socketContext = useContext(SocketContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { displayMessages, hasMore } = useMemo(() => {
    if (currentDMUser) {
      const data = dmConversations[currentDMUser] || { messages: [], hasMore: false };
      return { displayMessages: data.messages, hasMore: data.hasMore };
    }
    return { displayMessages: messages, hasMore: hasMoreMessages };
  }, [currentDMUser, dmConversations, messages, hasMoreMessages]);

  const filteredTypingUsers = typingUsers.filter(u => u !== (user?.displayName || user?.username));

  // Handle scroll to bottom on new messages
  const lastMessageId = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1].id : null;
  useEffect(() => {
    if (scrollRef.current && !isLoadingMore) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lastMessageId, filteredTypingUsers.length, isLoadingMore]);

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore || !socketContext) return;
    
    setIsLoadingMore(true);
    const firstMessage = displayMessages[0];
    if (firstMessage) {
      const oldScrollHeight = scrollRef.current?.scrollHeight || 0;
      
      if (currentDMUser) {
        await socketContext.loadMoreDMs(currentDMUser, firstMessage.timestamp);
      } else {
        await socketContext.loadMoreMessages(currentRoom, firstMessage.timestamp);
      }
      
      // Preserve scroll position
      setTimeout(() => {
        if (scrollRef.current) {
          const newScrollHeight = scrollRef.current.scrollHeight;
          scrollRef.current.scrollTop = newScrollHeight - oldScrollHeight;
        }
        setIsLoadingMore(false);
      }, 0);
    } else {
      setIsLoadingMore(false);
    }
  };

  const handleScroll = () => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0 && hasMore && !isLoadingMore) {
      handleLoadMore();
    }
  };

  return (
    <div 
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}
    >
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
          <button 
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--muted)',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {isLoadingMore ? 'Loading...' : 'Load older messages'}
          </button>
        </div>
      )}

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
          {displayMessages.map((msg, index) => {
            const currentMessageDate = new Date(msg.timestamp);
            const previousMessage = index > 0 ? displayMessages[index - 1] : null;
            const previousMessageDate = previousMessage ? new Date(previousMessage.timestamp) : null;
            
            const showDateSeparator = !previousMessageDate || !isSameDay(currentMessageDate, previousMessageDate);
            
            return (
              <div key={msg.id || `${msg.timestamp}-${msg.username}`} style={{ display: 'flex', flexDirection: 'column' }}>
                {showDateSeparator && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    margin: '24px 0',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                    <span style={{ 
                      fontSize: '12px', 
                      fontWeight: 600, 
                      color: 'var(--muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      {isToday(currentMessageDate) 
                        ? 'Today' 
                        : isYesterday(currentMessageDate) 
                          ? 'Yesterday' 
                          : format(currentMessageDate, 'MMMM d, yyyy')}
                    </span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                  </div>
                )}
                <MessageItem message={msg} />
              </div>
            );
          })}
          
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
