import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useSocket } from '../hooks/useSocket';
import MessageItem from './MessageItem';
import ChatInput from './ChatInput';
import { X, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const ThreadPanel = () => {
  const { 
    currentThreadId, 
    threadMessages, 
    messages,
    setActiveRightPanel,
    setCurrentThreadId
  } = useChatStore();
  const { getThread, leaveThread } = useSocket();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentThreadId) {
      getThread(currentThreadId);
    }
    return () => {
      if (currentThreadId) {
        leaveThread(currentThreadId);
      }
    };
  }, [currentThreadId, getThread, leaveThread]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threadMessages]);

  if (!currentThreadId) return null;

  const parentMessage = messages.find(m => m.id === currentThreadId);

  return (
    <motion.div 
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      style={{
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--panel-bg)',
        borderLeft: 'var(--glass-border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
        zIndex: 20
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: 'var(--glass-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
          <MessageCircle size={20} style={{ color: 'var(--accent)' }} />
          Thread
        </div>
        <button 
          onClick={() => {
            setActiveRightPanel(null);
            setCurrentThreadId(null);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'flex',
            padding: '4px',
            borderRadius: '4px'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'none'}
        >
          <X size={20} />
        </button>
      </div>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        {parentMessage && (
          <div style={{ paddingBottom: '16px', borderBottom: '1px dashed var(--glass-border)' }}>
            <MessageItem message={parentMessage} />
          </div>
        )}

        {threadMessages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: '24px', fontSize: '14px' }}>
            No replies yet. Be the first!
          </div>
        ) : (
          threadMessages.map(msg => (
            <MessageItem key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input */}
      <div style={{ borderTop: 'var(--glass-border)', background: 'var(--panel-bg)' }}>
        <ChatInput parentMessageId={currentThreadId} />
      </div>
    </motion.div>
  );
};

export default ThreadPanel;
