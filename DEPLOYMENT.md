# Oracle Cloud Deployment Guide

## Database Setup

Since SQLite database files are in `.gitignore`, you need to initialize the database on the server.

### Method 1: Auto-Initialization (Recommended)
The server automatically detects if the database exists and initializes it on first run.

### Method 2: Manual Initialization
```bash
# After deployment, SSH into your Oracle Cloud instance
cd /path/to/your/app
npm run init-db
```

### Method 3: Using Deploy Script
```bash
npm run deploy
```

## Environment Variables
Set these in Oracle Cloud:
- `JWT_SECRET`: Your secret key for JWT tokens
- `DB_PATH`: (Optional) Path to your SQLite database file
- `PORT`: (Optional) Server port (defaults to 3000)

## Deployment Steps

1. **Push to Git Repository**
   ```bash
   git add .
   git commit -m "Ready for Oracle Cloud deployment"
   git push origin main
   ```

2. **Configure Oracle Cloud Compute Instance**
   - Create compute instance
   - Install Node.js and npm
   - Clone your repository
   - Install dependencies: `npm install`

3. **Set Environment Variables**
   ```bash
   export JWT_SECRET="your-secret-key-here"
   export PORT=3000
   ```

4. **Start the Application**
   ```bash
   npm start
   ```
   
   The database will be automatically created on first startup.

## Database Persistence
To ensure your database persists across deployments:
1. Store the database file in a persistent directory
2. Set `DB_PATH` environment variable to that location
3. Example: `export DB_PATH="/home/opc/chatapp/chat.db"`

## Troubleshooting
- If database errors occur, run `npm run init-db` manually
- Check that the database file has proper permissions
- Ensure the directory is writable by the application user
