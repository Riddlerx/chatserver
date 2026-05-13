const {
  emitUsersInRoom,
  broadcastUserList,
  normalizeOptionalString,
} = require("./utils");

module.exports = (io, db, socket, rooms, activeSessions) => {
  socket.on("typing", () => {
    if (!socket.room || !rooms[socket.room]) return;
    rooms[socket.room].set(socket.username, "typing");
    emitUsersInRoom(io, socket.room, db, rooms);
    // Broadcast typing indicator to room
    io.to(socket.room).emit("typing indicator", {
      username: socket.username,
      status: "typing",
    });
  });

  socket.on("stop typing", () => {
    if (!socket.room || !rooms[socket.room]) return;
    rooms[socket.room].set(socket.username, socket.status || "online");
    emitUsersInRoom(io, socket.room, db, rooms);
    // Broadcast typing indicator to room
    io.to(socket.room).emit("typing indicator", {
      username: socket.username,
      status: "online",
    });
  });

  socket.on("updateStatus", ({ status }, callback) => {
    const normalizedStatus = normalizeOptionalString(status, {
      maxLength: 120,
    });
    if (!socket.username) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Authentication required." })
      );
    }
    if (!normalizedStatus) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid status." })
      );
    }

    socket.status = normalizedStatus;
    activeSessions[socket.username] = socket.id;

    db.run(
      "UPDATE users SET status = ? WHERE username = ?",
      [normalizedStatus, socket.username],
      (err) => {
        if (err) {
          console.error(
            `Failed to update status for ${socket.username}:`,
            err.message,
          );
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "Failed to update status." })
          );
        }

        if (socket.room && rooms[socket.room]) {
          rooms[socket.room].set(socket.username, normalizedStatus);
          emitUsersInRoom(io, socket.room, db, rooms);
        }

        broadcastUserList(io, db, activeSessions);
        if (typeof callback === "function")
          callback({ success: true, message: "Status updated." });
      },
    );
  });

  socket.on("getUsers", () => {
    if (socket.room) emitUsersInRoom(io, socket.room, db, rooms);
  });
};
