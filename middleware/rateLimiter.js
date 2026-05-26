const rateLimit = require('express-rate-limit');
const config = require('../config');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === 'development' ? 10000 : 1000, // Much higher limit for dev
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // This is the key: trust the proxy to get the real client IP
  skipSuccessfulRequests: false,
  validate: { xForwardedForHeader: true }
});

module.exports = apiLimiter;
