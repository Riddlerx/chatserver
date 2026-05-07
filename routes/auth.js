const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { body, validationResult } = require('express-validator');



const registerValidationRules = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .matches(/^[A-Za-z0-9_]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, and underscores.'),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters long.'),
  body('displayName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Display name must be 1-50 characters long.'),
];

const loginValidationRules = [
  body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters long.'),
  body('password').isLength({ min: 4, max: 128 }).withMessage('Password must be 4-128 characters long.'),
];

module.exports = (db) => {
  // Register endpoint
  router.post("/register", registerValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const username = req.body.username.trim();
    const { password } = req.body;
    const displayName = req.body.displayName ? req.body.displayName.trim() : undefined;

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

    const username = req.body.username.trim();
    const { password } = req.body;

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
            if (err) {
              console.error("Login user lookup DB Error:", err.message);
              return res.status(500).json({ error: "Database error" });
            }
            if (!user) {
              console.log(`Login failed: User "${username}" not found.`);
              return res.status(401).json({ error: "Invalid credentials" });
            }

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) {
              console.log(`Login failed: Incorrect password for user "${username}".`);
              return res.status(401).json({ error: "Invalid credentials" });
            }

            console.log(`Login successful: "${username}"`);
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
