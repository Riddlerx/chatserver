const express = require("express");
const { query, validationResult } = require('express-validator');

const router = express.Router();

module.exports = (db) => {
  router.get("/search", [
      query('q').isString().trim().isLength({ min: 1 }).withMessage('Search query must be at least 1 character.'),
      query('room').isString().trim().isLength({ min: 1 }).withMessage('Room name is required.')
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { q, room } = req.query;
    const searchTerm = `%${q}%`;

    db.all(
        "SELECT * FROM messages WHERE room = ? AND message LIKE ? ORDER BY timestamp DESC LIMIT 50",
        [room, searchTerm],
        (err, rows) => {
            if (err) {
                console.error("Search error:", err);
                return res.status(500).json({ error: "Internal server error during search" });
            }
            res.json(rows || []);
        }
    );
  });

  return router;
};
