const { broadcastUserList, broadcastRoomList, emitUsersInRoom, cleanupSocket } = require("./utils");
const registerRoomHandlers = require("./roomHandlers");
const registerMessageHandlers = require("./messageHandlers");
const registerReactionHandlers = require("./reactionHandlers");
const registerDMHandlers = require("./dmHandlers");
const registerUserHandlers = require("./userHandlers");
const logger = require("../logger");

module.exports = (io, db, rooms = {}, activeSessions = {}) => {
  const { RateLimiterMemory } = require("rate-limiter-flexible");
  const connectionRateLimiter = new RateLimiterMemory({
      points: 50,
      duration: 15 * 60,
  });

  io.of("/").on("connection", async (socket) => {
    // Apply connection rate limiter
    const address = socket.handshake.address;
    if (address !== '::ffff:127.0.0.1' && address !== '::1' && address !== '127.0.0.1') {
        try {
            await connectionRateLimiter.consume(address);
        } catch (_err) {
            logger.warn(`Connection rate limit exceeded for ${address}`);
            socket.disconnect(true);
            return;
        }
    }

    logger.info(`User connected: ${socket.id}`);
    activeSessions[socket.username] = socket.id;
    
    // Send initial data to the connecting user
    await broadcastRoomList(io, db);

    // Initialize user status
    try {
      await db.query("UPDATE users SET status = 'online' WHERE username = $1", [socket.username]);
      socket.status = "online";
      await broadcastUserList(io, db, activeSessions);
    } catch (err) {
      logger.error({ err }, `Failed to initialize status for ${socket.username}`);
    }

    // Register modular handlers
    registerRoomHandlers(io, db, socket, rooms, activeSessions);
    registerMessageHandlers(io, db, socket);
    registerReactionHandlers(io, db, socket);
    registerDMHandlers(io, db, socket, activeSessions);
    registerUserHandlers(io, db, socket, rooms, activeSessions);

    socket.on("disconnect", async () => {
      if (socket.username) {
        delete activeSessions[socket.username];
        try {
          await db.query("UPDATE users SET status = 'offline' WHERE username = $1", [socket.username]);
        } catch (err) {
          logger.error({ err }, `Failed to update status for ${socket.username} on disconnect`);
        }
        await broadcastUserList(io, db, activeSessions);

        if (socket.room && rooms[socket.room]) {
          rooms[socket.room].delete(socket.username);
          if (rooms[socket.room].size === 0) delete rooms[socket.room];
          else await emitUsersInRoom(io, socket.room, db, rooms);
        }
      }

      cleanupSocket(socket);
    });
  });
};
