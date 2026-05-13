const helmet = require('helmet');
const hpp = require('hpp');
const { ALLOWED_ORIGINS } = require('../config');

const cspConnectSrc = Array.from(new Set([
  "'self'",
  "ws:",
  "wss:",
  "https://cdn.jsdelivr.net",
  ...ALLOWED_ORIGINS,
]));

const securityMiddleware = (app) => {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        connectSrc: cspConnectSrc,
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginOpenerPolicy: { policy: "unsafe-none" },
    originAgentCluster: false,
    hsts: false,
  }));
  app.use(hpp());
};

module.exports = securityMiddleware;
