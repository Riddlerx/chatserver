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
