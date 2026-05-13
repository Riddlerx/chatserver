// Migration 1: Initial Schema
module.exports = {
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          displayName TEXT,
          profilePicture TEXT,
          bio TEXT DEFAULT '',
          status TEXT DEFAULT 'Hey there!',
          role TEXT DEFAULT 'user',
          background TEXT,
          created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room TEXT NOT NULL,
          username TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          displayName TEXT,
          profilePicture TEXT,
          link_preview TEXT,
          edited INTEGER DEFAULT 0,
          parent_message_id INTEGER,
          is_pinned INTEGER DEFAULT 0,
          reply_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS direct_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_user TEXT NOT NULL,
          to_user TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          new_dm_room TEXT,
          edited INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS reactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER NOT NULL,
          username TEXT NOT NULL,
          emoji TEXT NOT NULL,
          UNIQUE(message_id, username, emoji)
      );

      CREATE TABLE IF NOT EXISTS custom_rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          password TEXT
      );

      CREATE TABLE IF NOT EXISTS banned_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          banned_by TEXT NOT NULL,
          reason TEXT,
          timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_username TEXT NOT NULL,
        action TEXT NOT NULL,
        target_username TEXT,
        reason TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room);
      CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_message_id);

      INSERT OR IGNORE INTO custom_rooms (name, created_by, created_at) VALUES ('main', 'system', datetime('now'));
      INSERT OR IGNORE INTO custom_rooms (name, created_by, created_at) VALUES ('general', 'system', datetime('now'));
    `);
  }
};
