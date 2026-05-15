const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const logger = require("../logger");

module.exports = (db) => {
  async function performUserDeletion(username, res, adminUsername = null) {
    try {
      await db.query("DELETE FROM messages WHERE username = $1", [username]);
      await db.query("DELETE FROM direct_messages WHERE from_user = $1 OR to_user = $1", [username]);
      await db.query("DELETE FROM reactions WHERE username = $1", [username]);
      const result = await db.query("DELETE FROM users WHERE username = $1", [username]);
      
      if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });

      if (adminUsername) {
          await db.query("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES ($1, $2, $3, $4, $5)",
              [adminUsername, "delete_user", username, "Admin deleted user", new Date().toISOString()]);
      }
      res.json({ success: true, message: "User account deleted successfully" });
    } catch (err) {
      console.error("Delete user error:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }

  // Admin endpoint to get all users
  router.get("/users", async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    try {
      const result = await db.query('SELECT username, "displayname" AS "displayName", role, status, created_at FROM users');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to retrieve users." });
    }
  });

  // Delete user account (self or admin)
  router.delete("/user/:username", async (req, res) => {
    const { username } = req.params;
    const { password } = req.body;
    const isSelf = req.user.username === username;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: "Can only delete your own account or admin required" });
    }

    if (isSelf) {
      if (!password) return res.status(400).json({ error: "Password required for account deletion" });
      try {
        const result = await db.query("SELECT password FROM users WHERE username = $1", [username]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: "User not found" });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: "Invalid password" });
        
        await performUserDeletion(username, res);
      } catch (err) {
        res.status(500).json({ error: "Server error during account deletion" });
      }
    } else {
      await performUserDeletion(username, res, req.user.username);
    }
  });

  // Admin endpoint to ban a user
  router.post("/ban", async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username, reason } = req.body;
    if (!username || !reason) return res.status(400).json({ error: "Username and reason required." });

    try {
      await db.query(
        "INSERT INTO banned_users (username, banned_by, reason, timestamp) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET banned_by = EXCLUDED.banned_by, reason = EXCLUDED.reason, timestamp = EXCLUDED.timestamp",
        [username, req.user.username, reason, new Date().toISOString()]
      );
      await db.query("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES ($1, $2, $3, $4, $5)",
        [req.user.username, "ban", username, reason, new Date().toISOString()]);
      res.json({ success: true, message: `User ${username} has been banned.` });
    } catch (err) {
      logger.error({ err }, "Ban error");
      res.status(500).json({ error: "Failed to ban user." });
    }
  });

  // Admin endpoint to unban a user
  router.delete("/ban/:username", async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username } = req.params;
    try {
      const result = await db.query("DELETE FROM banned_users WHERE username = $1", [username]);
      if (result.rowCount === 0) return res.status(404).json({ error: "User not banned." });
      await db.query("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES ($1, $2, $3, $4, $5)",
        [req.user.username, "unban", username, "User unbanned", new Date().toISOString()]);
      res.json({ success: true, message: `User ${username} has been unbanned.` });
    } catch (err) {
      logger.error({ err }, "Unban error");
      res.status(500).json({ error: "Failed to unban user." });
    }
  });

  // Change user role
  router.post("/role/:username", async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username } = req.params;
    const { role } = req.body;
    if (!["user", "moderator", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role." });
    try {
      const result = await db.query("UPDATE users SET role = $1 WHERE username = $2", [role, username]);
      if (result.rowCount === 0) return res.status(404).json({ error: "User not found." });
      await db.query("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES ($1, $2, $3, $4, $5)",
        [req.user.username, "change_role", username, `Set role to ${role}`, new Date().toISOString()]);
      res.json({ success: true, message: `Role updated to ${role}.` });
    } catch (err) {
      logger.error({ err }, "Role update error");
      res.status(500).json({ error: "Failed to update role." });
    }
  });

  // Kick user
  router.post("/kick", async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    const { username, reason } = req.body;
    try {
      await db.query("INSERT INTO audit_log (admin_username, action, target_username, reason, timestamp) VALUES ($1, $2, $3, $4, $5)",
        [req.user.username, "kick", username, reason || "No reason provided", new Date().toISOString()]);
      res.json({ success: true, message: `User ${username} kicked.` });
    } catch (err) {
      logger.error({ err }, "Audit log error");
      res.status(500).json({ error: "Failed to log kick action." });
    }
  });

  // Get audit log
  router.get("/audit-log", async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    try {
      const result = await db.query("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100");
      res.json(result.rows || []);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch audit log." });
    }
  });

  // Get user by username
  router.get("/user/:username", async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required." });
    try {
      const result = await db.query('SELECT username, "displayname" AS "displayName", role, status, created_at FROM users WHERE username = $1', [req.params.username]);
      const user = result.rows[0];
      if (!user) return res.status(404).json({ error: "User not found." });
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch user." });
    }
  });

  return router;
};
