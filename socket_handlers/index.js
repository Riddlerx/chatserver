const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const sanitizeHtml = require('sanitize-html');
const axios = require('axios'); // Make sure axios is installed
const { parse } = require('node-html-parser'); // Make sure node-html-parser is installed


// Mock or actual DB connection setup
// const db = require('../db'); // Assuming db/index.js sets up and exports the db connection

// Mocked functions and data for demonstration
const activeSessions = {}; // Stores active sessions: { username: socketId }
const rooms = {}; // Stores active users per room: { roomName: Map<username, status> }

// Placeholder for emitUsersInRoom and broadcastUserList if they are defined elsewhere
function emitUsersInRoom(io, room, db) {
    if (rooms[room]) {
        const usernames = Array.from(rooms[room].keys());
        if (usernames.length === 0) return io.to(room).emit("userList", []);
        const placeholders = usernames.map(() => '?').join(',');
        db.all(
            `SELECT username, displayName, profilePicture, status FROM users WHERE username IN (${placeholders})`,
            usernames,
            (err, users) => {
                if (err) return console.error("emitUsersInRoom DB Error:", err.message);
                io.to(room).emit("userList", users);
            }
        );
    }
}

function broadcastUserList(io, db, activeSessions) {
    const onlineUsernames = Object.keys(activeSessions);
    if (onlineUsernames.length === 0) return io.emit("userList", []);
    const placeholders = onlineUsernames.map(() => '?').join(',');
    db.all(
        `SELECT username, displayName, profilePicture, online_status as status FROM users WHERE username IN (${placeholders})`,
        onlineUsernames,
        (err, users) => {
            if (err) return console.error("broadcastUserList DB Error:", err.message);
            io.emit("userList", users);
        }
    );
}

// Placeholder for jwt secret
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key-for-testing"; // Use a default for testing
console.log("JWT_SECRET loaded in socket_handlers:", JWT_SECRET.substring(0, 10) + "..."); // Log first 10 chars to avoid logging sensitive data


module.exports = (io, db) => {
  // Socket.IO connection handler
  io.of("/").on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Auth is handled in socket/index.js socketAuthMiddleware

    // --- Event Handlers ---

    // Handle user joining a room
    socket.on("joinRoom", async ({ room }, callback) => {
        if (!socket.username) {
            return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "You must be authenticated to join a room." }));
        }

        // Leave previous room if any
        if (socket.room) {
            const prevRoom = socket.room;
            rooms[prevRoom].delete(socket.username);
            emitUsersInRoom(io, prevRoom, db);
            socket.leave(prevRoom);
            console.log(`${socket.username} left room: ${prevRoom}`);
        }

        // Join new room
        socket.room = room;
        socket.join(room);
        console.log(`User ${socket.username} joined room: ${room}`);

        // Add user to the room's active users map
        if (!rooms[room]) {
            rooms[room] = new Map();
        }
        rooms[room].set(socket.username, socket.status || 'online'); // Store current status

        // Fetch and send message history for the room
        db.all("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC", [room], (err, messages) => {
            if (err) {
                console.error(`Error fetching messages for room ${room}:`, err.message);
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Error fetching messages." }));
            }
            
            const history = messages.map(m => ({
              id: m.id, username: m.username, message: m.message, timestamp: m.timestamp, room: m.room,
              displayName: m.displayName || m.username, profilePicture: m.profilePicture,
              link_preview: m.link_preview ? JSON.parse(m.link_preview) : null, edited: m.edited,
              is_pinned: m.is_pinned, parent_message_id: m.parent_message_id
            }));
            socket.emit("messageHistory", history);
            
            // Fetch and send pinned messages
            db.all("SELECT * FROM messages WHERE room = ? AND is_pinned = 1 ORDER BY timestamp DESC", [room], (err, pinned) => {
                if (err) {
                  console.error(`Error fetching pinned messages for room ${room}:`, err.message);
                  return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Error fetching pinned messages." }));
                }
                const pinnedHistory = pinned.map(m => ({
                  id: m.id, username: m.username, message: m.message, timestamp: m.timestamp, room: m.room,
                  displayName: m.displayName || m.username, profilePicture: m.profilePicture,
                  link_preview: m.link_preview ? JSON.parse(m.link_preview) : null, is_pinned: 1,
                  parent_message_id: m.parent_message_id
                }));
                socket.emit("pinned messages", pinnedHistory);
                if (typeof callback === 'function') callback({ success: true, message: `Joined room "${room}".` });
                broadcastUserList(io, db, activeSessions);
                emitUsersInRoom(io, room, db);
                db.all('SELECT name, (password IS NOT NULL AND password != "") as is_private FROM custom_rooms ORDER BY name ASC', [], (err, rows) => {
                    if (!err) socket.emit("custom rooms", rows || []);
                });
              }
            );
          }
        );
    });

const { RateLimiterMemory } = require("rate-limiter-flexible");
const { URL } = require("url");
const net = require("net");

const messageRateLimiter = new RateLimiterMemory({
  points: 100, // 100 requests
  duration: 60, // per 60 seconds
});

// ... (within module.exports)
    // Helper function to fetch link preview with SSRF protection
    async function fetchLinkPreview(url) {
      try {
        const parsedUrl = new URL(url);
        
        // Block private/local IP addresses
        const ip = await new Promise((resolve, reject) => {
            require('dns').lookup(parsedUrl.hostname, (err, address) => {
                if (err) reject(err);
                else resolve(address);
            });
        });

        // Simple check for private IPs (e.g., 127.0.0.1, 10.0.0.0/8, etc.)
        const isPrivate = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(ip);
        if (isPrivate) throw new Error("Private/Local IP access forbidden.");

        const response = await axios.get(url, { timeout: 5000 });
        const html = response.data;
        const root = parse(html);
        const title = root.querySelector('title')?.text || root.querySelector('meta[property="og:title"]')?.getAttribute('content');
        const description = root.querySelector('meta[name="description"]')?.getAttribute('content') || root.querySelector('meta[property="og:description"]')?.getAttribute('content');
        const image = root.querySelector('meta[property="og:image"]')?.getAttribute('content');

        return { title, description, image, url };
      } catch (error) {
        console.error("Link preview error:", error.message);
        return null;
      }
    }
    
    // Function to clean up socket properties
    function cleanupSocket(socket) {
        delete socket.username;
        delete socket.displayName;
        delete socket.profilePicture;
        delete socket.role;
        delete socket.room;
        delete socket.status;
    }

    // --- Message Handling ---

    // Handle sending a new message
    socket.on("sendMessage", async ({ message, roomId, parentMessageId }, callback) => {
        try {
            await messageRateLimiter.consume(socket.id);
        } catch (rejRes) {
            return typeof callback === "function" && callback({ success: false, message: "Too many messages. Please slow down." });
        }

        if (!socket.username || !socket.room || socket.room !== roomId) {
            return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." }));
        }

        const cleanMessage = sanitizeHtml(message, {
            allowedTags: [], // No HTML tags allowed
            allowedAttributes: {}, // No attributes allowed
            disallowedTags: sanitizeHtml.defaults.allowedTags // Ensure no tags are allowed
        });

        if (!cleanMessage.trim()) {
            return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Message cannot be empty." }));
        }

        let linkPreview = null;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const match = cleanMessage.match(urlRegex);
        if (match) {
            linkPreview = await fetchLinkPreview(match[0]);
        }

        const timestamp = new Date().toISOString();

        db.run(
            "INSERT INTO messages (username, room, message, timestamp, displayName, profilePicture, link_preview, parent_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [socket.username, roomId, cleanMessage, timestamp, socket.displayName, socket.profilePicture, linkPreview ? JSON.stringify(linkPreview) : null, parentMessageId || null],
            function(err) {
                if (err) {
                    console.error("Send message DB Error:", err.message);
                    return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Failed to send message." }));
                }
                const newMessage = {
                    id: this.lastID,
                    username: socket.username,
                    room: roomId,
                    message: cleanMessage,
                    timestamp: timestamp,
                    displayName: socket.displayName,
                    profilePicture: socket.profilePicture,
                    link_preview: linkPreview,
                    is_pinned: 0, // Default to not pinned
                    parent_message_id: parentMessageId || null,
                    edited: false
                };
                io.to(roomId).emit("chat message", newMessage);
                if (typeof callback === 'function') (typeof callback === "function" && callback({ success: true, message: "Message sent.", messageData: newMessage }));
            }
        );
    });

    // Handle editing a message
    socket.on("editMessage", async ({ messageId, newMessage: updatedMessage, roomId }, callback) => {
        if (!socket.username || !socket.room || socket.room !== roomId) {
            return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." }));
        }

        const cleanMessage = sanitizeHtml(updatedMessage, {
            allowedTags: [],
            allowedAttributes: {},
            disallowedTags: sanitizeHtml.defaults.allowedTags
        });

        if (!cleanMessage.trim()) {
            return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Message cannot be empty." }));
        }

        const timestamp = new Date().toISOString();

        db.run(
            "UPDATE messages SET message = ?, edited = 1, timestamp = ? WHERE id = ? AND username = ?",
            [cleanMessage, timestamp, messageId, socket.username],
            function(err) {
                if (err) {
                    console.error("Edit message DB Error:", err.message);
                    return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Failed to edit message." }));
                }
                if (this.changes === 0) {
                    return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Message not found or you are not the author." }));
                }
                io.to(roomId).emit("message edited", { id: messageId, message: cleanMessage, timestamp, edited: true });
                if (typeof callback === 'function') (typeof callback === "function" && callback({ success: true, message: "Message edited." }));
            }
        );
    });

    // Handle deleting a message
    socket.on("deleteMessage", ({ messageId, roomId }, callback) => {
        if (!socket.username || !socket.room || socket.room !== roomId) {
            return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." }));
        }

        // Check if the message exists and belongs to the user, or if the user is an admin
        db.get("SELECT username FROM messages WHERE id = ? AND room = ?", [messageId, roomId], (err, message) => {
            if (err) {
                console.error("Delete message lookup DB Error:", err.message);
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Error verifying message ownership." }));
            }
            if (!message) {
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Message not found." }));
            }
            if (message.username !== socket.username && socket.role !== 'admin') {
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "You can only delete your own messages or as an admin." }));
            }

            db.run("DELETE FROM messages WHERE id = ? AND room = ?", [messageId, roomId], function(err) {
                if (err) {
                    console.error("Delete message DB Error:", err.message);
                    return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Failed to delete message." }));
                }
                if (this.changes === 0) {
                    return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Message not found or could not be deleted." }));
                }
                io.to(roomId).emit("message deleted", { id: messageId, deletedBy: socket.username });
                if (typeof callback === 'function') (typeof callback === "function" && callback({ success: true, message: "Message deleted." }));
            });
        });
    });

    // Handle pinning a message
    socket.on("pinMessage", async ({ messageId, roomId }, callback) => {
        if (!socket.username || !socket.room || socket.room !== roomId) {
            return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." }));
        }
        // Only admins or users who sent the message can pin/unpin
        // First, check if the message belongs to the user or if they are admin
        db.get("SELECT username FROM messages WHERE id = ? AND room = ?", [messageId, roomId], (err, message) => {
            if (err) {
                console.error("Pin message lookup DB Error:", err.message);
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Error verifying message." }));
            }
            if (!message) {
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Message not found." }));
            }
            if (message.username !== socket.username && socket.role !== 'admin') {
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "You can only pin your own messages or as an admin." }));
            }

            // Now, perform the pin operation
            db.run("UPDATE messages SET is_pinned = 1 WHERE id = ? AND room = ?", [messageId, roomId], function(err) {
                if (err) {
                    console.error("Pin message DB Error:", err.message);
                    return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Failed to pin message." }));
                }
                if (this.changes === 0) {
                    return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Message not found or could not be pinned." }));
                }
                
                // Fetch the pinned message to send its full details
                db.get("SELECT * FROM messages WHERE id = ? AND room = ?", [messageId, roomId], (err, pinnedMessage) => {
                    if (err) {
                        console.error(`Error fetching pinned message ${messageId} for room ${roomId}:`, err.message);
                        // Continue to emit event even if fetching details failed, but log the error
                    }
                    
                    const pinnedMessageData = pinnedMessage ? {
                        id: pinnedMessage.id, username: pinnedMessage.username, message: pinnedMessage.message, timestamp: pinnedMessage.timestamp, room: pinnedMessage.room,
                        displayName: pinnedMessage.displayName || pinnedMessage.username, profilePicture: pinnedMessage.profilePicture,
                        link_preview: pinnedMessage.link_preview ? JSON.parse(pinnedMessage.link_preview) : null, is_pinned: 1,
                        parent_message_id: pinnedMessage.parent_message_id
                    } : { id: messageId, roomId: roomId }; // Fallback if message fetch fails

                    io.to(roomId).emit("messagePinned", pinnedMessageData);
                    if (typeof callback === 'function') (typeof callback === "function" && callback({ success: true, message: "Message pinned successfully." }));
                });
            });
        });
    });

    // Handle unpinning a message
    socket.on("unpinMessage", async ({ messageId, roomId }, callback) => {
        if (!socket.username || !socket.room || socket.room !== roomId) {
            return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Unauthorized or not in the correct room." }));
        }
        
        // Check if the user is admin or the sender of the message
        db.get("SELECT username FROM messages WHERE id = ? AND room = ?", [messageId, roomId], (err, message) => {
            if (err) {
                console.error("Unpin message lookup DB Error:", err.message);
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Error verifying message." }));
            }
            if (!message) {
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Message not found." }));
            }
            if (message.username !== socket.username && socket.role !== 'admin') {
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "You can only unpin your own messages or as an admin." }));
            }

            // Attempt to unpin the message
            db.run(`DELETE FROM pinned_messages WHERE message_id = ? AND room_id = ?`, [messageId, roomId], function(err) {
                if (err) {
                    console.error("Unpin message DB Error:", err.message);
                    return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Error unpinning message." }));
                }
                // Check if any row was affected
                if (this.changes === 0) {
                    return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Message not found or could not be unpinned." }));
                }
                
                // Notify room about the unpinned message
                io.to(roomId).emit("messageUnpinned", { messageId, roomId, unpinnedBy: socket.username });
                if (typeof callback === 'function') (typeof callback === "function" && callback({ success: true, message: "Message unpinned successfully." }));
            });
        });
    });

    // Handle user status update
    socket.on("updateStatus", async ({ status }, callback) => {
        if (!socket.username) {
            return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Authentication required." }));
        }
        socket.status = status;
        activeSessions[socket.username] = socket.id; // Update session tracking

        // Update user status in DB
        db.run("UPDATE users SET status = ? WHERE username = ?", [status, socket.username], (err) => {
            if (err) {
                console.error(`Failed to update status for ${socket.username}:`, err.message);
                return typeof callback === "function" && (typeof callback === "function" && callback({ success: false, message: "Failed to update status." }));
            }
            
            // Broadcast status update to all users in the same room
            if (socket.room && rooms[socket.room]) {
                rooms[socket.room].set(socket.username, status); // Update status in room map
                emitUsersInRoom(io, socket.room, db); // Re-emit users in room to update statuses
            }
            
            // Also broadcast to all active sessions if status is relevant for global list
            broadcastUserList(io, db, activeSessions); 
            
            if (typeof callback === 'function') (typeof callback === "function" && callback({ success: true, message: "Status updated." }));
        });
    });

    // Handle 'getUsers' event to broadcast user list for a room
    socket.on("getUsers", () => { // No DB needed here, only user list for room
        if (socket.room) {
            emitUsersInRoom(io, socket.room, db);
        }
    });


    // Send room list to client
    socket.on("getRooms", () => {
        db.all('SELECT name, (password IS NOT NULL AND password != "") as is_private FROM custom_rooms ORDER BY name ASC', [], (err, rows) => {
            if (err) return console.error("getRooms DB Error:", err.message);
            socket.emit("custom rooms", rows || []);
        });
    });
    // Handle user disconnect
    socket.on("disconnect", () => {
      if (socket.username) {
        console.log(`User disconnected: ${socket.username} (ID: ${socket.id})`);
        delete activeSessions[socket.username];
        socket.status = 'offline';
        
        // Update user status in DB
        db.run("UPDATE users SET status = 'offline' WHERE username = ?", [socket.username], (err) => {
            if (err) console.error(`Failed to update status for ${socket.username} on disconnect:`, err.message);
        });
        
        // Update user list for all clients
        broadcastUserList(io, db, activeSessions);

        // Remove user from current room's active users if they were in one
        if (socket.room && rooms[socket.room]) {
          rooms[socket.room].delete(socket.username);
          emitUsersInRoom(io, socket.room, db); // Update user list in the room
        }
      }
      
      // Clean up socket properties
      cleanupSocket(socket);
    });

    // Helper function to emit user list for a specific room
    // emitUsersInRoom is defined at the top of this file
  });
};