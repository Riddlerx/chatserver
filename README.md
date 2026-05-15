# Chat Server

A modern, real-time chat application with channels, direct messages, and interactive features.

## 🚀 Features

- **Real-time Channels**: Join public or private rooms with password protection.
- **Direct Messaging**: Private 1-on-1 conversations with online users.
- **Message Reactions**: React to any message with emojis.
- **Unread Notifications**: Red badges in the sidebar for new activity.
- **Mention Alerts**: Get notified via the bell icon when someone @mentions you.
- **Media Support**: Upload images and preview links in real-time.
- **Admin Panel**: Manage users, ban/unban, and moderate rooms.
- **Responsive UI**: Beautiful, glassmorphism-inspired design with Dark/Light modes.

## 🛠️ Requirements

- **Node.js**: v18 or higher recommended.
- **npm**: v9 or higher.
- **PostgreSQL**: A running PostgreSQL database instance.

## 📦 Setup

1. **Install Dependencies**:
   ```bash
   npm install
   cd frontend && npm install
   cd ..
   ```

2. **Environment Configuration**:
   Create a `.env` file in the root directory:
   ```env
   JWT_SECRET=your_super_secret_key
   DATABASE_URL=postgresql://user:password@localhost:5432/chatserver
   PORT=3000
   NODE_ENV=development
   ```

3. **Database Setup**:
   Initialize the PostgreSQL database and run migrations:
   ```bash
   npm run init-pg-db
   ```

## 🏃 Running the App

Start both the backend and frontend simultaneously:
```bash
npm run dev
```

- **Frontend**: http://localhost:5000
- **Backend**: http://localhost:3000

## 🏠 Sharing on Local Network

To let friends on your Wi-Fi join the chat, use your local IP address:
```bash
# Start with host flag (already configured in npm run dev)
npm run dev
```
Then share your IP: `http://YOUR_LOCAL_IP:5000`

## 🔒 Security

- **CORS**: Configured to trust any localhost port in development.
- **Authentication**: JWT-based secure sessions.
- **Database**: Migrations are idempotent and safe.
