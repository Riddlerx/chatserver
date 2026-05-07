const express = require("express");
const router = express.Router();
const { body, validationResult } = require('express-validator');

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
  } catch (err) {
    return false;
  }
}

module.exports = (db) => {
  // Endpoint to get user profile by username
  router.get("/:username", (req, res) => {
    const { username } = req.params;

    db.get(
      "SELECT username, displayName, profilePicture, status, bio, background, role, created_at FROM users WHERE username = ?",
      [username],
      (err, user) => {
        if (err) {
          console.error("Profile Get DB Error:", err.message);
          return res.status(500).json({ error: "Failed to retrieve profile." });
        }
        if (!user) {
          return res.status(404).json({ error: "User not found." });
        }
        res.json(user);
      }
    );
  });

  // Endpoint to update user profile
  router.post("/:username", 
    body('displayName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Display name must be 1-50 characters long.'),
    body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio must be 500 characters or fewer.'),
    body('status').optional().trim().isLength({ max: 120 }).withMessage('Status must be 120 characters or fewer.'),
    body('profilePicture').optional().custom(isSafeMediaUrl).withMessage('Profile picture must be an http(s) URL or uploaded file path.'),
    body('background').optional().custom(isSafeMediaUrl).withMessage('Background must be an http(s) URL or uploaded file path.'),
    (req, res) => {
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

    if (displayName !== undefined) { updates.push("displayName = ?"); params.push(displayName); }
    if (profilePicture !== undefined) { updates.push("profilePicture = ?"); params.push(profilePicture); }
    if (bio !== undefined) { updates.push("bio = ?"); params.push(bio); }
    if (status !== undefined) { updates.push("status = ?"); params.push(status); }
    if (background !== undefined) { updates.push("background = ?"); params.push(background); }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update." });
    }

    params.push(username);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE username = ?`;

    db.run(query, params, function(err) {
      if (err) {
        console.error("Profile Update DB Error:", err.message);
        return res.status(500).json({ error: "Failed to update profile." });
      }
      res.json({ success: true, message: "Profile updated successfully." });
    });
  });

  return router;
};
