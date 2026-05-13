const { broadcastUserList, broadcastRoomList, emitUsersInRoom, cleanupSocket } = require("./utils");
const registerRoomHandlers = require("./roomHandlers");
const registerMessageHandlers = require("./messageHandlers");
const registerReactionHandlers = require("./reactionHandlers");
const registerDMHandlers = require("./dmHandlers");
const registerUserHandlers = require("./userHandlers");

module.exports = (io, db, rooms = {}, activeSessions = {}) => {
  io.of("/").on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    activeSessions[socket.username] = socket.id;
    
    // Send initial data to the connecting user
    broadcastRoomList(io, db);

    // Initialize user status
    db.run(
      "UPDATE users SET status = 'online' WHERE username = ?",
      [socket.username],
      (err) => {
        if (err) {
          console.error(`Failed to initialize status for ${socket.username}:`, err.message);
        } else {
          socket.status = "online";
          broadcastUserList(io, db, activeSessions);
        }
      },
    );

    // Register modular handlers
    registerRoomHandlers(io, db, socket, rooms, activeSessions);
    registerMessageHandlers(io, db, socket);
    registerReactionHandlers(io, db, socket);
    registerDMHandlers(io, db, socket, activeSessions);
    registerUserHandlers(io, db, socket, rooms, activeSessions);

    socket.on("disconnect", () => {
      if (socket.username) {
        delete activeSessions[socket.username];
        db.run("UPDATE users SET status = 'offline' WHERE username = ?", [socket.username], (err) => {
          if (err) console.error(`Failed to update status for ${socket.username} on disconnect:`, err.message);
        });
        broadcastUserList(io, db, activeSessions);

        if (socket.room && rooms[socket.room]) {
          rooms[socket.room].delete(socket.username);
          if (rooms[socket.room].size === 0) delete rooms[socket.room];
          else emitUsersInRoom(io, socket.room, db, rooms);
        }
      }

      cleanupSocket(socket);
    });
  });
};
