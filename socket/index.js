const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { generateUserColor } = require("../utils/colors");
const rateLimit = require("express-rate-limit");
const { body, param, validationResult } = require('express-validator');

// Middleware for Socket.IO connection authentication
const socketAuthMiddleware = (db, JWT_SECRET) => {
  return (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication token is missing."));

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Fetch user from DB to verify existence and fetch latest data
      db.get(
        "SELECT username, displayName, profilePicture, role, status FROM users WHERE username = ?",
        [decoded.username],
        (err, user) => {
          if (err) {
            console.error("Socket Auth DB Error:", err.message);
            return next(new Error("Server error during authentication."));
          }
          if (!user) {
            return next(new Error("User not found or token invalid."));
          }
          
          socket.username = user.username;
          socket.displayName = user.displayName || user.username;
          socket.profilePicture = user.profilePicture || "/avatars/default.png"; // Default avatar
          socket.role = user.role || "user";
          socket.status = user.status || "online"; // Default status
          
          next();
        }
      );
    } catch (err) {
      console.error("Socket Auth JWT Error:", err.message);
      next(new Error("Invalid authentication token."));
    }
  };
};

// Rate limiting for Socket.IO events
const messageRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Allow 100 messages per user per minute
  message: "Too many messages sent, please try again later.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const connectionRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Allow 50 connection attempts per IP in 15 minutes
    message: "Too many connection attempts, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) => {
      // Ensure IP address is correctly parsed, especially for IPv6 and proxies
      const ip = request.socket.remoteAddress;
      return ip;
    },// Rate limit by IP address
});


module.exports = (server, db, rooms, activeSessions, generateUserColor) => {
  const io = new Server(server, {
      cors: {
          origin: ["http://localhost:3000", "http://localhost", "http://168.138.212.140"],
          methods: ["GET", "POST"]
      },
  });

  // Apply connection rate limiter
  io.engine.on("connection", (conn) => {
      connectionRateLimiter(conn.request, {}, () => { /* Allow connection if rate limit not exceeded */ });
  });
    
  // Apply Socket.IO authentication middleware
  io.use(socketAuthMiddleware(db, process.env.JWT_SECRET));

  // Load socket handlers
  require("../socket_handlers")(io, db, rooms, activeSessions, generateUserColor);

  return io;
};
