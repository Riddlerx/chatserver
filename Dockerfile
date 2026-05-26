# Use Node 22 as the base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the backend code
COPY . .

# Expose the backend port
EXPOSE 3000

# Start the server
CMD ["sh", "-c", "npm run init-pg-db && npm start"]
