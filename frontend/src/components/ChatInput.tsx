import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useChatStore } from '../store/useChatStore';
import { Send, Image, Smile, X } from 'lucide-react';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import GifPicker from './GifPicker';
import api from '../api';

const ChatInput = () => {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const gifPickerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  
  const { sendMessage, sendDM, socket } = useSocket();
  const { currentRoom, theme, currentDMUser } = useChatStore();

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
    
    let messageToSend = text.trim();
    
    if (previewImage && !messageToSend) {
        messageToSend = previewImage;
    } else if (previewImage) {
        if (currentDMUser) {
          sendDM(currentDMUser, previewImage);
        } else {
          sendMessage(previewImage, currentRoom);
        }
    }
    
    if (messageToSend) {
        if (currentDMUser) {
          sendDM(currentDMUser, messageToSend);
        } else {
          sendMessage(messageToSend, currentRoom);
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
    setText(e.target.value);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
          <img 
            src={previewImage.startsWith('/uploads/') ? `https://eain.duckdns.org${previewImage}` : previewImage} 
            alt="Preview" 
            style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} 
          />
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
          accept="image/*"
        />
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}
        >
          {uploading ? <span className="spinner" style={{ width: '20px', height: '20px' }}></span> : <Image size={20} />}
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
