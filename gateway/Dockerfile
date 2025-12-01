# =============================================================================
# Gateway Production Dockerfile
# =============================================================================
# Single-stage build optimized for production
# Plain JavaScript - no build step required
# =============================================================================

FROM node:20-alpine AS production

# Add labels for better maintainability
LABEL maintainer="hackathon-team"
LABEL description="E-commerce API Gateway"
LABEL version="1.0.0"

# Set NODE_ENV
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy application source
COPY --chown=nodejs:nodejs src ./src

# Switch to non-root user
USER nodejs

# Expose the gateway port (this is the only publicly exposed port)
EXPOSE 5921

# Health check - verify gateway is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5921/health || exit 1

# Start the application
CMD ["node", "src/gateway.js"]
