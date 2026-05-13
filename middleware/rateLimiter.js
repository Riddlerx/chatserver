const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // Increased limit for production
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // This is the key: trust the proxy to get the real client IP
  skipSuccessfulRequests: false,
  validate: { xForwardedForHeader: true }
});

module.exports = apiLimiter;
