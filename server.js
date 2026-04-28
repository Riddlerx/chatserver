const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const helmet = require('helmet');
const hpp = require('hpp');

const db = require('./db/index'); // Assuming db/index.js sets up and exports the db connection
const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const messageRoutes = require('./routes/message'); // Import router directly
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload'); // Assuming this exists for file uploads
const socketService = require('./socket');

if (!process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined.");
  process.exit(1);
}

dotenv.config();

const app = express();
app.use(helmet());
app.use(hpp());
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Global state for Socket.IO
const rooms = {}; // Stores active users per room: { roomName: Map<username, status> }
const activeSessions = {}; // Stores active sessions: { username: socketId }

// --- Middleware ---
// CORS Configuration
const allowedOrigins = ['http://localhost:3000', 'https://yourdomain.com']; // Replace with actual frontend domains
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};
app.use(cors(corsOptions));

// Body Parsers
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Public folder for static files
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting for HTTP requests
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	message: 'Too many requests from this IP, please try again after 15 minutes',
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use('/api', apiLimiter); // Apply to all routes under /api

// --- Routes ---
// Public routes (e.g., for registration, login)
app.use('/api/auth', authRoutes(db));

// Protected routes (require authentication)
app.use('/api', authMiddleware(process.env.JWT_SECRET)); // Apply auth middleware to all subsequent routes
app.use('/api/profile', profileRoutes(db));
app.use('/api/messages', messageRoutes(db)); // Pass the router directly
app.use('/api/admin', adminRoutes(db));
app.use('/api/upload', uploadRoutes); // Assuming upload routes exist

// Catch-all for API routes not defined
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("Global Error Handler caught an error:", err.stack);

  // Determine status code, default to 500 if not specified
  const statusCode = err.statusCode || 500;

  // Send a generic error response to the client
  res.status(statusCode).json({
    error: 'An unexpected error occurred.',
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  });
});


// --- Socket.IO Setup ---
const io = socketService(server, db, rooms, activeSessions, require('./utils/colors').generateUserColor);

// --- Health Check ---
app.get('/', (req, res) => {
    res.send('Chat server is running!');
});

// --- Start Server ---
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    // Initialize database if it doesn't exist (e.g., create tables)
console.log(`Server listening on port ${port}`);
});

// --- Graceful Shutdown ---
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    // Close Socket.IO server
    io.close(() => {
        console.log('Socket.IO server closed.');
    });
    // Close HTTP server
    server.close(() => {
        console.log('HTTP server closed.');
        // Close database connection (if applicable, depends on db/index.js implementation)
        if (db.close) {
            db.close((err) => {
                if (err) {
                    console.error('Error closing database connection:', err);
                } else {
                    console.log('Database connection closed.');
                }
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Shutting down gracefully...');
    // Handle SIGTERM similarly to SIGINT
    io.close(() => {
        console.log('Socket.IO server closed.');
    });
    server.close(() => {
        console.log('HTTP server closed.');
        if (db.close) {
            db.close((err) => {
                if (err) {
                    console.error('Error closing database connection:', err);
                } else {
                    console.log('Database connection closed.');
                }
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});
