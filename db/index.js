const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./chat.db", (err) => {
  if (err) console.error(err);
  else {
    console.log("Connected to SQLite database");
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA busy_timeout = 5000");
  }
});

db.serialize(() => {
  db.run(`
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
      )
  `);

  // Migration: Add missing columns to users
  const userColumns = [
    { name: "displayName", type: "TEXT" },
    { name: "profilePicture", type: "TEXT" },
    { name: "bio", type: "TEXT DEFAULT ''" },
    { name: "status", type: "TEXT DEFAULT 'Hey there!'" },
    { name: "role", type: "TEXT DEFAULT 'user'" },
    { name: "background", type: "TEXT" }
  ];

  userColumns.forEach(col => {
    db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`, (err) => {
      // Ignore "duplicate column name" error
    });
  });

  db.run(`
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
      )
  `);

  // Migration: Add missing columns to messages
  const messageColumns = [
    { name: "displayName", type: "TEXT" },
    { name: "profilePicture", type: "TEXT" },
    { name: "link_preview", type: "TEXT" },
    { name: "edited", type: "INTEGER DEFAULT 0" },
    { name: "parent_message_id", type: "INTEGER" },
    { name: "is_pinned", type: "INTEGER DEFAULT 0" },
    { name: "reply_count", type: "INTEGER DEFAULT 0" }
  ];

  messageColumns.forEach(col => {
    db.run(`ALTER TABLE messages ADD COLUMN ${col.name} ${col.type}`, (err) => {
      // Ignore "duplicate column name" error
    });
  });

  db.run(`
      CREATE TABLE IF NOT EXISTS direct_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_user TEXT NOT NULL,
          to_user TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          new_dm_room TEXT,
          edited INTEGER DEFAULT 0
      )
  `);

  db.run(`
      CREATE TABLE IF NOT EXISTS reactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER NOT NULL,
          username TEXT NOT NULL,
          emoji TEXT NOT NULL,
          UNIQUE(message_id, username, emoji)
      )
  `);

  db.run(`
      CREATE TABLE IF NOT EXISTS custom_rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          password TEXT
      )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      user_username TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at TEXT NOT NULL,
      UNIQUE(room_id, user_username)
    )
  `);

  db.run(`
      CREATE TABLE IF NOT EXISTS banned_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          banned_by TEXT NOT NULL,
          reason TEXT,
          timestamp TEXT NOT NULL
      )
  `);

  db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_username TEXT NOT NULL,
        action TEXT NOT NULL,
        target_username TEXT,
        reason TEXT,
        timestamp TEXT NOT NULL
      )
  `);

  // Indexes for faster lookups
  db.run("CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room)");
  db.run("CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_message_id)");

  // Insert a default "main" channel if it doesn't exist
  db.run(
    "INSERT OR IGNORE INTO custom_rooms (name, created_by, created_at) VALUES (?, ?, ?)",
    ["main", "system", new Date().toISOString()]
  );
});

module.exports = db;
