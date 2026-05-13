const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV || 'development',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:5173',
        'http://localhost',
        'http://168.138.212.140:3000',
        'http://168.138.212.140',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5000',
        'http://127.0.0.1',
      ],
};
