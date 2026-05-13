const cors = require('cors');
const { ALLOWED_ORIGINS, NODE_ENV } = require('../config');

const corsOptions = {
  origin: function (origin, callback) {
    // Allow if:
    // 1. No origin (like mobile apps or curl)
    // 2. Origin is in our explicit allowed list
    // 3. It's a localhost origin during development
    const isLocalhost = origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'));
    
    if (!origin || ALLOWED_ORIGINS.includes(origin) || (NODE_ENV === 'development' && isLocalhost)) {
      callback(null, true);
    } else {
      console.error("Blocked by CORS:", origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

module.exports = cors(corsOptions);
