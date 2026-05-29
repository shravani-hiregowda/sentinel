# Use official Node.js base image (Alpine for a lightweight image)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies using npm ci for consistency and speed
RUN npm ci --omit=dev

# Copy the rest of the application
COPY . .

# Expose the API server port
EXPOSE 5000

# Set default environment variables (can be overridden in docker-compose.yml)
ENV PORT=5000
ENV NODE_ENV=production

# Run the app
CMD ["npm", "start"]
