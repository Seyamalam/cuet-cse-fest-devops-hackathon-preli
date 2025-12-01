# =============================================================================
# Backend Production Dockerfile - Multi-stage Build
# =============================================================================
# Stage 1: Build TypeScript
# Stage 2: Production runtime with minimal footprint
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy TypeScript source and config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Prune dev dependencies - keep only production deps
RUN npm ci --only=production && npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Add labels for better maintainability
LABEL maintainer="hackathon-team"
LABEL description="E-commerce Backend Service"
LABEL version="1.0.0"

# Set NODE_ENV
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy compiled JavaScript from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy package.json for npm scripts
COPY --chown=nodejs:nodejs package*.json ./

# Switch to non-root user
USER nodejs

# Expose the backend port (internal only - not published externally)
EXPOSE 3847

# Health check - verify service is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3847/api/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
