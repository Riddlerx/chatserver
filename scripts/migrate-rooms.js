
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("chat.db", (err) => {
  if (err) {
    console.error("Error opening database", err.message);
  } else {
    console.log("Connected to the SQLite database.");
    runMigrations();
  }
});

const columnsToAdd = [
  {
    table: "direct_messages",
    name: "new_dm_room",
    definition: "TEXT",
  },
];

async function runMigrations() {
  try {
    for (const col of columnsToAdd) {
      await addColumnIfNotExists(col);
    }
    console.log("Migrations completed.");
  } catch (err) {
    console.error("Migration failed:", err.message);
  } finally {
    db.close((err) => {
      if (err) {
        console.error("Error closing database", err.message);
      } else {
        console.log("Database connection closed.");
      }
    });
  }
}

function addColumnIfNotExists(col) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${col.table})`, (err, columns) => {
      if (err) {
        return reject(new Error(`Error checking table info for ${col.table}: ${err.message}`));
      }
      
      const columnExists = columns.some(c => c.name === col.name);
      
      if (!columnExists) {
        const sql = `ALTER TABLE ${col.table} ADD COLUMN ${col.name} ${col.definition}`;
        db.run(sql, (err) => {
          if (err) {
            reject(new Error(`Error adding column ${col.name} to ${col.table}: ${err.message}`));
          } else {
            console.log(`Column ${col.name} added to ${col.table} table.`);
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
}
