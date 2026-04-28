const sqlite3 = require("sqlite3").verbose();

// Function to initialize messageService with a database connection
function createMessageService(db) {
  if (!db) {
    throw new Error("Database connection is required for MessageService.");
  }

  return {
    /**
     * Searches for messages in a specific room based on a query string.
     * @param {string} query - The search string.
     * @param {string} room - The room name to search within.
     * @returns {Promise<Array<Object>>} A promise that resolves to an array of matching messages.
     */
    searchMessages: (query, room) => {
      return new Promise((resolve, reject) => {
        // Basic LIKE search on message content.
        // Consider adding full-text search for more advanced capabilities if needed.
        const sql = `
          SELECT m.*, u.displayName, u.profilePicture, u.status
          FROM messages m
          JOIN users u ON m.username = u.username
          WHERE m.room = ? AND m.message LIKE ?
          ORDER BY m.timestamp DESC
          LIMIT 50 
        `; // Limit search results to avoid overwhelming the client

        // Ensure query is safe for LIKE, escaping special characters
        // For simplicity here, just wrapping in %
        const searchTerm = `%${query}%`; 

        db.all(sql, [room, searchTerm], (err, rows) => {
          if (err) {
            console.error("Database error during message search:", err);
            return reject(new Error("Error searching messages."));
          }
          resolve(rows);
        });
      });
    },

    // Add other message-related service methods here if needed in the future
    // e.g., getMessagesByRoom, sendMessage, deleteMessage, etc.
  };
}

module.exports = createMessageService;
