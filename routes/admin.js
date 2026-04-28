const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { body, validationResult } = require('express-validator');

module.exports = (db) => {
  function performUserDeletion(username, res, adminUsername = null) {
    db.serialize(() => {
      db.run("DELETE FROM messages WHERE username = ?", [username]);
      db.run("DELETE FROM direct_messages WHERE from_user = ? OR to_user = ?", [username, username]);
      db.run("DELETE FROM reactions WHERE username = ?", [username]);
      db.run("DELETE FROM users WHERE username = ?", [username], function(err) {
        if (err) {
          console.error("Delete user error:", err);
          return res.status(500).json({ error: "Failed to delete user" });
        }
        if (this.changes === 0) return res.status(404).json({ error: "User not found" });

        if (adminUsername) {
            db.run("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
                [adminUsername, "delete_user", username, "Admin deleted user", new Date().toISOString()],
                (err) => { if (err) console.error("Audit log error:", err.message); }
            );
        }
        res.json({ success: true, message: "User account deleted successfully" });
      });
    });
  }

  // Admin endpoint to get all users
  router.get("/users", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    db.all("SELECT username, displayName, role, status, created_at FROM users", [], (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed to retrieve users." });
      res.json(rows);
    });
  });

  // Delete user account (self or admin)
  router.delete("/user/:username", (req, res) => {
    const { username } = req.params;
    const { password } = req.body;
    const isSelf = req.user.username === username;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: "Can only delete your own account or admin required" });
    }

    if (isSelf) {
      if (!password) return res.status(400).json({ error: "Password required for account deletion" });
      db.get("SELECT password FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) return res.status(404).json({ error: "User not found" });
        bcrypt.compare(password, user.password, (err, valid) => {
          if (err || !valid) return res.status(401).json({ error: "Invalid password" });
          performUserDeletion(username, res);
        });
      });
    } else {
      performUserDeletion(username, res, req.user.username);
    }
  });

  // Admin endpoint to ban a user
  router.post("/ban", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username, reason } = req.body;
    if (!username || !reason) return res.status(400).json({ error: "Username and reason required." });

    db.run(
      "INSERT OR REPLACE INTO banned_users (username, banned_by, reason, timestamp) VALUES (?, ?, ?, ?)",
      [username, req.user.username, reason, new Date().toISOString()],
      function(err) {
        if (err) return res.status(500).json({ error: "Failed to ban user." });
        db.run("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
          [req.user.username, "ban", username, reason, new Date().toISOString()],
          (err) => { if (err) console.error("Audit log error:", err.message); }
        );
        res.json({ success: true, message: `User ${username} has been banned.` });
      }
    );
  });

  // Admin endpoint to unban a user
  router.delete("/ban/:username", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username } = req.params;
    db.run("DELETE FROM banned_users WHERE username = ?", [username], function(err) {
      if (err) return res.status(500).json({ error: "Failed to unban user." });
      if (this.changes === 0) return res.status(404).json({ error: "User not banned." });
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

  // Kick user
  router.post("/kick", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username, reason } = req.body;
    db.run("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES (?, ?, ?, ?, ?)",
      [req.user.username, "kick", username, reason || "No reason provided", new Date().toISOString()],
      (err) => { if (err) console.error("Audit log error:", err.message); }
    );
    res.json({ success: true, message: `User ${username} kicked.` });
  });

  // Get audit log
  router.get("/audit-log", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    db.all("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100", [], (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed to fetch audit log." });
      res.json(rows || []);
    });
  });

  // Get user by username
  router.get("/user/:username", (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    db.get("SELECT username, displayName, role, status, created_at FROM users WHERE username = ?", [req.params.username], (err, user) => {
      if (err) return res.status(500).json({ error: "Failed to fetch user." });
      if (!user) return res.status(404).json({ error: "User not found." });
      res.json(user);
    });
  });

  return router;
};
