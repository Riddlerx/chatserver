const { RateLimiterMemory } = require("rate-limiter-flexible");
const {
  resolveRoomId,
  sanitizeMessageText,
  normalizePositiveInt,
  fetchLinkPreview,
} = require("./utils");

const messageRateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

module.exports = (io, db, socket) => {
  socket.on(
    "sendMessage",
    async ({ message, roomId, parentMessageId }, callback) => {
      const resolvedRoomId = resolveRoomId(roomId, socket);
      const cleanMessage = sanitizeMessageText(message);
      const normalizedParentId =
        parentMessageId == null ? null : normalizePositiveInt(parentMessageId);

      console.log(`[sendMessage] [${socket.id}] Attempt by ${socket.username}: roomId=${roomId}, resolved=${resolvedRoomId}, socketRoom=${socket.room}`);

      try {
        await messageRateLimiter.consume(
          socket.username || socket.handshake.address,
        );
      } catch (_err) {
        console.warn(`[sendMessage] [${socket.id}] Rate limit hit for ${socket.username}`);
        return (
          typeof callback === "function" &&
          callback({
            success: false,
            message: "Too many messages. Please slow down.",
          })
        );
      }

      if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
        console.warn(`[sendMessage] [${socket.id}] Rejected: username=${!!socket.username}, roomSet=${!!socket.room}, match=${socket.room === resolvedRoomId}`);
        return (
          typeof callback === "function" &&
          callback({
            success: false,
            message: "Unauthorized or not in the correct room.",
          })
        );
      }
      if (!cleanMessage) {
        return (
          typeof callback === "function" &&
          callback({ success: false, message: "Message cannot be empty." })
        );
      }
      if (parentMessageId != null && !normalizedParentId) {
        return (
          typeof callback === "function" &&
          callback({ success: false, message: "Invalid thread target." })
        );
      }

      let linkPreview = null;
      const match = cleanMessage.match(/(https?:\/\/[^\s]+)/);
      if (match) linkPreview = await fetchLinkPreview(match[0]);

      const timestamp = new Date().toISOString();
      
      try {
        const { lastID } = await db.runAsync(
          "INSERT INTO messages (username, room, message, timestamp, displayName, profilePicture, link_preview, parent_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            socket.username,
            resolvedRoomId,
            cleanMessage,
            timestamp,
            socket.displayName,
            socket.profilePicture,
            linkPreview ? JSON.stringify(linkPreview) : null,
            normalizedParentId,
          ]
        );

        const newMessage = {
          id: lastID,
          username: socket.username,
          room: resolvedRoomId,
          message: cleanMessage,
          timestamp,
          displayName: socket.displayName,
          profilePicture: socket.profilePicture,
          link_preview: linkPreview,
          is_pinned: false,
          parent_message_id: normalizedParentId,
          edited: false,
          reply_count: 0,
        };

        io.to(resolvedRoomId).emit("chat message", newMessage);

        if (normalizedParentId) {
          await db.runAsync(
            "UPDATE messages SET reply_count = reply_count + 1 WHERE id = ?",
            [normalizedParentId]
          );
          
          const row = await db.getAsync(
            "SELECT reply_count FROM messages WHERE id = ?",
            [normalizedParentId]
          );

          if (row) {
            io.to(resolvedRoomId).emit("reply count updated", {
              messageId: normalizedParentId,
              reply_count: row.reply_count,
            });
          }
          
          io.to(`thread-${normalizedParentId}`).emit(
            "thread message",
            newMessage,
          );
        }

        if (typeof callback === "function") {
          callback({
            success: true,
            message: "Message sent.",
            messageData: newMessage,
          });
        }
      } catch (err) {
        console.error("Send message DB Error:", err.message);
        if (typeof callback === "function") {
          callback({ success: false, message: "Failed to send message." });
        }
      }
    },
  );

  socket.on("get thread", async ({ parent_message_id }) => {
    const parentMessageId = normalizePositiveInt(parent_message_id);
    if (!socket.username || !parentMessageId) return;

    try {
      const messages = await db.allAsync(
        "SELECT * FROM messages WHERE parent_message_id = ? ORDER BY timestamp ASC",
        [parentMessageId]
      );

      socket.emit("thread history", {
        parent_message_id: parentMessageId,
        messages: messages.map((message) => ({
          id: message.id,
          username: message.username,
          message: message.message,
          timestamp: message.timestamp,
          room: message.room,
          displayName: message.displayName || message.username,
          profilePicture: message.profilePicture,
          parent_message_id: message.parent_message_id,
        })),
      });
      socket.join(`thread-${parentMessageId}`);
    } catch (err) {
      console.error("Get thread DB Error:", err.message);
    }
  });

  socket.on("leave thread", ({ parent_message_id }) => {
    const parentMessageId = normalizePositiveInt(parent_message_id);
    if (parentMessageId) socket.leave(`thread-${parentMessageId}`);
  });

  socket.on("editMessage", async ({ messageId, newMessage, roomId }, callback) => {
    const normalizedMessageId = normalizePositiveInt(messageId);
    const resolvedRoomId = resolveRoomId(roomId, socket);
    const cleanMessage = sanitizeMessageText(newMessage);

    if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
      return (
        typeof callback === "function" &&
        callback({
          success: false,
          message: "Unauthorized or not in the correct room.",
        })
      );
    }
    if (!normalizedMessageId || !cleanMessage) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Message cannot be empty." })
      );
    }

    const timestamp = new Date().toISOString();
    try {
      const { changes } = await db.runAsync(
        "UPDATE messages SET message = ?, edited = 1, timestamp = ? WHERE id = ? AND username = ?",
        [cleanMessage, timestamp, normalizedMessageId, socket.username]
      );

      if (changes === 0) {
        return (
          typeof callback === "function" &&
          callback({
            success: false,
            message: "Message not found or you are not the author.",
          })
        );
      }

      io.to(resolvedRoomId).emit("message edited", {
        id: normalizedMessageId,
        message: cleanMessage,
        timestamp,
        edited: true,
      });
      if (typeof callback === "function")
        callback({ success: true, message: "Message edited." });
    } catch (err) {
      console.error("Edit message DB Error:", err.message);
      if (typeof callback === "function")
        callback({ success: false, message: "Failed to edit message." });
    }
  });

  socket.on("deleteMessage", async ({ messageId, roomId }, callback) => {
    const normalizedMessageId = normalizePositiveInt(messageId);
    const resolvedRoomId = resolveRoomId(roomId, socket);

    if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
      return (
        typeof callback === "function" &&
        callback({
          success: false,
          message: "Unauthorized or not in the correct room.",
        })
      );
    }
    if (!normalizedMessageId) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid message." })
      );
    }

    try {
      const message = await db.getAsync(
        "SELECT username, parent_message_id FROM messages WHERE id = ? AND room = ?",
        [normalizedMessageId, resolvedRoomId]
      );

      if (!message) {
        return (
          typeof callback === "function" &&
          callback({ success: false, message: "Message not found." })
        );
      }
      if (message.username !== socket.username && socket.role !== "admin") {
        return (
          typeof callback === "function" &&
          callback({
            success: false,
            message: "You can only delete your own messages or as an admin.",
          })
        );
      }

      const { changes } = await db.runAsync(
        "DELETE FROM messages WHERE id = ? AND room = ?",
        [normalizedMessageId, resolvedRoomId]
      );

      if (changes === 0) {
        return (
          typeof callback === "function" &&
          callback({
            success: false,
            message: "Message not found or could not be deleted.",
          })
        );
      }

      io.to(resolvedRoomId).emit("message deleted", {
        id: normalizedMessageId,
        deletedBy: socket.username,
      });

      if (message.parent_message_id) {
        await db.runAsync(
          "UPDATE messages SET reply_count = MAX(reply_count - 1, 0) WHERE id = ?",
          [message.parent_message_id]
        );
        
        const row = await db.getAsync(
          "SELECT reply_count FROM messages WHERE id = ?",
          [message.parent_message_id]
        );

        if (row) {
          io.to(resolvedRoomId).emit("reply count updated", {
            messageId: message.parent_message_id,
            reply_count: row.reply_count,
          });
        }
      }

      if (typeof callback === "function")
        callback({ success: true, message: "Message deleted." });
    } catch (err) {
      console.error("Delete message DB Error:", err.message);
      if (typeof callback === "function")
        callback({ success: false, message: "Failed to delete message." });
    }
  });

  const handlePinState = async ({ messageId, roomId }, callback, shouldPin) => {
    const normalizedMessageId = normalizePositiveInt(messageId);
    const resolvedRoomId = resolveRoomId(roomId, socket);

    if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
      return (
        typeof callback === "function" &&
        callback({
          success: false,
          message: "Unauthorized or not in the correct room.",
        })
      );
    }
    if (!normalizedMessageId) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid message." })
      );
    }

    try {
      const message = await db.getAsync(
        "SELECT username FROM messages WHERE id = ? AND room = ?",
        [normalizedMessageId, resolvedRoomId]
      );

      if (!message) {
        return (
          typeof callback === "function" &&
          callback({ success: false, message: "Message not found." })
        );
      }
      if (message.username !== socket.username && socket.role !== "admin") {
        return (
          typeof callback === "function" &&
          callback({
            success: false,
            message: `You can only ${shouldPin ? "pin" : "unpin"} your own messages or as an admin.`,
          })
        );
      }

      const { changes } = await db.runAsync(
        "UPDATE messages SET is_pinned = ? WHERE id = ? AND room = ?",
        [shouldPin ? 1 : 0, normalizedMessageId, resolvedRoomId]
      );

      if (changes === 0) {
        return (
          typeof callback === "function" &&
          callback({
            success: false,
            message: "Message not found or could not be updated.",
          })
        );
      }

      const pinnedMessages = await db.allAsync(
        "SELECT * FROM messages WHERE room = ? AND is_pinned = 1 ORDER BY timestamp DESC",
        [resolvedRoomId]
      );

      io.to(resolvedRoomId).emit(
        "pinned messages updated",
        pinnedMessages.map((row) => ({
          id: row.id,
          username: row.username,
          message: row.message,
          timestamp: row.timestamp,
          room: row.room,
          displayName: row.displayName || row.username,
          profilePicture: row.profilePicture,
          link_preview: row.link_preview
            ? JSON.parse(row.link_preview)
            : null,
          is_pinned: Boolean(row.is_pinned),
          parent_message_id: row.parent_message_id,
        })),
      );

      io.to(resolvedRoomId).emit(
        shouldPin ? "messagePinned" : "messageUnpinned",
        {
          messageId: normalizedMessageId,
          roomId: resolvedRoomId,
          updatedBy: socket.username,
        },
      );

      if (typeof callback === "function") {
        callback({
          success: true,
          message: `Message ${shouldPin ? "pinned" : "unpinned"} successfully.`,
        });
      }
    } catch (err) {
      console.error("Pin/unpin DB Error:", err.message);
      if (typeof callback === "function") {
        callback({
          success: false,
          message: `Failed to ${shouldPin ? "pin" : "unpin"} message.`,
        });
      }
    }
  };

  socket.on("pinMessage", (payload, callback) =>
    handlePinState(payload, callback, true),
  );
  socket.on("unpinMessage", (payload, callback) =>
    handlePinState(payload, callback, false),
  );
};
