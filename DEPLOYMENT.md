# Oracle Cloud Deployment Guide

## Database Setup

This project uses PostgreSQL. You need to have a PostgreSQL instance running.

### 1. Install PostgreSQL on Oracle Cloud VM

#### For Ubuntu:
```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

#### For Oracle Linux / RHEL:
```bash
sudo dnf install -y postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
```

### 2. Configure PostgreSQL User and Database

Log in as the `postgres` user and create a dedicated user and database for the application:

```bash
sudo -u postgres psql
```

Inside the PSQL prompt:
```sql
CREATE USER chatuser WITH PASSWORD 'your_secure_password';
CREATE DATABASE chatserver OWNER chatuser;
\q
```

### 3. Initialize Database Tables

Once PostgreSQL is running and the database is created, run the migration script:

```bash
# Set your DATABASE_URL first (or put it in .env)
export DATABASE_URL="postgresql://chatuser:your_secure_password@localhost:5432/chatserver"
npm run init-pg-db
```

## Environment Variables
Set these in Oracle Cloud:
- `JWT_SECRET`: Your secret key for JWT tokens
- `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://user:password@localhost:5432/chatserver`)
- `ALLOWED_ORIGINS`: (Optional) Comma-separated list of allowed origins
- `PORT`: (Optional) Server port (defaults to 3000)

Example:
```bash
export JWT_SECRET="your-super-secret-jwt-key-here"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chatserver"
export ALLOWED_ORIGINS="http://168.138.212.140:3000,http://168.138.212.140"
export PORT=3000
```

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
   - Install PostgreSQL or use a managed database service
   - Clone your repository
   - Install dependencies: `npm install`

3. **Set Environment Variables**
   ```bash
   export JWT_SECRET="your-secret-key-here"
   export DATABASE_URL="postgresql://..."
   export PORT=3000
   ```

4. **Initialize Database**
   ```bash
   npm run init-pg-db
   ```

5. **Start the Application**
   ```bash
   npm start
   ```

## Troubleshooting
- If database errors occur, ensure PostgreSQL is running and `DATABASE_URL` is correct.
- Run `npm run init-pg-db` to apply migrations.
