// Migration: Add unread tracking table
module.exports = {
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS last_read_status (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        room TEXT, -- Either room name or username of DM partner
        is_dm BOOLEAN DEFAULT FALSE,
        last_read_message_id INTEGER,
        last_read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username, room, is_dm)
      );
    `);
  }
};
