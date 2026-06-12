const bcrypt = require("bcrypt");
const logger = require("../logger");
const {
  normalizeOptionalString,
  isValidRoomName,
  emitUsersInRoom,
  broadcastUserList,
  broadcastRoomList,
  markAsRead,
} = require("./utils");

module.exports = (io, db, socket, rooms, activeSessions) => {
  socket.on("joinRoom", async ({ room, password }, callback) => {
    try {
      const normalizedRoom = normalizeOptionalString(room, { maxLength: 80 });
      logger.debug({ socketId: socket.id, username: socket.username, room: normalizedRoom }, "User attempting to join room");

      if (!socket.username) {
        return typeof callback === "function" && callback({ success: false, message: "Authentication required." });
      }

      if (!normalizedRoom || !isValidRoomName(normalizedRoom)) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid room." });
      }

      const roomResult = await db.query("SELECT name, password FROM custom_rooms WHERE name = $1", [normalizedRoom]);
      const roomRecord = roomResult.rows[0];

      if (!roomRecord) {
        return typeof callback === "function" && callback({ success: false, message: "Room not found." });
      }

      if (roomRecord.password && socket.role !== "admin") {
        const match = await bcrypt.compare(password || "", roomRecord.password);
        if (!match) {
          socket.emit("join room error", { error: "Incorrect room password.", room: normalizedRoom });
          return typeof callback === "function" && callback({ success: false, message: "Incorrect room password." });
        }
      }

      if (socket.room) {
        const previousRoom = socket.room;
        if (rooms[previousRoom]) {
          rooms[previousRoom].delete(socket.username);
          if (rooms[previousRoom].size === 0) delete rooms[previousRoom];
          else await emitUsersInRoom(io, previousRoom, db, rooms);
        }
        socket.leave(previousRoom);
      }

      socket.room = normalizedRoom;
      socket.join(normalizedRoom);
      logger.info({ socketId: socket.id, username: socket.username, room: normalizedRoom }, "User successfully joined room");

      if (!rooms[normalizedRoom]) rooms[normalizedRoom] = new Map();
      rooms[normalizedRoom].set(socket.username, socket.status || "online");

      // Mark room as read
      await markAsRead(io, db, socket.username, normalizedRoom, false, null, activeSessions);

      // Fetch message history (Limit to initial 50 messages)
      const messagesResult = await db.query(
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
         WHERE m.room = $1 
         ORDER BY m.timestamp DESC 
         LIMIT 50`,
        [normalizedRoom]
      );
      
      socket.emit("messageHistory", {
        room: normalizedRoom,
        messages: messagesResult.rows.reverse().map(m => ({
          ...m,
          displayName: m.displayName || m.username,
          link_preview: m.link_preview ? JSON.parse(m.link_preview) : null,
          edited: Boolean(m.edited),
          is_pinned: Boolean(m.is_pinned),
          reply_count: m.reply_count || 0,
          reactions: m.reactions || []
        })),
        hasMore: messagesResult.rows.length === 50
      });

      // Fetch pinned messages
      const pinnedResult = await db.query(
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
        [normalizedRoom]
      );

      socket.emit("pinned messages", pinnedResult.rows.map(m => ({
        ...m,
        displayName: m.displayName || m.username,
        link_preview: m.link_preview ? JSON.parse(m.link_preview) : null,
        is_pinned: true,
        reactions: m.reactions || []
      })));

      await broadcastRoomList(io, db);
      await broadcastUserList(io, db, activeSessions);
      await emitUsersInRoom(io, normalizedRoom, db, rooms);

      if (typeof callback === "function") {
        callback({ success: true, message: `Joined room "${normalizedRoom}".` });
      }
    } catch (err) {
      logger.error({ err, room }, "Error in joinRoom handler");
      if (typeof callback === "function") {
        callback({ success: false, message: "Internal server error joining room." });
      }
    }
  });

  socket.on("markRoomAsRead", async ({ room }) => {
    const normalizedRoom = normalizeOptionalString(room, { maxLength: 80 });
    if (socket.username && normalizedRoom && socket.room === normalizedRoom) {
      await markAsRead(io, db, socket.username, normalizedRoom, false, null, activeSessions);
    }
  });

  socket.on("loadMoreMessages", async ({ room, beforeTimestamp }, callback) => {
    try {
      const normalizedRoom = normalizeOptionalString(room, { maxLength: 80 });
      if (!socket.username || !normalizedRoom || !socket.room || socket.room !== normalizedRoom) return;

      const messagesResult = await db.query(
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
         WHERE m.room = $1 AND m.timestamp < $2
         ORDER BY m.timestamp DESC 
         LIMIT 50`,
        [normalizedRoom, beforeTimestamp]
      );

      const messages = messagesResult.rows.reverse().map(m => ({
        ...m,
        displayName: m.displayName || m.username,
        link_preview: m.link_preview ? JSON.parse(m.link_preview) : null,
        edited: Boolean(m.edited),
        is_pinned: Boolean(m.is_pinned),
        reply_count: m.reply_count || 0,
        reactions: m.reactions || []
      }));

      if (typeof callback === "function") {
        callback({ 
          success: true, 
          messages,
          hasMore: messagesResult.rows.length === 50
        });
      }
    } catch (err) {
      logger.error({ err, room }, "Error in loadMoreMessages handler");
      if (typeof callback === "function") {
        callback({ success: false, message: "Failed to load more messages." });
      }
    }
  });

  socket.on("create room", async ({ name, password }, callback) => {
    try {
      const normalizedName = normalizeOptionalString(name, { maxLength: 50 });
      let hashedPassword = password ? await bcrypt.hash(password, 10) : null;

      if (!socket.username) {
        return typeof callback === "function" && callback({ success: false, message: "Authentication required." });
      }

      if (!normalizedName || !isValidRoomName(normalizedName)) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid room name." });
      }

      await db.query(
        "INSERT INTO custom_rooms (name, created_by, password) VALUES ($1, $2, $3)",
        [normalizedName, socket.username, hashedPassword]
      );

      await broadcastRoomList(io, db);
      if (typeof callback === "function") callback({ success: true, message: "Room created." });
    } catch (err) {
      if (err.code === '23505') {
        return typeof callback === "function" && callback({ success: false, message: "Room already exists." });
      }
      logger.error({ err }, "Create room error");
      if (typeof callback === "function") callback({ success: false, message: "Failed to create room." });
    }
  });

  socket.on("delete room", async ({ name }, callback) => {
    try {
      const normalizedName = normalizeOptionalString(name, { maxLength: 50 });
      if (!socket.username || socket.role !== "admin") {
        return typeof callback === "function" && callback({ success: false, message: "Admin access required." });
      }

      if (!normalizedName || ["main", "general"].includes(normalizedName)) {
        return typeof callback === "function" && callback({ success: false, message: "Cannot delete this room." });
      }

      const result = await db.query("DELETE FROM custom_rooms WHERE name = $1", [normalizedName]);
      if (result.rowCount === 0) {
        return typeof callback === "function" && callback({ success: false, message: "Room not found." });
      }

      delete rooms[normalizedName];
      await broadcastRoomList(io, db);
      if (typeof callback === "function") callback({ success: true, message: "Room deleted." });
    } catch (err) {
      logger.error({ err, name }, "Delete room error");
      if (typeof callback === "function") callback({ success: false, message: "Failed to delete room." });
    }
  });
};
