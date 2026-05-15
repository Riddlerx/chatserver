const express = require("express");
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../logger');
const { broadcastUserList, emitUsersInRoom } = require('../socket_handlers/utils');

function isSafeMediaUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  if (value === "") {
    return true;
  }

  if (/['"<>\s]/.test(value)) {
    return false;
  }

  if (value.startsWith("/uploads/")) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_err) {
    return false;
  }
}

module.exports = (db) => {
  // Endpoint to search users
  router.get("/search", async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const searchTerm = `%${q.trim()}%`;
    try {
      const result = await db.query(
        `SELECT username, "displayname" AS "displayName", "profilepicture" AS "profilePicture", status 
         FROM users 
         WHERE username ILIKE $1 OR "displayname" ILIKE $1 
         LIMIT 10`,
        [searchTerm]
      );
      res.json(result.rows);
    } catch (err) {
      logger.error({ err }, "User Search DB Error");
      res.status(500).json({ error: "Search failed." });
    }
  });

  // Endpoint to get user profile by username
  router.get("/:username", async (req, res) => {
    const { username } = req.params;

    try {
      const result = await db.query(
        'SELECT username, "displayname" AS "displayName", "profilepicture" AS "profilePicture", status, bio, background, role, created_at FROM users WHERE username = $1',
        [username]
      );
      const user = result.rows[0];
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }
      res.json(user);
    } catch (err) {
      logger.error({ err }, "Profile Get DB Error");
      res.status(500).json({ error: "Failed to retrieve profile." });
    }
  });

  // Endpoint to update user profile
  router.post("/:username", 
    body('displayName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Display name must be 1-50 characters long.'),
    body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio must be 500 characters or fewer.'),
    body('status').optional().trim().isLength({ max: 120 }).withMessage('Status must be 120 characters or fewer.'),
    body('profilePicture').optional().custom(isSafeMediaUrl).withMessage('Profile picture must be an http(s) URL or uploaded file path.'),
    body('background').optional().custom(isSafeMediaUrl).withMessage('Background must be an http(s) URL or uploaded file path.'),
    async (req, res) => {
    const { username } = req.params;
    const { displayName, profilePicture, bio, status, background } = req.body;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Ensure user is either the owner of the profile or an admin
    if (req.user.username !== username && req.user.role !== 'admin') {
      return res.status(403).json({ error: "You can only update your own profile or profiles as an admin." });
    }

    const updates = [];
    const params = [];

    if (displayName !== undefined) { updates.push(`displayName = $${params.length + 1}`); params.push(displayName); }
    if (profilePicture !== undefined) { updates.push(`profilePicture = $${params.length + 1}`); params.push(profilePicture); }
    if (bio !== undefined) { updates.push(`bio = $${params.length + 1}`); params.push(bio); }
    if (status !== undefined) { updates.push(`status = $${params.length + 1}`); params.push(status); }
    if (background !== undefined) { updates.push(`background = $${params.length + 1}`); params.push(background); }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update." });
    }

    params.push(username);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE username = $${params.length}`;

    try {
      await db.query(query, params);

      const io = req.app.get('io');
      const activeSessions = req.app.get('activeSessions') || {};
      const rooms = req.app.get('rooms') || {};

      if (io) {
        const refreshedUserResult = await db.query(
          'SELECT username, "displayname" AS "displayName", "profilepicture" AS "profilePicture", status FROM users WHERE username = $1',
          [username]
        );
        const refreshedUser = refreshedUserResult.rows[0];

        if (refreshedUser) {
          for (const socket of io.of("/").sockets.values()) {
            if (socket.username === username) {
              socket.displayName = refreshedUser.displayName || refreshedUser.username;
              socket.profilePicture = refreshedUser.profilePicture || null;
              socket.status = refreshedUser.status || "online";
            }
          }
        }

        await broadcastUserList(io, db, activeSessions);

        for (const roomName of Object.keys(rooms)) {
          if (rooms[roomName]?.has(username)) {
            await emitUsersInRoom(io, roomName, db, rooms);
          }
        }
      }

      res.json({ success: true, message: "Profile updated successfully." });
    } catch (err) {
      logger.error({ err }, "Profile Update DB Error");
      res.status(500).json({ error: "Failed to update profile." });
    }
  });

  return router;
};
