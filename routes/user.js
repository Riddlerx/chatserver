const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();

module.exports = (db, authMiddleware, activeSessions, io) => {
  function performUserDeletion(username, res) {
    console.log("Performing deletion for:", username);

    db.serialize(() => {
      // Delete user's messages
      db.run("DELETE FROM messages WHERE username = ?", [username]);

      // Delete user's direct messages
      db.run("DELETE FROM direct_messages WHERE from_user = ? OR to_user = ?", [
        username,
        username,
      ]);

      // Delete user's reactions
      db.run("DELETE FROM reactions WHERE username = ?", [username]);

      // Delete the user account
      db.run(
        "DELETE FROM users WHERE username = ?",
        [username],
        function (err) {
          if (err) {
            console.log("Delete user error:", err);
            return res.status(500).json({ error: "Failed to delete user" });
          }

          if (this.changes === 0) {
            console.log("No user found to delete");
            return res.status(404).json({ error: "User not found" });
          }

          // Disconnect user if online
          const socketId = activeSessions[username];
          if (socketId) {
            io.sockets.sockets.get(socketId)?.disconnect();
            delete activeSessions[username];
          }

          console.log("User deleted successfully");
          res.json({
            success: true,
            message: "User account deleted successfully",
          });
        },
      );
    });
  }

  // Delete user account (self or admin)
  router.delete("/user/:username", authMiddleware, (req, res) => {
    console.log("Delete request received for:", req.params.username);
    console.log("Request body:", req.body);
    console.log("Request user:", req.user);

    const { username } = req.params;
    const { password } = req.body;
    const isSelf = req.user.username === username;
    const isAdmin = req.user.role === "admin";

    if (!isSelf && !isAdmin) {
      console.log("Delete failed: not self and not admin");
      return res
        .status(403)
        .json({ error: "Can only delete your own account or admin required" });
    }

    // For self-deletion, require password verification
    if (isSelf && !password) {
      return res
        .status(400)
        .json({ error: "Password required for account deletion" });
    }

    // Verify password for self-deletion
    if (isSelf) {
      db.get(
        "SELECT password FROM users WHERE username = ?",
        [username],
        (err, user) => {
          if (err || !user) {
            console.log("User lookup failed:", err);
            return res.status(404).json({ error: "User not found" });
          }

          bcrypt.compare(password, user.password, (err, validPassword) => {
            console.log("Password valid:", validPassword);
            if (err) {
              console.log("Password compare error:", err);
              return res
                .status(500)
                .json({ error: "Password verification failed" });
            }

            if (!validPassword) {
              return res.status(401).json({ error: "Invalid password" });
            }

            // Proceed with deletion
            performUserDeletion(username, res);
          });
        },
      );
    } else {
      // Admin deletion - no password needed
      performUserDeletion(username, res);
    }
  });

  // Admin: Delete user
  router.delete("/admin/user/:username", authMiddleware, (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admins only" });
    }
    const { username } = req.params;

    if (username === req.user.username) {
      return res
        .status(400)
        .json({ error: "Cannot delete your own admin account" });
    }

    performUserDeletion(username, res);
  });

  return router;
};
