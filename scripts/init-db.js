#!/usr/bin/env node

// Database initialization script for Oracle Cloud deployment
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || './chat.db';
const db = new sqlite3.Database(dbPath);

console.log('Initializing database...');

// Create tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    displayName TEXT,
    profilePicture TEXT,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'online',
    bio TEXT,
    background TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Messages table
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    room TEXT NOT NULL DEFAULT 'general',
    displayName TEXT,
    profilePicture TEXT,
    link_preview TEXT,
    edited INTEGER DEFAULT 0,
    is_pinned INTEGER DEFAULT 0,
    parent_message_id INTEGER,
    reply_count INTEGER DEFAULT 0,
    FOREIGN KEY (parent_message_id) REFERENCES messages(id)
  )`);

  // Direct messages table
  db.run(`CREATE TABLE IF NOT EXISTS direct_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    displayName TEXT,
    profilePicture TEXT,
    link_preview TEXT,
    edited INTEGER DEFAULT 0
  )`);

  // Reactions table
  db.run(`CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    emoji TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id),
    UNIQUE(message_id, username, emoji)
  )`);

  // Custom rooms table
  db.run(`CREATE TABLE IF NOT EXISTS custom_rooms (
    name TEXT PRIMARY KEY,
    password TEXT,
    is_private INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(username)
  )`);

  // Room members table
  db.run(`CREATE TABLE IF NOT EXISTS room_members (
    room_name TEXT NOT NULL,
    username TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    role TEXT DEFAULT 'member',
    PRIMARY KEY (room_name, username),
    FOREIGN KEY (room_name) REFERENCES custom_rooms(name),
    FOREIGN KEY (username) REFERENCES users(username)
  )`);

  // Banned users table
  db.run(`CREATE TABLE IF NOT EXISTS banned_users (
    username TEXT PRIMARY KEY,
    banned_by TEXT NOT NULL,
    reason TEXT,
    banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (banned_by) REFERENCES users(username)
  )`);

  // Audit log table
  db.run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT
  )`);

  // Insert default rooms
  db.run(`INSERT OR IGNORE INTO custom_rooms (name, created_by) VALUES ('main', 'system'), ('general', 'system')`);

  console.log('Database initialized successfully!');
});

db.close();
