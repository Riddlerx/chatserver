const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { RateLimiterMemory } = require("rate-limiter-flexible");

function parseAllowedOrigins(value) {
  if (!value) {
    return ["http://localhost:3000", "http://localhost"];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

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
          socket.profilePicture = user.profilePicture || null; // No default image path
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

// Rate limiting for Socket.IO connections
const connectionRateLimiter = new RateLimiterMemory({
    points: 50,
    duration: 15 * 60, // 15 minutes
});


module.exports = (server, db, rooms, activeSessions, generateUserColor) => {
  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
  const io = new Server(server, {
      cors: {
          origin: allowedOrigins,
          methods: ["GET", "POST"]
      },
  });

  // Apply connection rate limiter
  io.on("connection", async (socket) => {
      try {
          await connectionRateLimiter.consume(socket.handshake.address);
      } catch (err) {
          console.warn(`Connection rate limit exceeded for ${socket.handshake.address}`);
          socket.disconnect(true);
      }
  });
    
  // Apply Socket.IO authentication middleware
  io.use(socketAuthMiddleware(db, process.env.JWT_SECRET));

  // Load socket handlers
  require("../socket_handlers")(io, db, rooms, activeSessions, generateUserColor);

  return io;
};
