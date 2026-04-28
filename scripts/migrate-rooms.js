
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("chat.db", (err) => {
  if (err) {
    console.error("Error opening database", err.message);
  } else {
    console.log("Connected to the SQLite database.");
    addMissingColumns();
  }
});

const columnsToAdd = [
  // ... (other columns)
  {
    table: "direct_messages",
    name: "new_dm_room",
    definition: "TEXT",
  },
  // ... (other columns)
];

function addMissingColumns() {
  db.serialize(() => {
    columnsToAdd.forEach(col_to_add => {
      db.all(`PRAGMA table_info(${col_to_add.table})`, (err, columns) => {
        if (err) {
          console.error(`Error checking table info for ${col_to_add.table}:`, err.message);
          return;
        }
        
        const columnExists = columns.some(c => c.name === col_to_add.name);
        
        if (!columnExists) {
          const { table, name, definition } = col_to_add;
          const sql = `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`;
          db.run(sql, (err) => {
            if (err) {
              console.error(`Error adding column ${name} to ${table}:`, err.message);
            } else {
              console.log(`Column ${name} added to ${table} table.`);
            }
          });
        }
      });
    });
  });
}
    
// Add this line to close the database connection
db.close((err) => {
  if (err) {
    console.error("Error closing database", err.message);
  } else {
    console.log("Database connection closed.");
  }
});
