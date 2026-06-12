const cors = require('cors');
const config = require('../config');

const allowedOriginsSet = new Set(config.ALLOWED_ORIGINS || []);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);
    
    if (allowedOriginsSet.has(origin)) {
      return callback(null, true);
    }
    
    // In development mode, allow localhost and 127.0.0.1
    if (config.NODE_ENV === 'development') {
      try {
        const url = new URL(origin);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          return callback(null, true);
        }
      } catch (_) {
        // invalid URL
      }
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

module.exports = cors(corsOptions);

