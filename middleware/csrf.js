const crypto = require('crypto');

const csrfMiddleware = (req, res, next) => {
  // Safe methods do not require CSRF token validation
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Generate a new token and send it as a cookie for the client to read
    if (!req.cookies['XSRF-TOKEN']) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie('XSRF-TOKEN', token, {
        httpOnly: false, // Must be false so frontend can read it
        secure: true,
        sameSite: 'lax',
      });
    }
    return next();
  }

  // Exempt auth routes (login, register) from CSRF protection
  // These endpoints don't access authenticated resources
  if (req.path === '/api/auth/login' || req.path === '/api/auth/register') {
    return next();
  }

  // For state-changing methods, validate the token
  const clientToken = req.headers['x-xsrf-token'];
  const cookieToken = req.cookies['XSRF-TOKEN'];

  if (!clientToken || clientToken !== cookieToken) {
    return res.status(403).json({ error: 'CSRF token validation failed' });
  }

  next();
};

module.exports = csrfMiddleware;
