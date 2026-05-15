const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../logger');



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
      await db.query(
        "INSERT INTO users (username, password, displayName, created_at) VALUES ($1, $2, $3, $4)",
        [username, hashedPassword, displayName || username, new Date().toISOString()]
      );
      res.json({ success: true, username });
    } catch (err) {
      if (err.code === '23505') { // PostgreSQL unique violation code
        return res.status(400).json({ error: "Username already taken" });
      }
      logger.error({ err }, "Registration Error");
      res.status(500).json({ error: "Registration failed" });
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

    try {
      const bannedResult = await db.query("SELECT * FROM banned_users WHERE username = $1", [username]);
      const bannedUser = bannedResult.rows[0];
      
      if (bannedUser) {
        return res.status(403).json({ error: `You are banned. Reason: ${bannedUser.reason}` });
      }

      const userResult = await db.query(
        'SELECT username, password, role, "displayname" AS "displayName", "profilepicture" AS "profilePicture" FROM users WHERE username = $1',
        [username]
      );
      const user = userResult.rows[0];

      if (!user) {
        logger.info(`Login failed: User "${username}" not found.`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        logger.info(`Login failed: Incorrect password for user "${username}".`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      logger.info(`Login successful: "${username}"`);
      const token = jwt.sign(
        { 
          username: user.username, 
          role: user.role,
          displayName: user.displayName,
          profilePicture: user.profilePicture
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );

      res.json({ 
        success: true, 
        token, 
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        profilePicture: user.profilePicture
      });
    } catch (err) {
      logger.error({ err }, "Login Error");
      res.status(500).json({ error: "Internal server error during login" });
    }
  });

  return router;
};
