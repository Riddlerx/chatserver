const dns = require("dns");
const axios = require("axios");
const { parse } = require("node-html-parser");
const { URL } = require("url");
const sanitizeHtml = require("sanitize-html");
const logger = require("../logger");

function normalizeString(value, { maxLength = 500, trim = true } = {}) {
  if (typeof value !== "string") return null;
  const normalized = trim ? value.trim() : value;
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function normalizeOptionalString(value, options) {
  if (value === undefined || value === null || value === "") return null;
  return normalizeString(value, options);
}

function normalizePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeMessageText(message) {
  if (typeof message !== "string") return null;
  const cleanMessage = sanitizeHtml(message, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTags: sanitizeHtml.defaults.allowedTags,
  }).trim();
  if (!cleanMessage || cleanMessage.length > 4000) return null;
  return cleanMessage;
}

function resolveRoomId(candidate, socket) {
  return normalizeOptionalString(candidate, { maxLength: 80 }) || socket.room || null;
}

function isValidRoomName(name) {
  return typeof name === "string" && /^[A-Za-z0-9_-]{1,50}$/.test(name);
}

async function emitUsersInRoom(io, room, db, rooms) {
  try {
    const result = await db.query('SELECT username, "displayname" AS "displayName", "profilepicture" AS "profilePicture", status FROM users');
    const users = result.rows;
    const roomStatuses = rooms[room] || new Map();
    
    const usersInRoom = users.map((user) => {
      const isOnline = roomStatuses.has(user.username);
      let status = "offline";
      if (isOnline) {
        status = roomStatuses.get(user.username) || user.status || "online";
        if (status === "offline") status = "online";
      }
      return { ...user, isOnline, status };
    });

    io.to(room).emit("userList", usersInRoom);
  } catch (err) {
    logger.error({ err, room }, "emitUsersInRoom error");
  }
}

async function broadcastUserList(io, db, activeSessions) {
  try {
    const result = await db.query('SELECT username, "displayname" AS "displayName", "profilepicture" AS "profilePicture", status FROM users');
    const users = result.rows;
    const onlineUsernames = new Set(Object.keys(activeSessions));
    
    const usersWithOnlineStatus = users.map((user) => {
      const isOnline = onlineUsernames.has(user.username);
      let status = "offline";
      if (isOnline) {
        status = user.status || "online";
        if (status === "offline") status = "online";
      }
      return { ...user, isOnline, status };
    });

    io.emit("userList", usersWithOnlineStatus);

    // Optimized Unread Counts
    for (const [username, socketId] of Object.entries(activeSessions)) {
      const socket = io.of("/").sockets.get(socketId);
      if (!socket) continue;

      try {
        const unreadCounts = {};

        // 1. Room unreads (Consolidated query)
        const roomUnreads = await db.query(
          `SELECT cr.name, 
                  (SELECT COUNT(*) FROM messages m 
                   LEFT JOIN last_read_status lrs ON m.room = lrs.room AND lrs.username = $1 AND lrs.is_dm = FALSE
                   WHERE m.room = cr.name AND (lrs.last_read_message_id IS NULL OR m.id > lrs.last_read_message_id)
                  ) as count
           FROM custom_rooms cr`,
          [username]
        );
        
        roomUnreads.rows.forEach(row => {
          if (row.count > 0) unreadCounts[row.name] = parseInt(row.count);
        });

        // 2. DM unreads (Consolidated query)
        const dmUnreads = await db.query(
          `SELECT dm.from_user as sender, COUNT(*) as count
           FROM direct_messages dm
           LEFT JOIN last_read_status lrs ON dm.from_user = lrs.room AND lrs.username = $1 AND lrs.is_dm = TRUE
           WHERE dm.to_user = $1 AND (lrs.last_read_message_id IS NULL OR dm.id > lrs.last_read_message_id)
           GROUP BY dm.from_user`,
          [username]
        );
        
        dmUnreads.rows.forEach(row => {
          if (row.count > 0) unreadCounts[row.sender] = parseInt(row.count);
        });

        socket.emit("unreadCounts", unreadCounts);
      } catch (err) {
        logger.error({ err, username }, "Error calculating unread counts for user");
      }
    }
  } catch (err) {
    logger.error({ err }, "broadcastUserList error");
  }
}

async function broadcastRoomList(io, db) {
  try {
    const result = await db.query(
      "SELECT name, (password IS NOT NULL AND password != '') as is_private FROM custom_rooms ORDER BY name ASC"
    );
    io.emit("custom rooms", result.rows || []);
  } catch (err) {
    logger.error({ err }, "broadcastRoomList error");
  }
}

function cleanupSocket(socket) {
  delete socket.username;
  delete socket.displayName;
  delete socket.profilePicture;
  delete socket.role;
  delete socket.room;
  delete socket.status;
}

async function fetchLinkPreview(url) {
  try {
    const parsedUrl = new URL(url);
    const ip = await new Promise((resolve, reject) => {
      dns.lookup(parsedUrl.hostname, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });

    const isPrivate = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.)/.test(ip) || ip === "::1";
    if (isPrivate) throw new Error("Private/Local IP access forbidden.");

    const response = await axios.get(url, { timeout: 5000, maxRedirects: 3, responseType: "text" });
    const root = parse(response.data);
    return {
      title: root.querySelector("meta[property='og:title']")?.getAttribute("content") || root.querySelector("title")?.text || url,
      description: root.querySelector("meta[name='description']")?.getAttribute("content") || root.querySelector("meta[property='og:description']")?.getAttribute("content") || "",
      image: root.querySelector("meta[property='og:image']")?.getAttribute("content") || "",
      url,
    };
  } catch (error) {
    logger.debug({ error: error.message, url }, "Link preview failed");
    return null;
  }
}

async function broadcastUserUpdate(io, db, username, activeSessions) {
  try {
    const result = await db.query(
      'SELECT username, "displayname" AS "displayName", "profilepicture" AS "profilePicture", status FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];
    if (!user) return;

    const isOnline = !!activeSessions[username];
    const status = isOnline ? (user.status || "online") : "offline";
    
    io.emit("userStatusChanged", { ...user, isOnline, status });
  } catch (err) {
    logger.error({ err, username }, "broadcastUserUpdate error");
  }
}

async function markAsRead(io, db, username, room, isDm, lastMessageId, activeSessions) {
  try {
    if (!lastMessageId) {
      // Find the latest message ID if not provided
      const query = isDm 
        ? "SELECT id FROM direct_messages WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1) ORDER BY timestamp DESC LIMIT 1"
        : "SELECT id FROM messages WHERE room = $1 ORDER BY timestamp DESC LIMIT 1";
      const params = isDm ? [username, room] : [room];
      const result = await db.query(query, params);
      lastMessageId = result.rows[0]?.id;
    }

    if (lastMessageId) {
      await db.query(
        `INSERT INTO last_read_status (username, room, is_dm, last_read_message_id, last_read_at) 
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (username, room, is_dm) 
         DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id, last_read_at = CURRENT_TIMESTAMP`,
        [username, room, isDm, lastMessageId]
      );

      // If DM, also update direct_messages read_at
      if (isDm) {
        const readAt = new Date().toISOString();
        await db.query(
          "UPDATE direct_messages SET read_at = $1 WHERE to_user = $2 AND from_user = $3 AND read_at IS NULL",
          [readAt, username, room]
        );

        // Notify the sender that their messages were read
        if (activeSessions && activeSessions[room]) {
          io.to(activeSessions[room]).emit("dmRead", {
            byUser: username,
            at: readAt
          });
        }
      }
    }
  } catch (err) {
    logger.error({ err, username, room }, "markAsRead error");
  }
}

module.exports = {
  normalizeString,
  normalizeOptionalString,
  normalizePositiveInt,
  sanitizeMessageText,
  resolveRoomId,
  isValidRoomName,
  emitUsersInRoom,
  broadcastUserList,
  broadcastUserUpdate,
  broadcastRoomList,
  markAsRead,
  cleanupSocket,
  fetchLinkPreview,
};
