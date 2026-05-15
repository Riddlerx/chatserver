// Migration 1: Initial Schema (PostgreSQL)
module.exports = {
  up: async (db) => {
    const queries = [
      `CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          displayName TEXT,
          profilePicture TEXT,
          bio TEXT DEFAULT '',
          status TEXT DEFAULT 'Hey there!',
          role TEXT DEFAULT 'user',
          background TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          room TEXT NOT NULL,
          username TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          displayName TEXT,
          profilePicture TEXT,
          link_preview TEXT,
          edited BOOLEAN DEFAULT FALSE,
          parent_message_id INTEGER,
          is_pinned BOOLEAN DEFAULT FALSE,
          reply_count INTEGER DEFAULT 0
      );`,
      `CREATE TABLE IF NOT EXISTS direct_messages (
          id SERIAL PRIMARY KEY,
          from_user TEXT NOT NULL,
          to_user TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          new_dm_room TEXT,
          edited BOOLEAN DEFAULT FALSE
      );`,
      `CREATE TABLE IF NOT EXISTS reactions (
          id SERIAL PRIMARY KEY,
          message_id INTEGER NOT NULL,
          username TEXT NOT NULL,
          emoji TEXT NOT NULL,
          UNIQUE(message_id, username, emoji)
      );`,
      `CREATE TABLE IF NOT EXISTS custom_rooms (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          created_by TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          password TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS banned_users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          banned_by TEXT NOT NULL,
          reason TEXT,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        admin_username TEXT NOT NULL,
        action TEXT NOT NULL,
        target_username TEXT,
        reason TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room);`,
      `CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_message_id);`,
      `INSERT INTO custom_rooms (name, created_by) SELECT 'main', 'system' WHERE NOT EXISTS (SELECT 1 FROM custom_rooms WHERE name = 'main');`,
      `INSERT INTO custom_rooms (name, created_by) SELECT 'general', 'system' WHERE NOT EXISTS (SELECT 1 FROM custom_rooms WHERE name = 'general');`
    ];

    for (const query of queries) {
      await db.query(query);
    }
  }
};
