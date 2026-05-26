# Use Node 22 as the base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the frontend code
COPY . .

# Expose the Vite dev server port
EXPOSE 5173

# Start the frontend in dev mode with --host to allow external access
CMD ["npm", "run", "dev", "--", "--host", "--port", "5173"]
