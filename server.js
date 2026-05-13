const path = require('path');
const express = require('express');
const http = require('http');

const config = require('./config');
const securityMiddleware = require('./middleware/security');
const cors = require('./middleware/cors');
const apiLimiter = require('./middleware/rateLimiter');

const db = require('./db/index');

const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const messageRoutes = require('./routes/message');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const socketService = require('./socket');

if (!config.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined.");
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

// Apply Security Middleware
securityMiddleware(app);

// CORS Configuration
app.use(cors);

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public folder for static files
app.use(express.static(path.join(__dirname, 'public')));

// Handle favicon.ico to prevent 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Rate Limiting for API routes
app.use('/api', apiLimiter);

// --- Routes ---
// Public routes
app.use('/api/auth', authRoutes(db));

// Protected routes
app.use('/api', authMiddleware(db, config.JWT_SECRET));
app.use('/api/profile', profileRoutes(db));
app.use('/api/messages', messageRoutes(db));
app.use('/api/admin', adminRoutes(db));
app.use('/api/upload', uploadRoutes);

// Catch-all for API routes
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
});

// --- Global Error Handler ---
app.use((err, req, res, _next) => {
  console.error("Global Error Handler caught an error:", err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: 'An unexpected error occurred.',
    message: config.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  });
});

const server = http.createServer(app);
const port = config.PORT;

// Global state for Socket.IO
const rooms = {}; 
const activeSessions = {};

const io = socketService(server, db, rooms, activeSessions);

app.get('/', (req, res) => {
    res.send('Chat server is running!');
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

// --- Graceful Shutdown ---
const shutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    
    // Failsafe: force exit after 5 seconds
    setTimeout(() => {
        console.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 5000);

    io.close(() => {
        console.log('Socket.IO server closed.');
        server.close(() => {
            console.log('HTTP server closed.');
            if (db.close) {
                db.close((err) => {
                    if (err) console.error('Error closing database connection:', err);
                    else console.log('Database connection closed.');
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        });
    });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
