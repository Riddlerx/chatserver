const http = require('http');
const app = require('./app');
const config = require('./config');
const db = require('./db/pg_index');
const socketService = require('./socket');
const logger = require('./logger');

const server = http.createServer(app);
const port = config.PORT;

// Global state for Socket.IO
const rooms = {}; 
const activeSessions = {};

const io = socketService(server, db, rooms, activeSessions);
app.set('io', io);
app.set('activeSessions', activeSessions);
app.set('rooms', rooms);

server.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
});

// --- Graceful Shutdown ---
const shutdown = async (signal) => {
    logger.info({ signal }, `Received ${signal}. Shutting down gracefully...`);
    
    // Failsafe: force exit after 5 seconds
    setTimeout(() => {
        logger.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 5000);

    io.close(() => {
        logger.info('Socket.IO server closed.');
        server.close(() => {
            logger.info('HTTP server closed.');
            if (db.end) {
                db.end().then(() => {
                    logger.info('Database connection closed.');
                    process.exit(0);
                }).catch((err) => {
                    logger.error({ err }, 'Error closing database connection');
                    process.exit(1);
                });
            } else {
                process.exit(0);
            }
        });
    });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
