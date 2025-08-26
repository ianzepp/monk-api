# Monk API Dockerfile - Multi-stage build for development and production

# Development stage - includes TypeScript and hot reload
FROM node:20-slim as development
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including dev dependencies for tsx watch)
RUN npm install

# Copy source code
COPY . .

# Expose API port
EXPOSE 9001

# Development command with hot reload
CMD ["npm", "run", "start:dev"]

# Build stage - compile TypeScript
FROM node:20-slim as build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies for build
RUN npm install

# Copy source code
COPY . .

# Compile TypeScript
RUN npm run compile

# Production stage - minimal runtime
FROM node:20-slim as production
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 monk && \
    adduser --system --uid 1001 monk

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production && npm cache clean --force

# Copy compiled JavaScript from build stage
COPY --from=build /app/dist ./dist

# Copy CLI and bin directories (needed for monk command)
COPY --from=build /app/cli ./cli
COPY --from=build /app/bin ./bin

# Copy SQL initialization files
COPY --from=build /app/sql ./sql

# Change ownership to non-root user
RUN chown -R monk:monk /app

# Switch to non-root user
USER monk

# Expose API port
EXPOSE 9001

# Health check using existing ping endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:9001/ping', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Production command
CMD ["node", "dist/index.js"]