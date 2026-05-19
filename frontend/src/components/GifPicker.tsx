import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ImageIcon, AlertCircle } from 'lucide-react';

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

// Ultra-reliable animated Emojis from Google's Noto Emoji project
// These are hosted on fonts.gstatic.com, which is rarely blocked.
const EMOJI_GIFS = [
  { id: 'e1', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f389/512.gif', title: 'Party' },
  { id: 'e2', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.gif', title: 'Laugh' },
  { id: 'e3', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2764_fe0f/512.gif', title: 'Love' },
  { id: 'e4', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44d/512.gif', title: 'Yes' },
  { id: 'e5', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f632/512.gif', title: 'Wow' },
  { id: 'e6', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44b/512.gif', title: 'Hello' },
  { id: 'e7', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60e/512.gif', title: 'Cool' },
  { id: 'e8', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif', title: 'Fire' },
  { id: 'e9', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f973/512.gif', title: 'Celebrate' },
  { id: 'e10', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f680/512.gif', title: 'Rocket' },
  { id: 'e11', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4af/512.gif', title: '100' },
  { id: 'e12', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f64f/512.gif', title: 'Please' },
];

const GifPicker = ({ onSelect, onClose }: GifPickerProps) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState(EMOJI_GIFS);
  const [brokenGifs, setBrokenGifs] = useState<Set<string>>(new Set());

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase();
    setQuery(val);
    
    if (!val) {
      setGifs(EMOJI_GIFS);
      return;
    }

    const filtered = EMOJI_GIFS.filter(g => 
      g.title.toLowerCase().includes(val)
    );
    setGifs(filtered);
  };

  return (
    <div style={{
      width: '320px',
      height: '420px',
      background: 'var(--panel-bg)',
      backdropFilter: 'blur(30px)',
      border: 'var(--glass-border)',
      borderRadius: '24px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: 1000
    }}>
      <div style={{ padding: '16px', borderBottom: 'var(--glass-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input 
            type="text" 
            placeholder="Search Emojis..."
            value={query}
            onChange={handleSearch}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 16px 10px 36px',
              background: 'var(--input-bg)',
              border: 'var(--glass-border)',
              borderRadius: '12px',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px', display: 'flex' }}>
          <X size={24} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {gifs.length === 0 ? (
          <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
            <AlertCircle size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
            <p style={{ fontSize: '13px' }}>No matches found.</p>
          </div>
        ) : (
          gifs.map(gif => (
            <div 
              key={gif.id}
              onClick={() => onSelect(gif.url)}
              style={{
                width: '100%',
                height: '120px',
                borderRadius: '16px',
                overflow: 'hidden',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'all 0.2s',
                border: '1px solid transparent'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              {!brokenGifs.has(gif.id) ? (
                <img 
                  src={gif.url} 
                  alt={gif.title}
                  onError={() => setBrokenGifs(prev => new Set(prev).add(gif.id))}
                  style={{ width: '80%', height: '80%', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <ImageIcon size={24} style={{ opacity: 0.5 }} />
                  <span style={{ fontSize: '10px' }}>Load Failed</span>
                </div>
              )}
              <div style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                right: 8,
                textAlign: 'center',
                fontSize: '10px',
                color: 'var(--muted)',
                fontWeight: 600,
                opacity: 0.8
              }}>
                {gif.title}
              </div>
            </div>
          ))
        )}
      </div>
      
      <div style={{ padding: '12px', fontSize: '11px', color: 'var(--muted)', borderTop: 'var(--glass-border)', textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}>
        Ultra-Stable Emoji GIFs
      </div>
    </div>
  );
};

export default GifPicker;
