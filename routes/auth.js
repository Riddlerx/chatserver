const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { body, validationResult } = require('express-validator');
const logger = require('../logger');
const config = require('../config');

const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

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

      // Generate short-lived access token
      const token = jwt.sign(
        { 
          username: user.username, 
          role: user.role,
          displayName: user.displayName,
          profilePicture: user.profilePicture
        },
        config.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY },
      );

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none', // Changed from 'strict' to 'none'
        maxAge: 3600000 // 1 hour
      });

      // Generate long-lived refresh token
      const refreshToken = generateRefreshToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

      // Store refresh token in DB
      await db.query(
        'INSERT INTO refresh_tokens (username, token, expires_at) VALUES ($1, $2, $3)',
        [user.username, refreshToken, expiresAt.toISOString()]
      );

      // Clean up expired refresh tokens for this user (housekeeping)
      await db.query(
        'DELETE FROM refresh_tokens WHERE username = $1 AND expires_at < NOW()',
        [user.username]
      );

      // Set refreshToken as httpOnly cookie — JS cannot read it
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      });

      res.json({ 
        success: true, 
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

  // Refresh token endpoint — issues a new access token
  router.post("/refresh", async (req, res) => {
    // Read refresh token from httpOnly cookie
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token is required" });
    }

    try {
      // Look up the refresh token
      const result = await db.query(
        'SELECT rt.username, rt.expires_at, b.username AS banned_username FROM refresh_tokens rt LEFT JOIN banned_users b ON b.username = rt.username WHERE rt.token = $1',
        [refreshToken]
      );
      const tokenRecord = result.rows[0];

      if (!tokenRecord) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      // Check if user is banned
      if (tokenRecord.banned_username) {
        await db.query('DELETE FROM refresh_tokens WHERE username = $1', [tokenRecord.username]);
        res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });
        return res.status(403).json({ error: "Your account has been banned" });
      }

      // Check if token is expired
      if (new Date(tokenRecord.expires_at) < new Date()) {
        await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
        res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });
        return res.status(401).json({ error: "Refresh token expired" });
      }

      // Fetch latest user data
      const userResult = await db.query(
        'SELECT username, role, "displayname" AS "displayName", "profilepicture" AS "profilePicture" FROM users WHERE username = $1',
        [tokenRecord.username]
      );
      const user = userResult.rows[0];

      if (!user) {
        await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
        res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });
        return res.status(401).json({ error: "User not found" });
      }

      // Issue new access token
      const newToken = jwt.sign(
        {
          username: user.username,
          role: user.role,
          displayName: user.displayName,
          profilePicture: user.profilePicture
        },
        config.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY },
      );

      // Set new access token cookie
      res.cookie('token', newToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 3600000 // 1 hour
      });

      logger.info(`Token refreshed for user "${user.username}"`);

      res.json({
        success: true,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        profilePicture: user.profilePicture
      });
    } catch (err) {
      logger.error({ err }, "Token Refresh Error");
      res.status(500).json({ error: "Internal server error during token refresh" });
    }
  });

  // Logout endpoint — invalidates the refresh token and clears cookies
  router.post("/logout", async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      try {
        await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      } catch (err) {
        logger.error({ err }, "Logout Error");
      }
    }

    // Clear both auth cookies
    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
    res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });

    res.json({ success: true });
  });

  return router;
};
