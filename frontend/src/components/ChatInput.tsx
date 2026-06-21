import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useChatStore } from '../store/useChatStore';
import { Send, Smile, X, Paperclip, FileText, Video, Music } from 'lucide-react';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import GifPicker from './GifPicker';
import api from '../api';

interface ChatInputProps {
  parentMessageId?: number;
}

const ChatInput = ({ parentMessageId }: ChatInputProps = {}) => {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const gifPickerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  
  const { sendMessage, sendDM, socket } = useSocket();
  const { currentRoom, theme, currentDMUser, onlineUsers } = useChatStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (gifPickerRef.current && !gifPickerRef.current.contains(event.target as Node)) {
        setShowGifPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() && !previewImage) return;

    const messageToSend = text.trim();

    // Always send the image/GIF if one is attached
    if (previewImage) {
      if (currentDMUser) {
        sendDM(currentDMUser, previewImage);
      } else {
        sendMessage(previewImage, currentRoom, parentMessageId);
      }
    }

    // Send text as a separate message if there is any
    if (messageToSend) {
      if (currentDMUser) {
        sendDM(currentDMUser, messageToSend);
      } else {
        sendMessage(messageToSend, currentRoom, parentMessageId);
      }
    }

    setText('');
    setPreviewImage(null);
    setShowEmojiPicker(false);
    setShowGifPicker(false);
    textInputRef.current?.focus();

    if (socket) {
      socket.emit('stop typing');
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (response.data.filePath) {
        setPreviewImage(response.data.filePath);
        // Automatically focus back to textarea so Enter works
        setTimeout(() => textInputRef.current?.focus(), 100);
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const handleFileDrop = (e: CustomEvent) => {
      const file = e.detail;
      if (file) {
        uploadFile(file);
      }
    };

    window.addEventListener('chat:file-dropped', handleFileDrop as EventListener);
    return () => window.removeEventListener('chat:file-dropped', handleFileDrop as EventListener);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Mention logic
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }

    if (socket) {
      socket.emit('typing');

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('stop typing');
      }, 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const filteredMentionUsers = onlineUsers.filter(u => 
    u.username.toLowerCase().includes(mentionQuery?.toLowerCase() || '') ||
    u.displayName?.toLowerCase().includes(mentionQuery?.toLowerCase() || '')
  ).slice(0, 5);

  const insertMention = (username: string | undefined) => {
    if (!username || !textInputRef.current) return;
    const cursor = textInputRef.current.selectionStart;
    const textBeforeCursor = text.slice(0, cursor);
    const textAfterCursor = text.slice(cursor);
    const match = textBeforeCursor.match(/@(\w*)$/);
    
    if (match) {
      const start = cursor - match[0].length;
      const newText = text.slice(0, start) + `@${username} ` + textAfterCursor;
      setText(newText);
      setMentionQuery(null);
      setTimeout(() => {
        if (textInputRef.current) {
          textInputRef.current.selectionStart = start + username.length + 2;
          textInputRef.current.selectionEnd = start + username.length + 2;
          textInputRef.current.focus();
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionQuery !== null) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(filteredMentionUsers.length - 1, prev + 1));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentionUsers[mentionIndex]?.username);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      padding: '20px 24px',
      background: 'var(--panel-bg)',
      backdropFilter: 'blur(10px)',
      borderTop: 'var(--glass-border)',
      position: 'relative',
      zIndex: 10
    }}>
      {previewImage && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '24px',
          marginBottom: '12px',
          padding: '8px',
          background: 'var(--panel-bg)',
          borderRadius: '12px',
          border: 'var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: 'var(--glass-shadow)'
        }}>
          {previewImage.match(/\.(mp4|webm)$/i) ? (
            <Video size={40} style={{ color: 'var(--accent)' }} />
          ) : previewImage.match(/\.(mp3|wav)$/i) ? (
            <Music size={40} style={{ color: 'var(--accent)' }} />
          ) : previewImage.match(/\.pdf$/i) ? (
            <FileText size={40} style={{ color: 'var(--accent)' }} />
          ) : (
            <img 
              src={previewImage.startsWith('/uploads/') ? `${import.meta.env.VITE_BASE_URL || 'https://eain.duckdns.org'}${previewImage}` : previewImage} 
              alt="Preview" 
              style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} 
            />
          )}
          <button 
            onClick={() => {
                setPreviewImage(null);
                textInputRef.current?.focus();
            }}
            style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', borderRadius: '50%', padding: '4px', cursor: 'pointer', display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showEmojiPicker && (
        <div 
          ref={emojiPickerRef}
          style={{ position: 'absolute', bottom: '100%', left: '24px', marginBottom: '12px', zIndex: 100 }}
        >
          <EmojiPicker 
            theme={theme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT}
            onEmojiClick={(emojiData) => {
              setText(prev => prev + emojiData.emoji);
              textInputRef.current?.focus();
            }}
          />
        </div>
      )}

      {showGifPicker && (
        <div 
          ref={gifPickerRef}
          style={{ position: 'absolute', bottom: '100%', left: '24px', marginBottom: '12px', zIndex: 100 }}
        >
          <GifPicker 
            onSelect={(url) => {
              setPreviewImage(url);
              setShowGifPicker(false);
              // Focus back to input so Enter works immediately
              setTimeout(() => textInputRef.current?.focus(), 100);
            }}
            onClose={() => {
              setShowGifPicker(false);
              textInputRef.current?.focus();
            }}
          />
        </div>
      )}

      {mentionQuery !== null && filteredMentionUsers.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '24px',
          marginBottom: '12px',
          background: 'var(--panel-bg)',
          border: 'var(--glass-border)',
          borderRadius: '12px',
          padding: '8px',
          boxShadow: 'var(--glass-shadow)',
          zIndex: 100,
          minWidth: '200px'
        }}>
          {filteredMentionUsers.map((u, i) => (
            <div 
              key={u.username}
              onClick={() => insertMention(u.username)}
              onMouseEnter={() => setMentionIndex(i)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: i === mentionIndex ? 'rgba(255,255,255,0.1)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{u.displayName || u.username}</span>
              {u.displayName && <span style={{ color: 'var(--muted)', fontSize: '12px' }}>@{u.username}</span>}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: 'var(--input-bg)',
        padding: '8px 12px',
        borderRadius: '16px',
        border: 'var(--glass-border)'
      }}>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          style={{ display: 'none' }} 
          accept="image/*,video/mp4,video/webm,audio/mpeg,audio/wav,application/pdf"
        />
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}
          title="Upload file"
        >
          {uploading ? <span className="spinner" style={{ width: '20px', height: '20px' }}></span> : <Paperclip size={20} />}
        </button>
        <button 
          type="button" 
          onClick={() => {
            setShowGifPicker(!showGifPicker);
            setShowEmojiPicker(false);
          }}
          style={{ 
            background: 'rgba(255,255,255,0.05)', 
            border: 'var(--glass-border)', 
            color: 'var(--muted)', 
            cursor: 'pointer', 
            display: 'flex',
            padding: '2px 6px',
            borderRadius: '6px',
            fontSize: '10px',
            fontWeight: 800,
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Send a GIF"
        >
          GIF
        </button>
        <button 
          type="button" 
          onClick={() => {
            setShowEmojiPicker(!showEmojiPicker);
            setShowGifPicker(false);
          }}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}
        >
          <Smile size={20} />
        </button>
        
        <textarea 
          ref={textInputRef}
          value={text}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={currentDMUser ? `Message @${currentDMUser}` : `Message #${currentRoom}`}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            color: 'var(--text)',
            fontSize: '14px',
            outline: 'none',
            padding: '8px 0',
            maxHeight: '120px',
            resize: 'none'
          }}
          rows={1}
        />

        <button 
          type="submit" 
          disabled={!text.trim() && !previewImage}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: (text.trim() || previewImage) ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
            border: 'none',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: (text.trim() || previewImage) ? 'pointer' : 'default',
            transition: 'all 0.2s'
          }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default ChatInput;
