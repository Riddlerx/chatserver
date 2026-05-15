const {
  normalizeOptionalString,
  sanitizeMessageText,
  markAsRead,
} = require("./utils");
const logger = require('../logger');

module.exports = (io, db, socket, activeSessions) => {
  socket.on("send dm", async ({ toUser, message }, callback) => {
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
    try {
      const result = await db.query(
        "INSERT INTO direct_messages (from_user, to_user, message, timestamp) VALUES ($1, $2, $3, $4) RETURNING id",
        [socket.username, normalizedRecipient, cleanMessage, timestamp]
      );
      const lastID = result.rows[0].id;

      const dmData = {
        id: lastID,
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
    } catch (err) {
      logger.error({ err }, "Send DM DB Error");
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Failed to send DM." })
      );
    }
  });

  socket.on("get dm history", async ({ withUser }, callback) => {
    const normalizedUser = normalizeOptionalString(withUser, { maxLength: 30 });
    if (!socket.username || !normalizedUser) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid user." })
      );
    }

    try {
      const result = await db.query(
        `SELECT dm.*, u."displayname" AS "fromDisplayName", u."profilepicture" AS "fromProfilePicture" 
         FROM direct_messages dm 
         LEFT JOIN users u ON dm.from_user = u.username 
         WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1) 
         ORDER BY timestamp DESC 
         LIMIT 50`,
        [socket.username, normalizedUser]
      );
      const rows = result.rows;

      // Mark DM as read
      await markAsRead(io, db, socket.username, normalizedUser, true, null, activeSessions);

      socket.emit("dm history", {
        withUser: normalizedUser,
        messages: rows.reverse().map((row) => ({
          id: row.id,
          username: row.from_user,
          displayName: row.fromDisplayName,
          profilePicture: row.fromProfilePicture,
          to: row.to_user,
          message: row.message,
          timestamp: row.timestamp,
          edited: Boolean(row.edited),
          read_at: row.read_at,
        })),
        hasMore: rows.length === 50
      });

      if (typeof callback === "function") callback({ success: true });
    } catch (err) {
      logger.error({ err }, "Get DM history DB Error");
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Failed to fetch DM history." })
      );
    }
  });

  socket.on("markDMAsRead", async ({ withUser }) => {
    const normalizedUser = normalizeOptionalString(withUser, { maxLength: 30 });
    if (socket.username && normalizedUser) {
      await markAsRead(io, db, socket.username, normalizedUser, true, null, activeSessions);
    }
  });

  socket.on("loadMoreDMs", async ({ withUser, beforeTimestamp }, callback) => {
    const normalizedUser = normalizeOptionalString(withUser, { maxLength: 30 });
    if (!socket.username || !normalizedUser) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid user." })
      );
    }

    try {
      const result = await db.query(
        `SELECT dm.*, u."displayname" AS "fromDisplayName", u."profilepicture" AS "fromProfilePicture" 
         FROM direct_messages dm 
         LEFT JOIN users u ON dm.from_user = u.username 
         WHERE ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
         AND timestamp < $3
         ORDER BY timestamp DESC 
         LIMIT 50`,
        [socket.username, normalizedUser, beforeTimestamp]
      );
      
      const messages = result.rows.reverse().map((row) => ({
        id: row.id,
        username: row.from_user,
        displayName: row.fromDisplayName,
        profilePicture: row.fromProfilePicture,
        to: row.to_user,
        message: row.message,
        timestamp: row.timestamp,
        edited: Boolean(row.edited),
        read_at: row.read_at,
      }));

      if (typeof callback === "function") {
        callback({ 
          success: true, 
          messages,
          hasMore: result.rows.length === 50
        });
      }
    } catch (err) {
      logger.error({ err }, "Load more DMs DB Error");
      if (typeof callback === "function") {
        callback({ success: false, message: "Failed to load more DMs." });
      }
    }
  });

  socket.on("edit dm", async ({ messageId, newMessage }, callback) => {
    const { normalizePositiveInt } = require("./utils");
    const normalizedMessageId = normalizePositiveInt(messageId);
    const cleanMessage = sanitizeMessageText(newMessage);

    if (!socket.username || !normalizedMessageId || !cleanMessage) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid request." })
      );
    }

    try {
      const result = await db.query(
        "SELECT from_user, to_user FROM direct_messages WHERE id = $1",
        [normalizedMessageId]
      );
      const dm = result.rows[0];

      if (!dm) {
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
      await db.query(
        "UPDATE direct_messages SET message = $1, edited = true, timestamp = $2 WHERE id = $3",
        [cleanMessage, timestamp, normalizedMessageId]
      );

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
    } catch (err) {
      logger.error({ err }, "Edit DM DB Error");
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Failed to update DM." })
      );
    }
  });

  socket.on("delete dm", async ({ messageId }, callback) => {
    const { normalizePositiveInt } = require("./utils");
    const normalizedMessageId = normalizePositiveInt(messageId);

    if (!socket.username || !normalizedMessageId) {
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Invalid request." })
      );
    }

    try {
      const result = await db.query(
        "SELECT from_user, to_user FROM direct_messages WHERE id = $1",
        [normalizedMessageId]
      );
      const dm = result.rows[0];

      if (!dm) {
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

      await db.query(
        "DELETE FROM direct_messages WHERE id = $1",
        [normalizedMessageId]
      );

      // Notify both parties
      const recipientSocketId = activeSessions[dm.to_user];
      if (recipientSocketId)
        io.to(recipientSocketId).emit("dm deleted", { id: normalizedMessageId });
      socket.emit("dm deleted", { id: normalizedMessageId });

      if (typeof callback === "function") callback({ success: true });
    } catch (err) {
      logger.error({ err }, "Delete DM DB Error");
      return (
        typeof callback === "function" &&
        callback({ success: false, message: "Failed to delete DM." })
      );
    }
  });
};
