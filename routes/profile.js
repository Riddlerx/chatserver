const express = require("express");
const router = express.Router();
const { body, validationResult } = require('express-validator');

module.exports = (db) => {
  // Endpoint to get user profile by username
  router.get("/profile/:username", (req, res) => {
    const { username } = req.params;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if the requesting user is the same as the profile user or an admin
    if (req.user.username !== username && req.user.role !== 'admin') {
      return res.status(403).json({ error: "You can only view your own profile or profiles as an admin." });
    }

    db.get(
      "SELECT username, displayName, profilePicture, status, created_at FROM users WHERE username = ?",
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

  // Endpoint to update user profile (e.g., displayName, profilePicture)
  router.put("/profile/:username", 
    body('displayName').optional().isLength({ min: 1 }).withMessage('Display name must be at least 1 character long.'),
    // Add validation for profilePicture if it's a URL or specific format
    (req, res) => {
    const { username } = req.params;
    const { displayName } = req.body; // Add other fields like profilePicture here
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Ensure user is either the owner of the profile or an admin
    if (req.user.username !== username && req.user.role !== 'admin') {
      return res.status(403).json({ error: "You can only update your own profile or profiles as an admin." });
    }

    // Build the update query dynamically
    const updates = [];
    const params = [];

    if (displayName !== undefined) {
      updates.push("displayName = ?");
      params.push(displayName);
    }
    // Example for profilePicture update:
    // if (profilePicture !== undefined) {
    //   updates.push("profilePicture = ?");
    //   params.push(profilePicture);
    // }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update." });
    }

    params.push(username); // Add username for WHERE clause

    const query = `UPDATE users SET ${updates.join(', ')} WHERE username = ?`;

    db.run(query, params, function(err) {
      if (err) {
        console.error("Profile Update DB Error:", err.message);
        return res.status(500).json({ error: "Failed to update profile." });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "User not found or no changes made." });
      }
      res.json({ success: true, message: "Profile updated successfully." });
    });
  });

  // Endpoint to get user status (online/offline) - could be useful for frontend
  router.get("/status/:username", (req, res) => {
    const { username } = req.params;
    // This might require access to the activeSessions map, which is not directly available here.
    // For simplicity, let's assume a mock status or rely on Socket.IO for real-time updates.
    // In a real app, this might query a 'status' column in the DB that's updated by Socket.IO.
    res.json({ username: username, status: "online" }); // Placeholder
  });

  return router;
};
