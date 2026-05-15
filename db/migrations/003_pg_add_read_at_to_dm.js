// Migration: Add read_at to direct_messages
module.exports = {
  up: async (db) => {
    await db.query(`
      ALTER TABLE direct_messages 
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;
    `);
  }
};
