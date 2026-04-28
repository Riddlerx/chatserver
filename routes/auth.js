const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { body, validationResult } = require('express-validator');



const registerValidationRules = [
  body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters long.'),
  body('password').isLength({ min: 4 }).withMessage('Password must be at least 4 characters long.'),
  body('displayName').optional().isLength({ min: 1 }).withMessage('Display name must be at least 1 character long.'),
];

const loginValidationRules = [
  body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters long.'),
  body('password').isLength({ min: 4 }).withMessage('Password must be at least 4 characters long.'),
];

module.exports = (db) => {
  // Register endpoint
  router.post("/register", registerValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, displayName } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      db.run(
        "INSERT INTO users (username, password, displayName, created_at) VALUES (?, ?, ?, ?)",
        [username, hashedPassword, displayName || username, new Date().toISOString()],
        function (err) {
          if (err) {
            if (err.message.includes("UNIQUE")) {
              return res.status(400).json({ error: "Username already taken" });
            }
            console.error("Registration DB Error:", err.message);
            return res.status(500).json({ error: "Registration failed" });
          }
          res.json({ success: true, username });
        },
      );
    } catch (err) {
      console.error("Registration Server Error:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

  // Login endpoint
  router.post("/login", loginValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    db.get("SELECT * FROM banned_users WHERE username = ?", [username], (err, bannedUser) => {
        if (err) {
            console.error("Login banned user check DB Error:", err.message);
            return res.status(500).json({ error: "Server error during login."});
        }
        if (bannedUser) {
            return res.status(403).json({ error: `You are banned. Reason: ${bannedUser.reason}`});
        }

        db.get(
          "SELECT username, password, role FROM users WHERE username = ?",
          [username],
          async (err, user) => {
            if (err || !user) {
              if (err) console.error("Login user lookup DB Error:", err.message);
              return res.status(401).json({ error: "Invalid credentials" });
            }

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) {
              return res.status(401).json({ error: "Invalid credentials" });
            }

            const token = jwt.sign(
              { username: user.username, role: user.role },
              process.env.JWT_SECRET,
              { expiresIn: "7d" },
            );

            res.json({ success: true, token, username: user.username });
          },
        );
    });
  });

  return router;
};
