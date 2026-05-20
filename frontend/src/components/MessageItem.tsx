import { useState, useRef, useEffect } from 'react';
import type { Message } from '../types/chatTypes';
import { useChatStore } from '../store/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Modal from './Modal';
import ProfileModal from './ProfileModal';
import { getAvatarStyle } from '../utils/userUtils';
import { Smile, Check, CheckCheck, Trash2, Pencil, Pin, MessageCircle } from 'lucide-react';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';

interface MessageItemProps {
  message: Message;
}

const MessageItem = ({ message }: MessageItemProps) => {
  const { user, theme, currentDMUser, currentRoom } = useChatStore();
  const { addReaction, removeReaction, deleteMessage, deleteDM, editMessage, editDM, pinMessage, unpinMessage } = useSocket();
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.message);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  
  const isSelf = message.username === user?.username;
  const isImage = message.message.startsWith('/uploads/') || 
                 message.message.includes('giphy.com/media') || 
                 /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(message.message);

  // Resolve relative upload paths to the backend origin (needed when frontend is on Vercel)
  const resolveImageUrl = (url: string) => {
    if (url.startsWith('/uploads/')) {
      return `https://eain.duckdns.org${url}`;
    }
    return url;
  };
  const imageSrc = isImage ? resolveImageUrl(message.message) : message.message;

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

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      if (isDM) {
        deleteDM(message.id);
      } else {
        deleteMessage(message.id, currentRoom);
      }
    }
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.message) {
      if (isDM) {
        editDM(message.id, editContent.trim());
      } else {
        editMessage(message.id, editContent.trim(), currentRoom);
      }
    }
    setIsEditing(false);
  };

  const togglePin = () => {
    if (message.is_pinned) {
      unpinMessage(message.id, currentRoom);
    } else {
      pinMessage(message.id, currentRoom);
    }
  };

  const toggleReaction = (emoji: string) => {
    const existingReaction = message.reactions?.find(r => r.emoji === emoji);
    const hasReacted = existingReaction?.usernames?.includes(user?.username || '');
    
    if (hasReacted) {
      removeReaction(message.id, emoji);
    } else {
      addReaction(message.id, emoji);
    }
  };

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, x: isSelf ? 20 : -20 }}
        animate={{ opacity: 1, x: 0 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          flexDirection: isSelf ? 'row-reverse' : 'row',
          alignItems: 'flex-start',
          gap: '12px',
          maxWidth: '80%',
          alignSelf: isSelf ? 'flex-end' : 'flex-start',
          position: 'relative',
          zIndex: (showEmojiPicker || isHovered) ? 1000 : 1
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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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
            {message.edited && <span style={{ fontStyle: 'italic', opacity: 0.8 }}>(edited)</span>}
            {message.is_pinned && <Pin size={12} style={{ color: 'var(--accent)' }} />}
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
                src={imageSrc} 
                alt="Chat attachment" 
                style={{ maxWidth: '100%', borderRadius: '12px', display: 'block' }} 
              />
            ) : (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={atomDark}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props} style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '4px' }}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {message.message}
              </ReactMarkdown>
            )}

            {isEditing && !isImage && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea 
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    minWidth: '200px',
                    minHeight: '60px',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                    borderRadius: '8px',
                    padding: '8px',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    resize: 'vertical'
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit();
                    }
                    if (e.key === 'Escape') {
                      setIsEditing(false);
                      setEditContent(message.message);
                    }
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={(e) => { e.stopPropagation(); setIsEditing(false); setEditContent(message.message); }} style={{ background: 'transparent', color: 'var(--text)', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
                  <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button>
                </div>
              </div>
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


            {/* Action Buttons Toolbar (appears on hover) */}
            <div 
              style={{
                position: 'absolute',
                top: '-16px',
                [isSelf ? 'right' : 'left']: '16px',
                background: 'var(--panel-bg)',
                border: 'var(--glass-border)',
                borderRadius: '8px',
                padding: '4px',
                display: 'flex',
                gap: '4px',
                opacity: isHovered || showEmojiPicker ? 1 : 0,
                pointerEvents: isHovered || showEmojiPicker ? 'auto' : 'none',
                transition: 'opacity 0.2s',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: 10
              }}
            >
              <button 
                onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }}
                title="Add Reaction"
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'none'}
              >
                <Smile size={16} />
              </button>

              {!isDM && (
                <button 
                  onClick={(e) => { e.stopPropagation(); useChatStore.getState().setActiveRightPanel('thread'); useChatStore.getState().setCurrentThreadId(message.id); }}
                  title="Reply in Thread"
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                >
                  <MessageCircle size={16} />
                </button>
              )}

              {isSelf && !isImage && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                  title="Edit Message"
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                >
                  <Pencil size={16} />
                </button>
              )}

              {!isDM && (
                <button 
                  onClick={(e) => { e.stopPropagation(); togglePin(); }}
                  title={message.is_pinned ? "Unpin Message" : "Pin Message"}
                  style={{ background: 'none', border: 'none', color: message.is_pinned ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                >
                  <Pin size={16} />
                </button>
              )}

              {(isSelf || user?.role === 'admin') && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  title="Delete message"
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {showEmojiPicker && (
              <div 
                ref={emojiPickerRef}
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  [isSelf ? 'right' : 'left']: '16px',
                  marginBottom: '12px',
                  zIndex: 2000
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
              {message.reactions.map((reaction) => {
                const hasReacted = reaction.usernames?.includes(user?.username || '');
                return (
                  <button
                    key={reaction.emoji}
                    onClick={() => toggleReaction(reaction.emoji)}
                    title={reaction.usernames?.join(', ')}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: hasReacted ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                      border: hasReacted ? '1px solid rgba(59, 130, 246, 0.5)' : 'var(--glass-border)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = hasReacted ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.background = hasReacted ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)'}
                  >
                    <span>{reaction.emoji}</span>
                    <span style={{ fontWeight: 700, opacity: 0.7 }}>{reaction.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {message.reply_count && message.reply_count > 0 ? (
            <div 
              style={{
                marginTop: '4px',
                color: 'var(--accent)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-block'
              }}
              onClick={() => {
                useChatStore.getState().setActiveRightPanel('thread');
                useChatStore.getState().setCurrentThreadId(message.id);
              }}
            >
              ↳ View {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
            </div>
          ) : null}
        </div>
      </motion.div>

      <Modal isOpen={isLightboxOpen} onClose={() => setIsLightboxOpen(false)}>
        <img 
          src={imageSrc} 
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
