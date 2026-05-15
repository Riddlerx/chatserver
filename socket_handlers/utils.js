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

module.exports = {
  normalizeString,
  normalizeOptionalString,
  normalizePositiveInt,
  sanitizeMessageText,
  resolveRoomId,
  isValidRoomName,
  emitUsersInRoom,
  broadcastUserList,
  broadcastRoomList,
  cleanupSocket,
  fetchLinkPreview,
};
