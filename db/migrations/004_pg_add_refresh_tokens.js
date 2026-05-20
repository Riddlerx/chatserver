// Migration 4: Add refresh_tokens table
module.exports = {
  up: async (db) => {
    const queries = [
      `CREATE TABLE IF NOT EXISTS refresh_tokens (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_username ON refresh_tokens(username);`,
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);`,
    ];

    for (const query of queries) {
      await db.query(query);
    }
  }
};
