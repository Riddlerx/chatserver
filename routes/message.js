const express = require("express");
const { query, validationResult } = require('express-validator');

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
      const rows = await db.allAsync(
          "SELECT * FROM messages WHERE room = ? AND message LIKE ? ORDER BY timestamp DESC LIMIT 50",
          [room, searchTerm]
      );
      res.json(rows || []);
    } catch (err) {
      console.error("Search error:", err);
      res.status(500).json({ error: "Internal server error during search" });
    }
  });

  return router;
};
