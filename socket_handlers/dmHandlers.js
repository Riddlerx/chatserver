const {
  normalizeOptionalString,
  sanitizeMessageText,
} = require("./utils");

module.exports = (io, db, socket, activeSessions) => {
  socket.on("send dm", ({ toUser, message }, callback) => {
    const normalizedRecipient = normalizeOptionalString(toUser, {
      maxLength: 30,
    });
    const cleanMessage = sanitizeMessageText(message);

    if (!socket.username) return;
    if (!normalizedRecipient || !cleanMessage) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Message cannot be empty." })
      );
    }
    if (normalizedRecipient === socket.username) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Cannot send a DM to yourself." })
      );
    }

    const timestamp = new Date().toISOString();
    db.run(
      "INSERT INTO direct_messages (from_user, to_user, message, timestamp) VALUES (?, ?, ?, ?)",
      [socket.username, normalizedRecipient, cleanMessage, timestamp],
      function (err) {
        if (err) {
          console.error("Send DM DB Error:", err.message);
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "Failed to send DM." })
          );
        }

        const dmData = {
          id: this.lastID,
          username: socket.username,
          displayName: socket.displayName,
          profilePicture: socket.profilePicture,
          to: normalizedRecipient,
          message: cleanMessage,
          timestamp,
        };

        const recipientSocketId = activeSessions[normalizedRecipient];
        if (recipientSocketId)
          io.to(recipientSocketId).emit("receive dm", dmData);
        socket.emit("receive dm", dmData);
        if (typeof callback === "function")
          callback({ success: true, message: "DM sent.", dmData });
      },
    );
  });

  socket.on("get dm history", ({ withUser }, callback) => {
    const normalizedUser = normalizeOptionalString(withUser, { maxLength: 30 });
    if (!socket.username || !normalizedUser) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid user." })
      );
    }

    db.all(
      "SELECT dm.*, u.displayName as fromDisplayName, u.profilePicture as fromProfilePicture FROM direct_messages dm LEFT JOIN users u ON dm.from_user = u.username WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?) ORDER BY timestamp ASC",
      [socket.username, normalizedUser, normalizedUser, socket.username],
      (err, rows) => {
        if (err) {
          console.error("Get DM history DB Error:", err.message);
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "Failed to fetch DM history." })
          );
        }

        socket.emit("dm history", {
          withUser: normalizedUser,
          messages: rows.map((row) => ({
            id: row.id,
            username: row.from_user,
            displayName: row.fromDisplayName,
            profilePicture: row.fromProfilePicture,
            to: row.to_user,
            message: row.message,
            timestamp: row.timestamp,
            edited: Boolean(row.edited),
          })),
        });

        if (typeof callback === "function") callback({ success: true });
      },
    );
  });

  socket.on("edit dm", ({ messageId, newMessage }, callback) => {
    const { normalizePositiveInt } = require("./utils");
    const normalizedMessageId = normalizePositiveInt(messageId);
    const cleanMessage = sanitizeMessageText(newMessage);

    if (!socket.username || !normalizedMessageId || !cleanMessage) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid request." })
      );
    }

    db.get(
      "SELECT from_user, to_user FROM direct_messages WHERE id = ?",
      [normalizedMessageId],
      (err, dm) => {
        if (err || !dm) {
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "DM not found." })
          );
        }
        if (dm.from_user !== socket.username) {
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "Unauthorized." })
          );
        }

        const timestamp = new Date().toISOString();
        db.run(
          "UPDATE direct_messages SET message = ?, edited = 1, timestamp = ? WHERE id = ?",
          [cleanMessage, timestamp, normalizedMessageId],
          function (updateErr) {
            if (updateErr) {
              return (
                typeof callback === "function" &&
                callback({ success: false, message: "Failed to update DM." })
              );
            }

            const updateData = {
              id: normalizedMessageId,
              message: cleanMessage,
              timestamp,
              edited: true,
            };

            // Notify both parties
            const recipientSocketId = activeSessions[dm.to_user];
            if (recipientSocketId) io.to(recipientSocketId).emit("dm edited", updateData);
            socket.emit("dm edited", updateData);

            if (typeof callback === "function") callback({ success: true });
          },
        );
      },
    );
  });

  socket.on("delete dm", ({ messageId }, callback) => {
    const { normalizePositiveInt } = require("./utils");
    const normalizedMessageId = normalizePositiveInt(messageId);

    if (!socket.username || !normalizedMessageId) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid request." })
      );
    }

    db.get(
      "SELECT from_user, to_user FROM direct_messages WHERE id = ?",
      [normalizedMessageId],
      (err, dm) => {
        if (err || !dm) {
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "DM not found." })
          );
        }
        if (dm.from_user !== socket.username && socket.role !== "admin") {
          return (
            typeof callback === "function" &&
            callback({ success: false, message: "Unauthorized." })
          );
        }

        db.run(
          "DELETE FROM direct_messages WHERE id = ?",
          [normalizedMessageId],
          function (deleteErr) {
            if (deleteErr) {
              return (
                typeof callback === "function" &&
                callback({ success: false, message: "Failed to delete DM." })
              );
            }

            // Notify both parties
            const recipientSocketId = activeSessions[dm.to_user];
            if (recipientSocketId)
              io.to(recipientSocketId).emit("dm deleted", { id: normalizedMessageId });
            socket.emit("dm deleted", { id: normalizedMessageId });

            if (typeof callback === "function") callback({ success: true });
          },
        );
      },
    );
  });
};
