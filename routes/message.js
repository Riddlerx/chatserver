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

    try {
      res.status(501).json({ error: "Message search not implemented in this temporary config." });
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Internal server error during search" });
    }
  });

  return router;
};
