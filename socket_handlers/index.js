const dns = require("dns");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const sanitizeHtml = require("sanitize-html");
const axios = require("axios");
const { parse } = require("node-html-parser");
const { URL } = require("url");

let roomsRef = {};

const messageRateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

function normalizeString(value, { maxLength = 500, trim = true } = {}) {
  if (typeof value !== "string") return null;
  const normalized = trim ? value.trim() : value;
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function normalizeOptionalString(value, options) {
  if (value === undefined || value === null || value === "") return null;
  return normalizeString(value, options);
}

function normalizePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeMessageText(message) {
  if (typeof message !== "string") return null;
  const cleanMessage = sanitizeHtml(message, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTags: sanitizeHtml.defaults.allowedTags,
  }).trim();
  if (!cleanMessage || cleanMessage.length > 4000) return null;
  return cleanMessage;
}

function resolveRoomId(candidate, socket) {
  return normalizeOptionalString(candidate, { maxLength: 80 }) || socket.room || null;
}

function isValidRoomName(name) {
  return typeof name === "string" && /^[A-Za-z0-9_-]{1,50}$/.test(name);
}

function emitUsersInRoom(io, room, db) {
  if (!roomsRef[room]) {
    io.to(room).emit("userList", []);
    return;
  }

  const usernames = Array.from(roomsRef[room].keys());
  if (usernames.length === 0) {
    io.to(room).emit("userList", []);
    return;
  }

  const placeholders = usernames.map(() => "?").join(",");
  db.all(
    `SELECT username, displayName, profilePicture, status FROM users WHERE username IN (${placeholders})`,
    usernames,
    (err, users) => {
      if (err) {
        console.error("emitUsersInRoom DB Error:", err.message);
        return;
      }

      const roomStatuses = roomsRef[room] || new Map();
      io.to(room).emit(
        "userList",
        users.map((user) => ({
          ...user,
          status: roomStatuses.get(user.username) || user.status || "online",
        })),
      );
    },
  );
}

function broadcastUserList(io, db, activeSessions) {
  const onlineUsernames = Object.keys(activeSessions);
  if (onlineUsernames.length === 0) {
    io.emit("userList", []);
    return;
  }

  const placeholders = onlineUsernames.map(() => "?").join(",");
  db.all(
    `SELECT username, displayName, profilePicture, status FROM users WHERE username IN (${placeholders})`,
    onlineUsernames,
    (err, users) => {
      if (err) {
        console.error("broadcastUserList DB Error:", err.message);
        return;
      }
      io.emit("userList", users);
    },
  );
}

function cleanupSocket(socket) {
  delete socket.username;
  delete socket.displayName;
  delete socket.profilePicture;
  delete socket.role;
  delete socket.room;
  delete socket.status;
}

async function fetchLinkPreview(url) {
  try {
    const parsedUrl = new URL(url);
    const ip = await new Promise((resolve, reject) => {
      dns.lookup(parsedUrl.hostname, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });

    const isPrivate =
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(ip) ||
      ip === "::1";
    if (isPrivate) throw new Error("Private/Local IP access forbidden.");

    const response = await axios.get(url, {
      timeout: 5000,
      maxRedirects: 3,
      responseType: "text",
    });
    const root = parse(response.data);
    return {
      title:
        root.querySelector("meta[property='og:title']")?.getAttribute("content") ||
        root.querySelector("title")?.text ||
        url,
      description:
        root.querySelector("meta[name='description']")?.getAttribute("content") ||
        root.querySelector("meta[property='og:description']")?.getAttribute("content") ||
        "",
      image: root.querySelector("meta[property='og:image']")?.getAttribute("content") || "",
      url,
    };
  } catch (error) {
    console.error("Link preview error:", error.message);
    return null;
  }
}

module.exports = (io, db, rooms = {}, activeSessions = {}) => {
  roomsRef = rooms;

  io.of("/").on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    activeSessions[socket.username] = socket.id;
    db.run(
      "UPDATE users SET status = COALESCE(NULLIF(status, ''), 'online') WHERE username = ?",
      [socket.username],
      (err) => {
        if (err) {
          console.error(`Failed to initialize status for ${socket.username}:`, err.message);
        } else {
          socket.status = socket.status || "online";
          broadcastUserList(io, db, activeSessions);
        }
      },
    );

    socket.on("joinRoom", ({ room, password }, callback) => {
      const normalizedRoom = normalizeOptionalString(room, { maxLength: 80 });
      if (!socket.username) {
        return typeof callback === "function" && callback({ success: false, message: "Authentication required." });
      }
      if (!normalizedRoom || !isValidRoomName(normalizedRoom)) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid room." });
      }

      db.get(
        "SELECT name, password FROM custom_rooms WHERE name = ?",
        [normalizedRoom],
        (roomErr, roomRecord) => {
          if (roomErr) {
            console.error("Join room lookup DB Error:", roomErr.message);
            return typeof callback === "function" && callback({ success: false, message: "Failed to join room." });
          }
          if (!roomRecord) {
            return typeof callback === "function" && callback({ success: false, message: "Room not found." });
          }
          if (roomRecord.password && socket.role !== "admin" && roomRecord.password !== (password || "")) {
            socket.emit("join room error", { error: "Incorrect room password.", room: normalizedRoom });
            return typeof callback === "function" && callback({ success: false, message: "Incorrect room password." });
          }

          if (socket.room) {
            const previousRoom = socket.room;
            if (rooms[previousRoom]) {
              rooms[previousRoom].delete(socket.username);
              if (rooms[previousRoom].size === 0) delete rooms[previousRoom];
              else emitUsersInRoom(io, previousRoom, db);
            }
            socket.leave(previousRoom);
          }

          socket.room = normalizedRoom;
          socket.join(normalizedRoom);

          if (!rooms[normalizedRoom]) rooms[normalizedRoom] = new Map();
          rooms[normalizedRoom].set(socket.username, socket.status || "online");

          db.all(
            "SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC",
            [normalizedRoom],
            (messagesErr, messages) => {
              if (messagesErr) {
                console.error(`Error fetching messages for room ${normalizedRoom}:`, messagesErr.message);
                return typeof callback === "function" && callback({ success: false, message: "Error fetching messages." });
              }

              socket.emit(
                "messageHistory",
                messages.map((message) => ({
                  id: message.id,
                  username: message.username,
                  message: message.message,
                  timestamp: message.timestamp,
                  room: message.room,
                  displayName: message.displayName || message.username,
                  profilePicture: message.profilePicture,
                  link_preview: message.link_preview ? JSON.parse(message.link_preview) : null,
                  edited: Boolean(message.edited),
                  is_pinned: Boolean(message.is_pinned),
                  parent_message_id: message.parent_message_id,
                  reply_count: message.reply_count || 0,
                })),
              );

              db.all(
                "SELECT * FROM messages WHERE room = ? AND is_pinned = 1 ORDER BY timestamp DESC",
                [normalizedRoom],
                (pinnedErr, pinnedMessages) => {
                  if (pinnedErr) {
                    console.error(`Error fetching pinned messages for room ${normalizedRoom}:`, pinnedErr.message);
                    return typeof callback === "function" && callback({ success: false, message: "Error fetching pinned messages." });
                  }

                  socket.emit(
                    "pinned messages",
                    pinnedMessages.map((message) => ({
                      id: message.id,
                      username: message.username,
                      message: message.message,
                      timestamp: message.timestamp,
                      room: message.room,
                      displayName: message.displayName || message.username,
                      profilePicture: message.profilePicture,
                      link_preview: message.link_preview ? JSON.parse(message.link_preview) : null,
                      is_pinned: true,
                      parent_message_id: message.parent_message_id,
                    })),
                  );

                  db.all(
                    'SELECT name, (password IS NOT NULL AND password != "") as is_private FROM custom_rooms ORDER BY name ASC',
                    [],
                    (roomsErr, roomRows) => {
                      if (!roomsErr) socket.emit("custom rooms", roomRows || []);
                    },
                  );

                  broadcastUserList(io, db, activeSessions);
                  emitUsersInRoom(io, normalizedRoom, db);
                  if (typeof callback === "function") {
                    callback({ success: true, message: `Joined room "${normalizedRoom}".` });
                  }
                },
              );
            },
          );
        },
      );
    });

    socket.on("create room", ({ name, password }, callback) => {
      const normalizedName = normalizeOptionalString(name, { maxLength: 50 });
      const normalizedPassword = password ? normalizeString(password, { maxLength: 100, trim: false }) : null;

      if (!socket.username) {
        return typeof callback === "function" && callback({ success: false, message: "Authentication required." });
      }
      if (!normalizedName || !isValidRoomName(normalizedName)) {
        return typeof callback === "function" && callback({ success: false, message: "Room names can only use letters, numbers, underscores, and hyphens." });
      }

      db.run(
        "INSERT INTO custom_rooms (name, created_by, created_at, password) VALUES (?, ?, ?, ?)",
        [normalizedName, socket.username, new Date().toISOString(), normalizedPassword],
        (err) => {
          if (err) {
            if (!err.message.includes("UNIQUE")) {
              console.error("Create room DB Error:", err.message);
            }
            const message = err.message.includes("UNIQUE") ? "Room already exists." : "Failed to create room.";
            return typeof callback === "function" && callback({ success: false, message });
          }

          io.emit("new room", { name: normalizedName, isPrivate: Boolean(normalizedPassword) });
          if (typeof callback === "function") callback({ success: true, message: "Room created." });
        },
      );
    });

    socket.on("delete room", ({ name }, callback) => {
      const normalizedName = normalizeOptionalString(name, { maxLength: 50 });
      if (!socket.username || socket.role !== "admin") {
        return typeof callback === "function" && callback({ success: false, message: "Admin access required." });
      }
      if (!normalizedName || normalizedName === "main" || normalizedName === "general") {
        return typeof callback === "function" && callback({ success: false, message: "Invalid room." });
      }

      db.run("DELETE FROM custom_rooms WHERE name = ?", [normalizedName], function (err) {
        if (err) {
          console.error("Delete room DB Error:", err.message);
          return typeof callback === "function" && callback({ success: false, message: "Failed to delete room." });
        }
        if (this.changes === 0) {
          return typeof callback === "function" && callback({ success: false, message: "Room not found." });
        }

        delete rooms[normalizedName];
        io.emit("room deleted", { name: normalizedName });
        if (typeof callback === "function") callback({ success: true, message: "Room deleted." });
      });
    });

    socket.on("sendMessage", async ({ message, roomId, parentMessageId }, callback) => {
      const resolvedRoomId = resolveRoomId(roomId, socket);
      const cleanMessage = sanitizeMessageText(message);
      const normalizedParentId = parentMessageId == null ? null : normalizePositiveInt(parentMessageId);

      try {
        await messageRateLimiter.consume(socket.id);
      } catch (err) {
        return typeof callback === "function" && callback({ success: false, message: "Too many messages. Please slow down." });
      }

      if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
        return typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." });
      }
      if (!cleanMessage) {
        return typeof callback === "function" && callback({ success: false, message: "Message cannot be empty." });
      }
      if (parentMessageId != null && !normalizedParentId) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid thread target." });
      }

      let linkPreview = null;
      const match = cleanMessage.match(/(https?:\/\/[^\s]+)/);
      if (match) linkPreview = await fetchLinkPreview(match[0]);

      const timestamp = new Date().toISOString();
      db.run(
        "INSERT INTO messages (username, room, message, timestamp, displayName, profilePicture, link_preview, parent_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          socket.username,
          resolvedRoomId,
          cleanMessage,
          timestamp,
          socket.displayName,
          socket.profilePicture,
          linkPreview ? JSON.stringify(linkPreview) : null,
          normalizedParentId,
        ],
        function (err) {
          if (err) {
            console.error("Send message DB Error:", err.message);
            return typeof callback === "function" && callback({ success: false, message: "Failed to send message." });
          }

          const newMessage = {
            id: this.lastID,
            username: socket.username,
            room: resolvedRoomId,
            message: cleanMessage,
            timestamp,
            displayName: socket.displayName,
            profilePicture: socket.profilePicture,
            link_preview: linkPreview,
            is_pinned: false,
            parent_message_id: normalizedParentId,
            edited: false,
            reply_count: 0,
          };

          io.to(resolvedRoomId).emit("chat message", newMessage);

          if (normalizedParentId) {
            db.run("UPDATE messages SET reply_count = reply_count + 1 WHERE id = ?", [normalizedParentId], (updateErr) => {
              if (updateErr) {
                console.error("Reply count update DB Error:", updateErr.message);
              } else {
                db.get("SELECT reply_count FROM messages WHERE id = ?", [normalizedParentId], (countErr, row) => {
                  if (!countErr && row) {
                    io.to(resolvedRoomId).emit("reply count updated", {
                      messageId: normalizedParentId,
                      reply_count: row.reply_count,
                    });
                  }
                });
              }
            });
            io.to(`thread-${normalizedParentId}`).emit("thread message", newMessage);
          }

          if (typeof callback === "function") {
            callback({ success: true, message: "Message sent.", messageData: newMessage });
          }
        },
      );
    });

    socket.on("get thread", ({ parent_message_id }) => {
      const parentMessageId = normalizePositiveInt(parent_message_id);
      if (!socket.username || !parentMessageId) return;

      db.all(
        "SELECT * FROM messages WHERE parent_message_id = ? ORDER BY timestamp ASC",
        [parentMessageId],
        (err, messages) => {
          if (err) {
            console.error("Get thread DB Error:", err.message);
            return;
          }
          socket.emit("thread history", {
            parent_message_id: parentMessageId,
            messages: messages.map((message) => ({
              id: message.id,
              username: message.username,
              message: message.message,
              timestamp: message.timestamp,
              room: message.room,
              displayName: message.displayName || message.username,
              profilePicture: message.profilePicture,
              parent_message_id: message.parent_message_id,
            })),
          });
          socket.join(`thread-${parentMessageId}`);
        },
      );
    });

    socket.on("leave thread", ({ parent_message_id }) => {
      const parentMessageId = normalizePositiveInt(parent_message_id);
      if (parentMessageId) socket.leave(`thread-${parentMessageId}`);
    });

    socket.on("editMessage", ({ messageId, newMessage, roomId }, callback) => {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const resolvedRoomId = resolveRoomId(roomId, socket);
      const cleanMessage = sanitizeMessageText(newMessage);

      if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
        return typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." });
      }
      if (!normalizedMessageId || !cleanMessage) {
        return typeof callback === "function" && callback({ success: false, message: "Message cannot be empty." });
      }

      const timestamp = new Date().toISOString();
      db.run(
        "UPDATE messages SET message = ?, edited = 1, timestamp = ? WHERE id = ? AND username = ?",
        [cleanMessage, timestamp, normalizedMessageId, socket.username],
        function (err) {
          if (err) {
            console.error("Edit message DB Error:", err.message);
            return typeof callback === "function" && callback({ success: false, message: "Failed to edit message." });
          }
          if (this.changes === 0) {
            return typeof callback === "function" && callback({ success: false, message: "Message not found or you are not the author." });
          }

          io.to(resolvedRoomId).emit("message edited", {
            id: normalizedMessageId,
            message: cleanMessage,
            timestamp,
            edited: true,
          });
          if (typeof callback === "function") callback({ success: true, message: "Message edited." });
        },
      );
    });

    socket.on("deleteMessage", ({ messageId, roomId }, callback) => {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const resolvedRoomId = resolveRoomId(roomId, socket);

      if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
        return typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." });
      }
      if (!normalizedMessageId) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid message." });
      }

      db.get(
        "SELECT username, parent_message_id FROM messages WHERE id = ? AND room = ?",
        [normalizedMessageId, resolvedRoomId],
        (err, message) => {
          if (err) {
            console.error("Delete message lookup DB Error:", err.message);
            return typeof callback === "function" && callback({ success: false, message: "Error verifying message ownership." });
          }
          if (!message) {
            return typeof callback === "function" && callback({ success: false, message: "Message not found." });
          }
          if (message.username !== socket.username && socket.role !== "admin") {
            return typeof callback === "function" && callback({ success: false, message: "You can only delete your own messages or as an admin." });
          }

          db.run("DELETE FROM messages WHERE id = ? AND room = ?", [normalizedMessageId, resolvedRoomId], function (deleteErr) {
            if (deleteErr) {
              console.error("Delete message DB Error:", deleteErr.message);
              return typeof callback === "function" && callback({ success: false, message: "Failed to delete message." });
            }
            if (this.changes === 0) {
              return typeof callback === "function" && callback({ success: false, message: "Message not found or could not be deleted." });
            }

            io.to(resolvedRoomId).emit("message deleted", {
              id: normalizedMessageId,
              deletedBy: socket.username,
            });

            if (message.parent_message_id) {
              db.run("UPDATE messages SET reply_count = MAX(reply_count - 1, 0) WHERE id = ?", [message.parent_message_id], (updateErr) => {
                if (updateErr) {
                  console.error("Reply count decrement DB Error:", updateErr.message);
                } else {
                  db.get("SELECT reply_count FROM messages WHERE id = ?", [message.parent_message_id], (countErr, row) => {
                    if (!countErr && row) {
                      io.to(resolvedRoomId).emit("reply count updated", {
                        messageId: message.parent_message_id,
                        reply_count: row.reply_count,
                      });
                    }
                  });
                }
              });
            }

            if (typeof callback === "function") callback({ success: true, message: "Message deleted." });
          });
        },
      );
    });

    const handlePinState = ({ messageId, roomId }, callback, shouldPin) => {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const resolvedRoomId = resolveRoomId(roomId, socket);

      if (!socket.username || !socket.room || socket.room !== resolvedRoomId) {
        return typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." });
      }
      if (!normalizedMessageId) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid message." });
      }

      db.get("SELECT username FROM messages WHERE id = ? AND room = ?", [normalizedMessageId, resolvedRoomId], (err, message) => {
        if (err) {
          console.error("Pin/unpin lookup DB Error:", err.message);
          return typeof callback === "function" && callback({ success: false, message: "Error verifying message." });
        }
        if (!message) {
          return typeof callback === "function" && callback({ success: false, message: "Message not found." });
        }
        if (message.username !== socket.username && socket.role !== "admin") {
          return typeof callback === "function" && callback({ success: false, message: `You can only ${shouldPin ? "pin" : "unpin"} your own messages or as an admin.` });
        }

        db.run(
          "UPDATE messages SET is_pinned = ? WHERE id = ? AND room = ?",
          [shouldPin ? 1 : 0, normalizedMessageId, resolvedRoomId],
          function (updateErr) {
            if (updateErr) {
              console.error("Pin/unpin DB Error:", updateErr.message);
              return typeof callback === "function" && callback({ success: false, message: `Failed to ${shouldPin ? "pin" : "unpin"} message.` });
            }
            if (this.changes === 0) {
              return typeof callback === "function" && callback({ success: false, message: "Message not found or could not be updated." });
            }

            db.all(
              "SELECT * FROM messages WHERE room = ? AND is_pinned = 1 ORDER BY timestamp DESC",
              [resolvedRoomId],
              (pinnedErr, pinnedMessages) => {
                if (pinnedErr) {
                  console.error("Pinned messages refresh DB Error:", pinnedErr.message);
                } else {
                  io.to(resolvedRoomId).emit(
                    "pinned messages updated",
                    pinnedMessages.map((row) => ({
                      id: row.id,
                      username: row.username,
                      message: row.message,
                      timestamp: row.timestamp,
                      room: row.room,
                      displayName: row.displayName || row.username,
                      profilePicture: row.profilePicture,
                      link_preview: row.link_preview ? JSON.parse(row.link_preview) : null,
                      is_pinned: Boolean(row.is_pinned),
                      parent_message_id: row.parent_message_id,
                    })),
                  );
                }
              },
            );

            io.to(resolvedRoomId).emit(shouldPin ? "messagePinned" : "messageUnpinned", {
              messageId: normalizedMessageId,
              roomId: resolvedRoomId,
              updatedBy: socket.username,
            });

            if (typeof callback === "function") {
              callback({ success: true, message: `Message ${shouldPin ? "pinned" : "unpinned"} successfully.` });
            }
          },
        );
      });
    };

    socket.on("pinMessage", (payload, callback) => handlePinState(payload, callback, true));
    socket.on("pin message", (payload, callback) => handlePinState(payload, callback, true));
    socket.on("unpinMessage", (payload, callback) => handlePinState(payload, callback, false));
    socket.on("unpin message", (payload, callback) => handlePinState(payload, callback, false));

    function emitReactionsUpdate(messageId, roomId) {
      db.all(
        "SELECT emoji, COUNT(*) as count FROM reactions WHERE message_id = ? GROUP BY emoji",
        [messageId],
        (err, reactions) => {
          if (err) {
            console.error("Fetch reactions DB Error:", err.message);
            return;
          }
          if (roomId) {
            io.to(roomId).emit("reactions updated", { messageId, reactions });
          } else {
            db.get("SELECT room FROM messages WHERE id = ?", [messageId], (roomErr, message) => {
              if (!roomErr && message) {
                io.to(message.room).emit("reactions updated", { messageId, reactions });
              }
            });
          }
        },
      );
    }

    socket.on("add reaction", ({ messageId, emoji }, callback) => {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const normalizedEmoji = normalizeOptionalString(emoji, { maxLength: 32, trim: false });
      if (!socket.username || !normalizedMessageId || !normalizedEmoji) {
        return typeof callback === "function" && callback({ success: false });
      }

      db.run(
        "INSERT OR IGNORE INTO reactions (message_id, username, emoji) VALUES (?, ?, ?)",
        [normalizedMessageId, socket.username, normalizedEmoji],
        (err) => {
          if (err) {
            console.error("Add reaction DB Error:", err.message);
            return typeof callback === "function" && callback({ success: false });
          }
          emitReactionsUpdate(normalizedMessageId, socket.room);
          if (typeof callback === "function") callback({ success: true });
        },
      );
    });

    socket.on("remove reaction", ({ messageId, emoji }, callback) => {
      const normalizedMessageId = normalizePositiveInt(messageId);
      const normalizedEmoji = normalizeOptionalString(emoji, { maxLength: 32, trim: false });
      if (!socket.username || !normalizedMessageId || !normalizedEmoji) {
        return typeof callback === "function" && callback({ success: false });
      }

      db.run(
        "DELETE FROM reactions WHERE message_id = ? AND username = ? AND emoji = ?",
        [normalizedMessageId, socket.username, normalizedEmoji],
        (err) => {
          if (err) {
            console.error("Remove reaction DB Error:", err.message);
            return typeof callback === "function" && callback({ success: false });
          }
          emitReactionsUpdate(normalizedMessageId, socket.room);
          if (typeof callback === "function") callback({ success: true });
        },
      );
    });

    socket.on("get reactions", ({ messageId }) => {
      const normalizedMessageId = normalizePositiveInt(messageId);
      if (normalizedMessageId) emitReactionsUpdate(normalizedMessageId, socket.room);
    });

    socket.on("send dm", ({ toUser, message }, callback) => {
      const normalizedRecipient = normalizeOptionalString(toUser, { maxLength: 30 });
      const cleanMessage = sanitizeMessageText(message);

      if (!socket.username) return;
      if (!normalizedRecipient || !cleanMessage) {
        return typeof callback === "function" && callback({ success: false, message: "Message cannot be empty." });
      }
      if (normalizedRecipient === socket.username) {
        return typeof callback === "function" && callback({ success: false, message: "Cannot send a DM to yourself." });
      }

      const timestamp = new Date().toISOString();
      db.run(
        "INSERT INTO direct_messages (from_user, to_user, message, timestamp) VALUES (?, ?, ?, ?)",
        [socket.username, normalizedRecipient, cleanMessage, timestamp],
        function (err) {
          if (err) {
            console.error("Send DM DB Error:", err.message);
            return typeof callback === "function" && callback({ success: false, message: "Failed to send DM." });
          }

          const dmData = {
            id: this.lastID,
            from: socket.username,
            fromDisplayName: socket.displayName,
            to: normalizedRecipient,
            message: cleanMessage,
            timestamp,
          };

          const recipientSocketId = activeSessions[normalizedRecipient];
          if (recipientSocketId) io.to(recipientSocketId).emit("receive dm", dmData);
          socket.emit("receive dm", dmData);
          if (typeof callback === "function") callback({ success: true, message: "DM sent.", dmData });
        },
      );
    });

    socket.on("get dm history", ({ withUser }, callback) => {
      const normalizedUser = normalizeOptionalString(withUser, { maxLength: 30 });
      if (!socket.username || !normalizedUser) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid user." });
      }

      db.all(
        "SELECT dm.*, u.displayName as fromDisplayName FROM direct_messages dm LEFT JOIN users u ON dm.from_user = u.username WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?) ORDER BY timestamp ASC",
        [socket.username, normalizedUser, normalizedUser, socket.username],
        (err, rows) => {
          if (err) {
            console.error("Get DM history DB Error:", err.message);
            return typeof callback === "function" && callback({ success: false, message: "Failed to fetch DM history." });
          }

          socket.emit("dm history", {
            withUser: normalizedUser,
            messages: rows.map((row) => ({
              id: row.id,
              from: row.from_user,
              fromDisplayName: row.fromDisplayName,
              to: row.to_user,
              message: row.message,
              timestamp: row.timestamp,
            })),
          });

          if (typeof callback === "function") callback({ success: true });
        },
      );
    });

    socket.on("typing", () => {
      if (!socket.room || !rooms[socket.room]) return;
      rooms[socket.room].set(socket.username, "typing");
      emitUsersInRoom(io, socket.room, db);
    });

    socket.on("stop typing", () => {
      if (!socket.room || !rooms[socket.room]) return;
      rooms[socket.room].set(socket.username, socket.status || "online");
      emitUsersInRoom(io, socket.room, db);
    });

    socket.on("updateStatus", ({ status }, callback) => {
      const normalizedStatus = normalizeOptionalString(status, { maxLength: 120 });
      if (!socket.username) {
        return typeof callback === "function" && callback({ success: false, message: "Authentication required." });
      }
      if (!normalizedStatus) {
        return typeof callback === "function" && callback({ success: false, message: "Invalid status." });
      }

      socket.status = normalizedStatus;
      activeSessions[socket.username] = socket.id;

      db.run("UPDATE users SET status = ? WHERE username = ?", [normalizedStatus, socket.username], (err) => {
        if (err) {
          console.error(`Failed to update status for ${socket.username}:`, err.message);
          return typeof callback === "function" && callback({ success: false, message: "Failed to update status." });
        }

        if (socket.room && rooms[socket.room]) {
          rooms[socket.room].set(socket.username, normalizedStatus);
          emitUsersInRoom(io, socket.room, db);
        }

        broadcastUserList(io, db, activeSessions);
        if (typeof callback === "function") callback({ success: true, message: "Status updated." });
      });
    });

    socket.on("getUsers", () => {
      if (socket.room) emitUsersInRoom(io, socket.room, db);
    });

    socket.on("getRooms", () => {
      db.all(
        'SELECT name, (password IS NOT NULL AND password != "") as is_private FROM custom_rooms ORDER BY name ASC',
        [],
        (err, rows) => {
          if (err) {
            console.error("getRooms DB Error:", err.message);
            return;
          }
          socket.emit("custom rooms", rows || []);
        },
      );
    });

    socket.on("disconnect", () => {
      if (socket.username) {
        delete activeSessions[socket.username];
        db.run("UPDATE users SET status = 'offline' WHERE username = ?", [socket.username], (err) => {
          if (err) console.error(`Failed to update status for ${socket.username} on disconnect:`, err.message);
        });
        broadcastUserList(io, db, activeSessions);

        if (socket.room && rooms[socket.room]) {
          rooms[socket.room].delete(socket.username);
          if (rooms[socket.room].size === 0) delete rooms[socket.room];
          else emitUsersInRoom(io, socket.room, db);
        }
      }

      cleanupSocket(socket);
    });
  });
};
