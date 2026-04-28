const express = require("express");
const router = express.Router();
const { body, validationResult } = require('express-validator');

module.exports = (db) => {
  // Admin endpoint to get all users (requires admin role)
  router.get("/users", (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required." });
    }
    db.all("SELECT username, displayName, role, status, created_at FROM users", [], (err, rows) => {
      if (err) {
        console.error("Admin Get Users DB Error:", err.message);
        return res.status(500).json({ error: "Failed to retrieve users." });
      }
      res.json(rows);
    });
  });

  // Admin endpoint to delete a user
  router.delete("/users/:username", (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required." });
    }
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    db.run("DELETE FROM users WHERE username = ?", [username], function(err) {
      if (err) {
        console.error("Admin Delete User DB Error:", err.message);
        return res.status(500).json({ error: "Failed to delete user." });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "User not found." });
      }
      res.json({ success: true, message: `User ${username} deleted.` });
    });
  });

  // Admin endpoint to ban a user
  router.post("/users/ban/:username", 
    body('reason').isLength({ min: 1 }).withMessage('Reason for ban is required.'),
    (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required." });
    }
    const { username } = req.params;
    const { reason } = req.body;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    db.run(
      "INSERT OR REPLACE INTO banned_users (username, banned_by, reason, timestamp) VALUES (?, ?, ?, ?)",
      [username, req.user.username, reason, new Date().toISOString()],
      function(err) {
        if (err) {
          console.error("Admin Ban User DB Error:", err.message);
          return res.status(500).json({ error: "Failed to ban user." });
        }
        db.run("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
          [req.user.username, "ban", username, reason, new Date().toISOString()],
          (err) => { if (err) console.error("Audit log error:", err.message); }
        );
        res.json({ success: true, message: `User ${username} has been banned.` });
      }
    );
  });

  // Admin endpoint to unban a user
  router.delete("/users/ban/:username", (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required." });
    }
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    db.run("DELETE FROM banned_users WHERE username = ?", [username], function(err) {
      if (err) {
        console.error("Admin Unban User DB Error:", err.message);
        return res.status(500).json({ error: "Failed to unban user." });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "User not banned." });
      }
      db.run("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
        [req.user.username, "unban", username, "User unbanned", new Date().toISOString()],
        (err) => { if (err) console.error("Audit log error:", err.message); }
      );
      res.json({ success: true, message: `User ${username} has been unbanned.` });
    });
  });


  // Change user role
  router.post("/role/:username", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username } = req.params;
    const { role } = req.body;
    if (!["user", "moderator", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role." });
    db.run("UPDATE users SET role = ? WHERE username = ?", [role, username], function(err) {
      if (err) return res.status(500).json({ error: "Failed to update role." });
      if (this.changes === 0) return res.status(404).json({ error: "User not found." });
      db.run("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
        [req.user.username, "change_role", username, `Set role to ${role}`, new Date().toISOString()],
        (err) => { if (err) console.error("Audit log error:", err.message); }
      );
      res.json({ success: true, message: `Role updated to ${role}.` });
    });
  });

  // Kick user (just a notification via response, handled by socket)
  router.post("/kick", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username, reason } = req.body;
    if (!username) return res.status(400).json({ error: "Username required." });
    db.run("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
      [req.user.username, "kick", username, reason || "No reason provided", new Date().toISOString()],
      (err) => { if (err) console.error("Audit log error:", err.message); }
    );
    res.json({ success: true, message: `User ${username} kicked.` });
  });

  // Ban user (flat URL)
  router.post("/ban", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username, reason } = req.body;
    if (!username || !reason) return res.status(400).json({ error: "Username and reason required." });
    db.run("INSERT OR REPLACE INTO banned_users (username, banned_by, reason, timestamp) VALUES (?, ?, ?, ?)",
      [username, req.user.username, reason, new Date().toISOString()],
      function(err) {
        if (err) return res.status(500).json({ error: "Failed to ban user." });
        db.run("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
          [req.user.username, "ban", username, reason, new Date().toISOString()],
          (err) => { if (err) console.error("Audit log error:", err.message); }
        );
        res.json({ success: true, message: `User ${username} banned.` });
      }
    );
  });

  // Get audit log
  router.get("/audit-log", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    db.all("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100", [], (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed to fetch audit log." });
      res.json(rows || []);
    });
  });

  // Get/delete user by username (flat URL)
  router.get("/user/:username", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    db.get("SELECT username, displayName, role, status, created_at FROM users WHERE username = ?", [req.params.username], (err, user) => {
      if (err) return res.status(500).json({ error: "Failed to fetch user." });
      if (!user) return res.status(404).json({ error: "User not found." });
      res.json(user);
    });
  });

  router.delete("/user/:username", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    db.run("DELETE FROM users WHERE username = ?", [req.params.username], function(err) {
      if (err) return res.status(500).json({ error: "Failed to delete user." });
      if (this.changes === 0) return res.status(404).json({ error: "User not found." });
      db.run("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
        [req.user.username, "delete_user", req.params.username, "User deleted", new Date().toISOString()],
        (err) => { if (err) console.error("Audit log error:", err.message); }
      );
      res.json({ success: true });
    });
  });
  return router;
};