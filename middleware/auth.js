const jwt = require("jsonwebtoken");
const logger = require("../logger");

module.exports = (db, JWT_SECRET) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Authorization header missing" });
      }

      const [scheme, token] = authHeader.split(" ");
      if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ error: "Invalid authorization header" });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        logger.debug({ err: err.message }, "JWT Verification Error");
        return res.status(403).json({ error: "Invalid token" });
      }

      const result = await db.query(
        `
          SELECT u.username, u.role, b.username AS banned_username, b.reason AS banned_reason
          FROM users u
          LEFT JOIN banned_users b ON b.username = u.username
          WHERE u.username = $1
        `,
        [decoded.username]
      );
      const user = result.rows[0];

      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      if (user.banned_username) {
        return res.status(403).json({ error: `You are banned. Reason: ${user.banned_reason}` });
      }

      req.user = {
        username: user.username,
        role: user.role,
      };
      next();
    } catch (err) {
      logger.error({ err }, "Authentication Middleware Error");
      res.status(500).json({ error: "Failed to verify user session" });
    }
  };
};
