import { useChatStore } from '../store/useChatStore';
import MessageItem from './MessageItem';
import { X, Pin } from 'lucide-react';
import { motion } from 'framer-motion';

const PinnedMessages = () => {
  const { 
    pinnedMessages, 
    setActiveRightPanel 
  } = useChatStore();

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
          <Pin size={20} style={{ color: 'var(--accent)' }} />
          Pinned Messages
        </div>
        <button 
          onClick={() => setActiveRightPanel(null)}
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
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        {pinnedMessages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: '24px', fontSize: '14px' }}>
            No pinned messages in this channel yet.
          </div>
        ) : (
          pinnedMessages.map(msg => (
            <MessageItem key={msg.id} message={msg} />
          ))
        )}
      </div>
    </motion.div>
  );
};

export default PinnedMessages;
