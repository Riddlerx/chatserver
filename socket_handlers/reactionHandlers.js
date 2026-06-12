const logger = require("../logger");
const {
  normalizePositiveInt,
  normalizeOptionalString,
} = require("./utils");

module.exports = (io, db, socket) => {
  async function getJoinedMessageRoom(messageId) {
    const messageResult = await db.query("SELECT room FROM messages WHERE id = $1", [messageId]);
    const message = messageResult.rows[0];
    if (!message || !socket.room || socket.room !== message.room) return null;
    return message.room;
  }

  async function emitReactionsUpdate(messageId, roomId) {
    try {
      const reactionsResult = await db.query(
        "SELECT emoji, COUNT(*) as count, json_agg(username) as usernames FROM reactions WHERE message_id = $1 GROUP BY emoji",
        [messageId]
      );
      const reactions = reactionsResult.rows.map(r => ({ 
        emoji: r.emoji, 
        count: parseInt(r.count),
        usernames: r.usernames || []
      }));

      let targetRoom = roomId;
      if (!targetRoom) {
        const messageResult = await db.query("SELECT room FROM messages WHERE id = $1", [messageId]);
        if (messageResult.rows[0]) {
          targetRoom = messageResult.rows[0].room;
        }
      }

      if (targetRoom) {
        io.to(targetRoom).emit("reactions updated", { messageId, reactions });
      }
    } catch (err) {
      logger.error({ err, messageId }, "Error emitting reactions update");
    }
  }

  socket.on("add reaction", async ({ messageId, emoji }, callback) => {
    try {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const normalizedEmoji = normalizeOptionalString(emoji, { maxLength: 32, trim: false });
      
      if (!socket.username || !normalizedMessageId || !normalizedEmoji) {
        return typeof callback === "function" && callback({ success: false });
      }

      const messageRoom = await getJoinedMessageRoom(normalizedMessageId);
      if (!messageRoom) {
        return typeof callback === "function" && callback({ success: false });
      }

      await db.query(
        "INSERT INTO reactions (message_id, username, emoji) VALUES ($1, $2, $3) ON CONFLICT (message_id, username, emoji) DO NOTHING",
        [normalizedMessageId, socket.username, normalizedEmoji]
      );

      await emitReactionsUpdate(normalizedMessageId, messageRoom);
      if (typeof callback === "function") callback({ success: true });
    } catch (err) {
      logger.error({ err }, "Add reaction error");
      if (typeof callback === "function") callback({ success: false });
    }
  });

  socket.on("remove reaction", async ({ messageId, emoji }, callback) => {
    try {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const normalizedEmoji = normalizeOptionalString(emoji, { maxLength: 32, trim: false });
      
      if (!socket.username || !normalizedMessageId || !normalizedEmoji) {
        return typeof callback === "function" && callback({ success: false });
      }

      const messageRoom = await getJoinedMessageRoom(normalizedMessageId);
      if (!messageRoom) {
        return typeof callback === "function" && callback({ success: false });
      }

      await db.query(
        "DELETE FROM reactions WHERE message_id = $1 AND username = $2 AND emoji = $3",
        [normalizedMessageId, socket.username, normalizedEmoji]
      );

      await emitReactionsUpdate(normalizedMessageId, messageRoom);
      if (typeof callback === "function") callback({ success: true });
    } catch (err) {
      logger.error({ err }, "Remove reaction error");
      if (typeof callback === "function") callback({ success: false });
    }
  });

  socket.on("get reactions", async ({ messageId }) => {
    const normalizedMessageId = normalizePositiveInt(messageId);
    if (!normalizedMessageId) return;

    const messageRoom = await getJoinedMessageRoom(normalizedMessageId);
    if (messageRoom) await emitReactionsUpdate(normalizedMessageId, messageRoom);
  });
};
