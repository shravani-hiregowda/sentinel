# ==============================================================================
# Sentinel Backend Production Dockerfile (Multi-stage, Minimal, Non-Root)
# ==============================================================================

# Stage 1: Dependency resolution and production prune
FROM node:20-alpine AS dependencies
WORKDIR /app

# Install build dependencies if needed (e.g., for native modules like bcrypt)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Production runtime image
FROM node:20-alpine AS runner
WORKDIR /app

# Ensure security: Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Install curl for container health checks
RUN apk add --no-cache curl

# Copy production node_modules from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/

# Security: Run as non-root unprivileged user
RUN chown -R node:node /app
USER node

# Expose API port
EXPOSE 5000

# Default CMD runs the API server. Worker containers override this with ["node", "src/workers/escalation.worker.js"]
CMD ["node", "src/server.js"]
