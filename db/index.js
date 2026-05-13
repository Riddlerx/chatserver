const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || './chat.db';
const db = new Database(dbPath);

// Optimization settings
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

/**
 * Simple Migration System
 */
const runMigrations = () => {
  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.js'))
    .sort();

  const appliedMigrations = db.prepare('SELECT name FROM migrations').all().map(m => m.name);

  migrationFiles.forEach(file => {
    if (!appliedMigrations.includes(file)) {
      console.log(`Applying migration: ${file}...`);
      const migration = require(path.join(migrationsDir, file));
      
      const transaction = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      });
      
      try {
        transaction();
        console.log(`Successfully applied ${file}`);
      } catch (err) {
        console.error(`Failed to apply migration ${file}:`, err);
        process.exit(1);
      }
    }
  });
};

runMigrations();

// We provide a wrapper to keep existing async/await patterns in the codebase 
// while benefiting from better-sqlite3's speed.
module.exports = {
  get: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    if (callback) {
      try {
        const result = db.prepare(sql).get(...params);
        callback(null, result);
      } catch (err) {
        callback(err);
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        resolve(db.prepare(sql).get(...params));
      } catch (err) {
        reject(err);
      }
    });
  },
  all: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    if (callback) {
      try {
        const result = db.prepare(sql).all(...params);
        callback(null, result);
      } catch (err) {
        callback(err);
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        resolve(db.prepare(sql).all(...params));
      } catch (err) {
        reject(err);
      }
    });
  },
  run: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    if (callback) {
      try {
        const result = db.prepare(sql).run(...params);
        // Create a context object similar to what sqlite3 provides
        const context = {
          lastID: result.lastInsertRowid,
          changes: result.changes
        };
        callback.call(context, null);
      } catch (err) {
        callback(err);
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const result = db.prepare(sql).run(...params);
        resolve({ lastID: result.lastInsertRowid, changes: result.changes });
      } catch (err) {
        reject(err);
      }
    });
  },
  // Aliases for compatibility with codebases using both patterns
  getAsync: function(sql, params) { return this.get(sql, params); },
  allAsync: function(sql, params) { return this.all(sql, params); },
  runAsync: function(sql, params) { return this.run(sql, params); },

  // For the graceful shutdown in server.js
  close: (callback) => {
    try {
      db.close();
      if (typeof callback === 'function') callback(null);
    } catch (err) {
      if (typeof callback === 'function') callback(err);
    }
  }
};
