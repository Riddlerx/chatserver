const logger = require("../logger");
const {
  emitUsersInRoom,
  broadcastUserUpdate,
  normalizeOptionalString,
} = require("./utils");

module.exports = (io, db, socket, rooms, activeSessions) => {
  socket.on("typing", async () => {
    if (!socket.room || !rooms[socket.room]) return;
    rooms[socket.room].set(socket.username, "typing");
    
    io.to(socket.room).emit("typing indicator", {
      username: socket.username,
      status: "typing",
    });
  });

  socket.on("stop typing", async () => {
    if (!socket.room || !rooms[socket.room]) return;
    rooms[socket.room].set(socket.username, socket.status || "online");
    
    io.to(socket.room).emit("typing indicator", {
      username: socket.username,
      status: "online",
    });
  });

  socket.on("updateStatus", async ({ status }, callback) => {
    try {
      const normalizedStatus = normalizeOptionalString(status, { maxLength: 120 });
      if (!socket.username) {
        return typeof callback === "function" && callback({ success: false, message: "Authentication required." });
      }
      if (!normalizedStatus) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid status." });
      }

      socket.status = normalizedStatus;
      activeSessions[socket.username] = socket.id;

      await db.query("UPDATE users SET status = $1 WHERE username = $2", [normalizedStatus, socket.username]);

      if (socket.room && rooms[socket.room]) {
        rooms[socket.room].set(socket.username, normalizedStatus);
      }

      await broadcastUserUpdate(io, db, socket.username, activeSessions);
      if (typeof callback === "function") callback({ success: true, message: "Status updated." });
    } catch (err) {
      logger.error({ err }, "Update status error");
      if (typeof callback === "function") callback({ success: false, message: "Failed to update status." });
    }
  });

  socket.on("getUsers", async () => {
    if (socket.room) await emitUsersInRoom(io, socket.room, db, rooms);
  });
};
