const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    // Reflect the origin to allow credentials
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

module.exports = cors(corsOptions);
