const {
  normalizePositiveInt,
  normalizeOptionalString,
} = require("./utils");

module.exports = (io, db, socket) => {
  function emitReactionsUpdate(messageId, roomId) {
    db.all(
      "SELECT emoji, COUNT(*) as count FROM reactions WHERE message_id = ? GROUP BY emoji",
      [messageId],
      (err, reactions) => {
        if (err) {
          console.error("Fetch reactions DB Error:", err.message);
          return;
        }
        if (roomId) {
          io.to(roomId).emit("reactions updated", { messageId, reactions });
        } else {
          db.get(
            "SELECT room FROM messages WHERE id = ?",
            [messageId],
            (roomErr, message) => {
              if (!roomErr && message) {
                io.to(message.room).emit("reactions updated", {
                  messageId,
                  reactions,
                });
              }
            },
          );
        }
      },
    );
  }

  socket.on("add reaction", ({ messageId, emoji }, callback) => {
    const normalizedMessageId = normalizePositiveInt(messageId);
    const normalizedEmoji = normalizeOptionalString(emoji, {
      maxLength: 32,
      trim: false,
    });
    if (!socket.username || !normalizedMessageId || !normalizedEmoji) {
      return typeof callback === "function" && callback({ success: false });
    }

    db.run(
      "INSERT OR IGNORE INTO reactions (message_id, username, emoji) VALUES (?, ?, ?)",
      [normalizedMessageId, socket.username, normalizedEmoji],
      (err) => {
        if (err) {
          console.error("Add reaction DB Error:", err.message);
          return typeof callback === "function" && callback({ success: false });
        }
        emitReactionsUpdate(normalizedMessageId, socket.room);
        if (typeof callback === "function") callback({ success: true });
      },
    );
  });

  socket.on("remove reaction", ({ messageId, emoji }, callback) => {
    const normalizedMessageId = normalizePositiveInt(messageId);
    const normalizedEmoji = normalizeOptionalString(emoji, {
      maxLength: 32,
      trim: false,
    });
    if (!socket.username || !normalizedMessageId || !normalizedEmoji) {
      return typeof callback === "function" && callback({ success: false });
    }

    db.run(
      "DELETE FROM reactions WHERE message_id = ? AND username = ? AND emoji = ?",
      [normalizedMessageId, socket.username, normalizedEmoji],
      (err) => {
        if (err) {
          console.error("Remove reaction DB Error:", err.message);
          return typeof callback === "function" && callback({ success: false });
        }
        emitReactionsUpdate(normalizedMessageId, socket.room);
        if (typeof callback === "function") callback({ success: true });
      },
    );
  });

  socket.on("get reactions", ({ messageId }) => {
    const normalizedMessageId = normalizePositiveInt(messageId);
    if (normalizedMessageId)
      emitReactionsUpdate(normalizedMessageId, socket.room);
  });
};
