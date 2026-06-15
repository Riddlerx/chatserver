const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const logger = require('./logger');
const fs = require('fs');

// Move import to top for performance
let fileType;
import('file-type').then(module => {
    fileType = module;
});

const config = require('./config');
const securityMiddleware = require('./middleware/security');
const cors = require('./middleware/cors');
const apiLimiter = require('./middleware/rateLimiter');

const db = require('./db/pg_index');


const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const messageRoutes = require('./routes/message');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');

if (!config.JWT_SECRET) {
  logger.error("FATAL ERROR: JWT_SECRET is not defined.");
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
app.use(cookieParser());

// CSRF Protection
const csrfMiddleware = require('./middleware/csrf');
app.use(csrfMiddleware);

// Endpoint for frontend to initialize CSRF token
app.get('/api/csrf', (req, res) => {
  const token = require('crypto').randomBytes(32).toString('hex');
  res.cookie('XSRF-TOKEN', token, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
  });
  res.json({ success: true });
});

// Serve uploads from a protected directory with safe headers
// Protected by authentication
app.get('/uploads/:filename', authMiddleware(db, config.JWT_SECRET), async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(__dirname, 'uploads', filename);
    if (!fs.existsSync(filePath)) return res.status(404).end();

    // Use pre-loaded fileType module
    const type = await fileType.fileTypeFromFile(filePath);
    const mime = type?.mime || 'application/octet-stream';

    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.sendFile(filePath);
  } catch (err) {
    logger.error({ err }, 'Error serving uploaded file');
    return res.status(500).end();
  }
});

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
  logger.error({ err }, "Global Error Handler caught an error");
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: 'An unexpected error occurred.',
    message: config.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  });
});

app.get('/', (req, res) => {
    res.send('Chat server is running!');
});

module.exports = app;
