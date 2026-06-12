const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const logger = require('../logger');
const config = require('../config');

function parseAllowedOrigins(value) {
  if (!value) {
    return ["http://localhost:3000", "http://localhost", "http://127.0.0.1:3000", "http://127.0.0.1"];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isDevelopmentOriginAllowed(origin) {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }

    return /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(hostname);
  } catch (_err) {
    return false;
  }
}

// Middleware for Socket.IO connection authentication
const socketAuthMiddleware = (db, JWT_SECRET) => {
  return async (socket, next) => {
    let token = socket.handshake.auth?.token;
    
    // Fallback to cookie if token is not in auth payload
    if (!token && socket.handshake.headers.cookie) {
      const cookieHeader = socket.handshake.headers.cookie;
      const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
      if (match) {
        token = match[1];
      }
    }

    if (!token) return next(new Error("Authentication token is missing."));

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Fetch user from DB to verify existence and fetch latest data
      const result = await db.query(
        'SELECT username, "displayname" AS "displayName", "profilepicture" AS "profilePicture", role, status FROM users WHERE username = $1',
        [decoded.username]
      );
      const user = result.rows[0];

      if (!user) {
        return next(new Error("User not found or token invalid."));
      }
      
      socket.username = user.username;
      socket.displayName = user.displayName || user.username;
      socket.profilePicture = user.profilePicture || null; // No default image path
      socket.role = user.role || "user";
      socket.status = user.status || "online"; // Default status
      
      next();
    } catch (err) {
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        logger.error({ err }, "Socket Auth JWT Error");
        return next(new Error("Invalid authentication token."));
      }
      logger.error({ err }, "Socket Auth DB Error");
      next(new Error("Server error during authentication."));
    }
  };
};

module.exports = (server, db, rooms, activeSessions) => {
  const io = new Server(server, {
      cors: {
          origin: (origin, callback) => {
            return callback(null, true);
          },
          methods: ["GET", "POST"],
          credentials: true
      },
  });

  // Apply Socket.IO authentication middleware
  io.use(socketAuthMiddleware(db, config.JWT_SECRET));

  // Load socket handlers
  require("../socket_handlers")(io, db, rooms, activeSessions);

  return io;
};
