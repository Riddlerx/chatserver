const bcrypt = require("bcrypt");
const {
  normalizeOptionalString,
  isValidRoomName,
  emitUsersInRoom,
  broadcastUserList,
  broadcastRoomList,
} = require("./utils");

module.exports = (io, db, socket, rooms, activeSessions) => {
  socket.on("joinRoom", ({ room, password }, callback) => {
    const normalizedRoom = normalizeOptionalString(room, { maxLength: 80 });
    console.log(`[joinRoom] [${socket.id}] Attempting to join room: ${normalizedRoom} for user: ${socket.username}`);
    if (!socket.username) {
      console.warn(`[joinRoom] [${socket.id}] Join failed: No username on socket`);
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Authentication required." })
      );
    }
    if (!normalizedRoom || !isValidRoomName(normalizedRoom)) {
      console.warn(`[joinRoom] [${socket.id}] Join failed: Invalid room name: ${room}`);
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid room." })
      );
    }

    db.get(
      "SELECT name, password FROM custom_rooms WHERE name = ?",
      [normalizedRoom],
      async (roomErr, roomRecord) => {
        if (roomErr) {
          console.error(`[joinRoom] [${socket.id}] DB Error: ${roomErr.message}`);
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "Failed to join room." })
          );
        }
        if (!roomRecord) {
          console.warn(`[joinRoom] [${socket.id}] Join failed: Room ${normalizedRoom} not found in custom_rooms`);
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "Room not found." })
          );
        }

        if (roomRecord.password && socket.role !== "admin") {
          try {
            const match = await bcrypt.compare(password || "", roomRecord.password);
            if (!match) {
              console.warn(`[joinRoom] [${socket.id}] Join failed: Incorrect password for room ${normalizedRoom}`);
              socket.emit("join room error", {
                error: "Incorrect room password.",
                room: normalizedRoom,
              });
              return (
                typeof callback === "function" &&
                callback({ success: false, message: "Incorrect room password." })
              );
            }
          } catch (err) {
            console.error(`[joinRoom] [${socket.id}] Bcrypt error: ${err.message}`);
            return (
              typeof callback === "function" &&
              callback({ success: false, message: "Error verifying password." })
            );
          }
        }

        if (socket.room) {
          const previousRoom = socket.room;
          if (rooms[previousRoom]) {
            rooms[previousRoom].delete(socket.username);
            if (rooms[previousRoom].size === 0) delete rooms[previousRoom];
            else emitUsersInRoom(io, previousRoom, db, rooms);
          }
          socket.leave(previousRoom);
        }

        socket.room = normalizedRoom;
        socket.join(normalizedRoom);
        console.log(`[joinRoom] [${socket.id}] User ${socket.username} successfully joined room ${normalizedRoom}`);

        if (!rooms[normalizedRoom]) rooms[normalizedRoom] = new Map();
        rooms[normalizedRoom].set(socket.username, socket.status || "online");

        if (!rooms[normalizedRoom]) rooms[normalizedRoom] = new Map();
        rooms[normalizedRoom].set(socket.username, socket.status || "online");

        db.all(
          "SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC",
          [normalizedRoom],
          (messagesErr, messages) => {
            if (messagesErr) {
              console.error(
                `Error fetching messages for room ${normalizedRoom}:`,
                messagesErr.message,
              );
              return (
                typeof callback === "function" &&
                callback({ success: false, message: "Error fetching messages." })
              );
            }

            socket.emit(
              "messageHistory",
              messages.map((message) => ({
                id: message.id,
                username: message.username,
                message: message.message,
                timestamp: message.timestamp,
                room: message.room,
                displayName: message.displayName || message.username,
                profilePicture: message.profilePicture,
                link_preview: message.link_preview
                  ? JSON.parse(message.link_preview)
                  : null,
                edited: Boolean(message.edited),
                is_pinned: Boolean(message.is_pinned),
                parent_message_id: message.parent_message_id,
                reply_count: message.reply_count || 0,
              })),
            );

            db.all(
              "SELECT * FROM messages WHERE room = ? AND is_pinned = 1 ORDER BY timestamp DESC",
              [normalizedRoom],
              (pinnedErr, pinnedMessages) => {
                if (pinnedErr) {
                  console.error(
                    `Error fetching pinned messages for room ${normalizedRoom}:`,
                    pinnedErr.message,
                  );
                  return (
                    typeof callback === "function" &&
                    callback({
                      success: false,
                      message: "Error fetching pinned messages.",
                    })
                  );
                }

                socket.emit(
                  "pinned messages",
                  pinnedMessages.map((message) => ({
                    id: message.id,
                    username: message.username,
                    message: message.message,
                    timestamp: message.timestamp,
                    room: message.room,
                    displayName: message.displayName || message.username,
                    profilePicture: message.profilePicture,
                    link_preview: message.link_preview
                      ? JSON.parse(message.link_preview)
                      : null,
                    is_pinned: true,
                    parent_message_id: message.parent_message_id,
                  })),
                );

                broadcastRoomList(io, db);

                broadcastUserList(io, db, activeSessions);
                emitUsersInRoom(io, normalizedRoom, db, rooms);
                if (typeof callback === "function") {
                  callback({
                    success: true,
                    message: `Joined room "${normalizedRoom}".`,
                  });
                }
              },
            );
          },
        );
      },
    );
  });

  socket.on("create room", async ({ name, password }, callback) => {
    const normalizedName = normalizeOptionalString(name, { maxLength: 50 });
    let normalizedPassword = password
      ? require("./utils").normalizeString(password, { maxLength: 100, trim: false })
      : null;

    if (!socket.username) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Authentication required." })
      );
    }
    if (!normalizedName || !isValidRoomName(normalizedName)) {
      return (
        typeof callback === "function" &&
        callback({
          success: false,
          message:
            "Room names can only use letters, numbers, underscores, and hyphens.",
        })
      );
    }

    try {
      if (normalizedPassword) {
        normalizedPassword = await bcrypt.hash(normalizedPassword, 10);
      }
    } catch (err) {
      console.error("Bcrypt hash error:", err.message);
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Failed to process password." })
      );
    }

    db.run(
      "INSERT INTO custom_rooms (name, created_by, created_at, password) VALUES (?, ?, ?, ?)",
      [
        normalizedName,
        socket.username,
        new Date().toISOString(),
        normalizedPassword,
      ],
      (err) => {
        if (err) {
          if (!err.message.includes("UNIQUE")) {
            console.error("Create room DB Error:", err.message);
          }
          const message = err.message.includes("UNIQUE")
            ? "Room already exists."
            : "Failed to create room.";
          return (
            typeof callback === "function" && callback({ success: false, message })
          );
        }

        broadcastRoomList(io, db);
        if (typeof callback === "function")
          callback({ success: true, message: "Room created." });
      },
    );
  });

  socket.on("delete room", ({ name }, callback) => {
    const normalizedName = normalizeOptionalString(name, { maxLength: 50 });
    if (!socket.username || socket.role !== "admin") {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Admin access required." })
      );
    }
    if (
      !normalizedName ||
      normalizedName === "main" ||
      normalizedName === "general"
    ) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid room." })
      );
    }

    db.run(
      "DELETE FROM custom_rooms WHERE name = ?",
      [normalizedName],
      function (err) {
        if (err) {
          console.error("Delete room DB Error:", err.message);
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "Failed to delete room." })
          );
        }
        if (this.changes === 0) {
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "Room not found." })
          );
        }

        delete rooms[normalizedName];
        broadcastRoomList(io, db);
        if (typeof callback === "function")
          callback({ success: true, message: "Room deleted." });
      },
    );
  });
};
