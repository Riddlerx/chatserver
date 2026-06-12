const cors = require('cors');
const { ALLOWED_ORIGINS, NODE_ENV } = require('../config');

console.log("DEBUG: ALLOWED_ORIGINS loaded:", ALLOWED_ORIGINS);

function isDevelopmentOriginAllowed(origin) {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    return /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(hostname);
  } catch (_err) {
    return false;
  }
}

const corsOptions = {
  origin: function (origin, callback) {
    console.log("DEBUG: Incoming Origin:", origin);
    if (!origin || ALLOWED_ORIGINS.includes(origin) || (NODE_ENV === 'development' && isDevelopmentOriginAllowed(origin))) {
      callback(null, true);
    } else {
      console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
      console.error("BLOCKED ORIGIN:", origin);
      console.error("ALLOWED_ORIGINS:", JSON.stringify(ALLOWED_ORIGINS));
      console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

module.exports = cors(corsOptions);
