const express = require("express");
const { query, validationResult } = require('express-validator');
const logger = require("../logger");

const router = express.Router();

module.exports = (db) => {
  router.get("/search", [
      query('q').isString().trim().isLength({ min: 1 }).withMessage('Search query must be at least 1 character.'),
      query('room').isString().trim().isLength({ min: 1 }).withMessage('Room name is required.')
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { q, room } = req.query;
    
    // Check if the room exists and if it is private
    try {
        const roomResult = await db.query("SELECT name, password FROM custom_rooms WHERE name = $1", [room]);
        const roomRecord = roomResult.rows[0];

        if (roomRecord && roomRecord.password && req.user.role !== 'admin') {
           const activeRooms = req.app.get('rooms');
           const isJoined = activeRooms && activeRooms[room] && activeRooms[room].has(req.user.username);
           
           if (!isJoined) {
              return res.status(403).json({ error: "Cannot search private rooms via this endpoint without being actively joined." });
           }
        }
    } catch (err) {
        logger.error({ err }, "Error checking room permissions during search");
        return res.status(500).json({ error: "Internal server error" });
    }

    const searchTerm = `%${q}%`;

    try {
      const result = await db.query(
          `SELECT m.*, u.displayName AS "displayName", u.profilePicture AS "profilePicture",
                (SELECT json_agg(re) FROM (
                    SELECT emoji, count(*) as count, json_agg(username) as usernames
                    FROM reactions 
                    WHERE message_id = m.id 
                    GROUP BY emoji
                ) re) as reactions
           FROM messages m 
           LEFT JOIN users u ON m.username = u.username 
           WHERE m.room = $1 AND m.message LIKE $2 
           ORDER BY m.timestamp DESC LIMIT 50`,
          [room, searchTerm]
      );
      res.json(result.rows.map(m => ({
        ...m,
        displayName: m.displayName || m.username,
        reactions: m.reactions || []
      })));
    } catch (err) {
      logger.error({ err }, "Search error");
      res.status(500).json({ error: "Internal server error during search" });
    }
  });

  return router;
};
