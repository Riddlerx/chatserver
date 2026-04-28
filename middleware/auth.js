const jwt = require("jsonwebtoken");
const { body, validationResult } = require('express-validator');

module.exports = (JWT_SECRET) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      // If no auth header, check if it's a public route that doesn't require auth
      // For now, let's assume all routes hitting this middleware require auth
      return res.status(401).json({ error: "Authorization header missing" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Token missing" });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Fetch user from DB to ensure they still exist and have valid roles
      // This adds a DB hit but increases security by verifying token validity against current user state
      // For performance, this could be optional or cached.
      // For now, we'll trust the token payload for simplicity, but a DB lookup is more robust.
      // Example DB lookup (requires passing db instance):
      // db.get("SELECT username, role FROM users WHERE username = ?", [decoded.username], (err, user) => {
      //   if (err || !user) return res.status(401).json({ error: "Invalid token or user not found" });
      //   req.user = { username: user.username, role: user.role };
      //   next();
      // });
      
      req.user = decoded; // Assign decoded payload to req.user
      next();
    } catch (err) {
      console.error("JWT Verification Error:", err.message);
      res.status(403).json({ error: "Invalid token" });
    }
  };
};
