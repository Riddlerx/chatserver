const { RateLimiterMemory } = require("rate-limiter-flexible");
const logger = require("../logger");
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
  socket.on("sendMessage", async ({ message, roomId, parentMessageId }, callback) => {
    try {
      const resolvedRoomId = resolveRoomId(roomId, socket);
      const cleanMessage = sanitizeMessageText(message);
      const normalizedParentId = parentMessageId == null ? null : normalizePositiveInt(parentMessageId);

      await messageRateLimiter.consume(socket.username || socket.handshake.address);

      // Require the socket to be joined to the target room before accepting messages.
      if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
        logger.warn({
          username: socket.username,
          socketRoom: socket.room,
          resolvedRoomId,
          match: socket.room === resolvedRoomId
        }, "Message rejected: unauthorized or room mismatch");
        return typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." });
      }
      if (!cleanMessage) {
        return typeof callback === "function" && callback({ success: false, message: "Message cannot be empty." });
      }

      let linkPreview = null;
      const match = cleanMessage.match(/(https?:\/\/[^\s]+)/);
      if (match) linkPreview = await fetchLinkPreview(match[0]);

      const timestamp = new Date().toISOString();
      
      const result = await db.query(
        "INSERT INTO messages (username, room, message, timestamp, displayName, profilePicture, link_preview, parent_message_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
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
      const newMessageId = result.rows[0].id;

      const newMessage = {
        id: newMessageId,
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
        reactions: [],
      };

      io.to(resolvedRoomId).emit("chat message", newMessage);

      if (normalizedParentId) {
        await db.query(
          "UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1",
          [normalizedParentId]
        );
        
        const res = await db.query("SELECT reply_count FROM messages WHERE id = $1", [normalizedParentId]);
        if (res.rows[0]) {
          io.to(resolvedRoomId).emit("reply count updated", {
            messageId: normalizedParentId,
            reply_count: res.rows[0].reply_count,
          });
        }
        
        io.to(`thread-${normalizedParentId}`).emit("thread message", newMessage);
      }

      if (typeof callback === "function") {
        callback({ success: true, message: "Message sent.", messageData: newMessage });
      }
    } catch (err) {
      if (err.remainingPoints === 0) {
        return typeof callback === "function" && callback({ success: false, message: "Too many messages. Please slow down." });
      }
      logger.error({ err }, "Send message error");
      if (typeof callback === "function") callback({ success: false, message: "Failed to send message." });
    }
  });

  socket.on("get thread", async ({ parent_message_id }) => {
    try {
      const parentMessageId = normalizePositiveInt(parent_message_id);
      if (!socket.username || !parentMessageId) return;

      const parentResult = await db.query(
        "SELECT room FROM messages WHERE id = $1 AND parent_message_id IS NULL",
        [parentMessageId]
      );
      const parentMessage = parentResult.rows[0];
      if (!parentMessage || !socket.room || socket.room !== parentMessage.room) {
        return;
      }

      const result = await db.query(
        `SELECT m.id, m.room, m.username, m.message, m.timestamp, 
                u.displayName AS "displayName", u.profilePicture AS "profilePicture", 
                m.link_preview, m.edited, m.parent_message_id, m.is_pinned, m.reply_count,
                (SELECT json_agg(re) FROM (
                    SELECT emoji, count(*) as count, json_agg(username) as usernames
                    FROM reactions 
                    WHERE message_id = m.id 
                    GROUP BY emoji
                ) re) as reactions
         FROM messages m 
         LEFT JOIN users u ON m.username = u.username 
         WHERE m.parent_message_id = $1 AND m.room = $2
         ORDER BY m.timestamp ASC`,
        [parentMessageId, socket.room]
      );

      socket.emit("thread history", {
        parent_message_id: parentMessageId,
        messages: result.rows.map(m => ({
          ...m,
          displayName: m.displayName || m.username,
          link_preview: m.link_preview ? JSON.parse(m.link_preview) : null,
          reactions: m.reactions || []
        }))
      });
      socket.join(`thread-${parentMessageId}`);
    } catch (err) {
      logger.error({ err }, "Get thread error");
    }
  });

  socket.on("leave thread", ({ parent_message_id }) => {
    const parentMessageId = normalizePositiveInt(parent_message_id);
    if (parentMessageId) socket.leave(`thread-${parentMessageId}`);
  });

  socket.on("editMessage", async ({ messageId, newMessage, roomId }, callback) => {
    try {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const resolvedRoomId = resolveRoomId(roomId, socket);
      const cleanMessage = sanitizeMessageText(newMessage);

      if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
        return typeof callback === "function" && callback({ success: false, message: "Unauthorized." });
      }
      if (!normalizedMessageId || !cleanMessage) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid data." });
      }

      const result = await db.query(
        "UPDATE messages SET message = $1, edited = TRUE, timestamp = CURRENT_TIMESTAMP WHERE id = $2 AND username = $3 RETURNING timestamp",
        [cleanMessage, normalizedMessageId, socket.username]
      );

      if (result.rowCount === 0) {
        return typeof callback === "function" && callback({ success: false, message: "Message not found or unauthorized." });
      }

      io.to(resolvedRoomId).emit("message edited", {
        id: normalizedMessageId,
        message: cleanMessage,
        timestamp: result.rows[0].timestamp,
        edited: true,
      });
      if (typeof callback === "function") callback({ success: true, message: "Message edited." });
    } catch (err) {
      logger.error({ err }, "Edit message error");
      if (typeof callback === "function") callback({ success: false, message: "Failed to edit message." });
    }
  });

  socket.on("deleteMessage", async ({ messageId, roomId }, callback) => {
    try {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const resolvedRoomId = resolveRoomId(roomId, socket);

      if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
        return typeof callback === "function" && callback({ success: false, message: "Unauthorized." });
      }

      const messageResult = await db.query(
        "SELECT username, parent_message_id FROM messages WHERE id = $1 AND room = $2",
        [normalizedMessageId, resolvedRoomId]
      );
      const message = messageResult.rows[0];

      if (!message) {
        return typeof callback === "function" && callback({ success: false, message: "Message not found." });
      }
      if (message.username !== socket.username && socket.role !== "admin") {
        return typeof callback === "function" && callback({ success: false, message: "Unauthorized." });
      }

      await db.query("DELETE FROM messages WHERE id = $1", [normalizedMessageId]);

      io.to(resolvedRoomId).emit("message deleted", { id: normalizedMessageId, deletedBy: socket.username });

      if (message.parent_message_id) {
        await db.query(
          "UPDATE messages SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = $1",
          [message.parent_message_id]
        );
        const res = await db.query("SELECT reply_count FROM messages WHERE id = $1", [message.parent_message_id]);
        if (res.rows[0]) {
          io.to(resolvedRoomId).emit("reply count updated", {
            messageId: message.parent_message_id,
            reply_count: res.rows[0].reply_count,
          });
        }
      }

      if (typeof callback === "function") callback({ success: true, message: "Message deleted." });
    } catch (err) {
      logger.error({ err }, "Delete message error");
      if (typeof callback === "function") callback({ success: false, message: "Failed to delete message." });
    }
  });

  const handlePinState = async ({ messageId, roomId }, callback, shouldPin) => {
    try {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const resolvedRoomId = resolveRoomId(roomId, socket);

      if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
        return typeof callback === "function" && callback({ success: false, message: "Unauthorized." });
      }

      const result = await db.query(
        "UPDATE messages SET is_pinned = $1 WHERE id = $2 AND room = $3 RETURNING id",
        [shouldPin, normalizedMessageId, resolvedRoomId]
      );

      if (result.rowCount === 0) {
        return typeof callback === "function" && callback({ success: false, message: "Message not found or unauthorized." });
      }

      const pinnedMessages = await db.query(
        `SELECT m.id, m.room, m.username, m.message, m.timestamp, 
                u.displayName AS "displayName", u.profilePicture AS "profilePicture", 
                m.link_preview, m.edited, m.parent_message_id, m.is_pinned, m.reply_count,
                (SELECT json_agg(re) FROM (
                    SELECT emoji, count(*) as count, json_agg(username) as usernames
                    FROM reactions 
                    WHERE message_id = m.id 
                    GROUP BY emoji
                ) re) as reactions
         FROM messages m 
         LEFT JOIN users u ON m.username = u.username 
         WHERE m.room = $1 AND m.is_pinned = TRUE 
         ORDER BY m.timestamp DESC`,
        [resolvedRoomId]
      );

      io.to(resolvedRoomId).emit("pinned messages updated", pinnedMessages.rows.map(m => ({
        ...m,
        displayName: m.displayName || m.username,
        link_preview: m.link_preview ? JSON.parse(m.link_preview) : null,
        is_pinned: true,
        reactions: m.reactions || []
      })));

      io.to(resolvedRoomId).emit(shouldPin ? "messagePinned" : "messageUnpinned", {
        messageId: normalizedMessageId,
        roomId: resolvedRoomId,
        updatedBy: socket.username,
      });

      if (typeof callback === "function") {
        callback({ success: true, message: `Message ${shouldPin ? "pinned" : "unpinned"} successfully.` });
      }
    } catch (err) {
      logger.error({ err }, "Pin/unpin error");
      if (typeof callback === "function") callback({ success: false, message: "Action failed." });
    }
  };

  socket.on("pinMessage", (payload, callback) => handlePinState(payload, callback, true));
  socket.on("unpinMessage", (payload, callback) => handlePinState(payload, callback, false));
};
