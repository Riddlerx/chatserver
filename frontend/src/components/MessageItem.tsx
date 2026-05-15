import { useState, useRef, useEffect } from 'react';
import type { Message } from '../types/chatTypes';
import { useChatStore } from '../store/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Modal from './Modal';
import ProfileModal from './ProfileModal';
import { getAvatarStyle } from '../utils/userUtils';
import { Smile, Check, CheckCheck } from 'lucide-react';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';

interface MessageItemProps {
  message: Message;
}

const MessageItem = ({ message }: MessageItemProps) => {
  const { user, theme, currentDMUser } = useChatStore();
  const { addReaction } = useSocket();
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  
  const isSelf = message.username === user?.username;
  const isImage = message.message.startsWith('/uploads/');
  const isDM = !!(currentDMUser || message.to);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleReaction = (emoji: string) => {
    addReaction(message.id, emoji);
  };

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, x: isSelf ? 20 : -20 }}
        animate={{ opacity: 1, x: 0 }}
        style={{
          display: 'flex',
          flexDirection: isSelf ? 'row-reverse' : 'row',
          alignItems: 'flex-start',
          gap: '12px',
          maxWidth: '80%',
          alignSelf: isSelf ? 'flex-end' : 'flex-start',
          position: 'relative'
        }}
      >
        <div 
          onClick={() => setIsProfileOpen(true)}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            color: 'white',
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            ...getAvatarStyle(message.profilePicture, message.username)
          }}
        >
          {!message.profilePicture && (message.displayName || message.username)[0].toUpperCase()}
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isSelf ? 'flex-end' : 'flex-start',
          position: 'relative'
        }}
        onMouseEnter={(e) => {
          const btn = e.currentTarget.querySelector('.reaction-btn') as HTMLElement;
          if (btn) btn.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          const btn = e.currentTarget.querySelector('.reaction-btn') as HTMLElement;
          if (btn && !showEmojiPicker) btn.style.opacity = '0';
        }}
        >
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            marginBottom: '4px',
            fontSize: '11px',
            color: 'var(--muted)'
          }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>
              {message.displayName || message.username}
            </span>
            <span>{format(new Date(message.timestamp), 'HH:mm')}</span>
            {message.edited && <span>(edited)</span>}
            {isSelf && isDM && message.status !== 'error' && (
              <span style={{ display: 'flex', marginLeft: '2px' }}>
                {message.read_at ? (
                  <CheckCheck size={14} color="#3b82f6" />
                ) : (
                  <Check size={14} />
                )}
              </span>
            )}
          </div>

          <div style={{
            padding: isImage ? '8px' : '12px 16px',
            borderRadius: '18px',
            borderTopLeftRadius: !isSelf ? '4px' : '18px',
            borderTopRightRadius: isSelf ? '4px' : '18px',
            background: isSelf ? 'var(--accent-gradient)' : 'var(--bubble-bg)',
            backdropFilter: !isSelf ? 'blur(5px)' : 'none',
            border: !isSelf ? 'var(--glass-border)' : (message.status === 'error' ? '2px solid #ef4444' : 'none'),
            color: isSelf ? 'white' : 'var(--text)',
            fontSize: '14px',
            lineHeight: 1.5,
            wordBreak: 'break-word',
            boxShadow: 'var(--glass-shadow)',
            cursor: isImage ? 'zoom-in' : 'default',
            position: 'relative',
            opacity: message.status === 'sending' ? 0.7 : 1,
            transition: 'opacity 0.2s, border 0.2s'
          }}
          onClick={() => isImage && setIsLightboxOpen(true)}
          >
            {isImage ? (
              <img 
                src={message.message} 
                alt="Chat attachment" 
                style={{ maxWidth: '100%', borderRadius: '12px', display: 'block' }} 
              />
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.message}
              </ReactMarkdown>
            )}
            {message.status === 'error' && (
              <div style={{ 
                fontSize: '10px', 
                color: '#ef4444', 
                fontWeight: 'bold', 
                marginTop: '4px',
                textAlign: 'right'
              }}>
                Failed to send
              </div>
            )}


            {/* Reaction Button (appears on hover) */}
            <button 
              className="reaction-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowEmojiPicker(!showEmojiPicker);
              }}
              style={{
                position: 'absolute',
                top: '0',
                [isSelf ? 'right' : 'left']: 'calc(100% + 8px)',
                background: 'var(--panel-bg)',
                border: 'var(--glass-border)',
                borderRadius: '8px',
                padding: '4px',
                color: 'var(--muted)',
                cursor: 'pointer',
                opacity: showEmojiPicker ? 1 : 0,
                transition: 'opacity 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                zIndex: 2
              }}
            >
              <Smile size={16} />
            </button>

            {showEmojiPicker && (
              <div 
                ref={emojiPickerRef}
                style={{
                  position: 'absolute',
                  top: '100%',
                  [isSelf ? 'right' : 'left']: 0,
                  marginTop: '8px',
                  zIndex: 100
                }}
              >
                <EmojiPicker 
                  theme={theme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                  onEmojiClick={(emojiData) => {
                    toggleReaction(emojiData.emoji);
                    setShowEmojiPicker(false);
                  }}
                  lazyLoadEmojis={true}
                  skinTonesDisabled={true}
                  searchDisabled={true}
                  height={350}
                  width={280}
                />
              </div>
            )}
          </div>

          {/* Reactions Display */}
          {message.reactions && message.reactions.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              marginTop: '4px',
              alignSelf: isSelf ? 'flex-end' : 'flex-start'
            }}>
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() => toggleReaction(reaction.emoji)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.05)',
                    border: 'var(--glass-border)',
                    color: 'var(--text)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  <span>{reaction.emoji}</span>
                  <span style={{ fontWeight: 700, opacity: 0.7 }}>{reaction.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <Modal isOpen={isLightboxOpen} onClose={() => setIsLightboxOpen(false)}>
        <img 
          src={message.message} 
          alt="Full size" 
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '12px' }} 
        />
      </Modal>

      <ProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        targetUsername={message.username} 
      />
    </>
  );
};

export default MessageItem;
