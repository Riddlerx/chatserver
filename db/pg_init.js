const db = require('./pg_index');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const runMigrations = async () => {
  try {
    // Create migrations table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js') && file.includes('pg')) // Only PG migrations
      .sort();

    const appliedResult = await db.query('SELECT name FROM migrations');
    const appliedMigrations = appliedResult.rows.map(m => m.name);

    for (const file of migrationFiles) {
      if (!appliedMigrations.includes(file)) {
        logger.info(`Applying PostgreSQL migration: ${file}...`);
        const migration = require(path.join(migrationsDir, file));
        
        try {
          // Wrap in a manual transaction if the migration doesn't handle it
          await db.query('BEGIN');
          await migration.up(db);
          await db.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
          await db.query('COMMIT');
          logger.info(`Successfully applied ${file}`);
        } catch (err) {
          await db.query('ROLLBACK');
          logger.error({ err }, `Failed to apply migration ${file}`);
          process.exit(1);
        }
      }
    }
    logger.info('All PostgreSQL migrations applied successfully.');
  } catch (err) {
    logger.error({ err }, 'Migration runner error');
    process.exit(1);
  } finally {
    await db.end();
  }
};

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
