# Hatch OS Docker Container
# Multi-stage build for optimized production image

# Stage 1: Build environment
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production environment
FROM node:18-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    sqlite \
    curl \
    bash \
    dumb-init \
    && addgroup -g 1001 -S hatch \
    && adduser -S hatch -u 1001 -G hatch

# Set working directory
WORKDIR /opt/hatch-os

# Copy built application from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/src/backend ./src/backend
COPY --from=builder /app/src/main.js ./src/main.js
COPY --from=builder /app/src/preload.js ./src/preload.js
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/config ./config

# Create necessary directories
RUN mkdir -p /var/lib/hatch-os /var/log/hatch-os /tmp/hatch-vscode \
    && chown -R hatch:hatch /opt/hatch-os /var/lib/hatch-os /var/log/hatch-os /tmp/hatch-vscode

# Set environment variables
ENV NODE_ENV=production
ENV HATCH_HOME=/opt/hatch-os
ENV HATCH_DATA=/var/lib/hatch-os
ENV HATCH_LOGS=/var/log/hatch-os
ENV PORT=3001
ENV DISPLAY=:99

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Switch to non-root user
USER hatch

# Start the application
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/backend/server.js"]

# Labels for metadata
LABEL maintainer="Zylon Labs <support@zylonlabs.com>"
LABEL version="1.0.0"
LABEL description="Hatch OS - Lightweight, secure, educational operating system"
LABEL org.opencontainers.image.title="Hatch OS"
LABEL org.opencontainers.image.description="Educational operating system with cloud sync and security features"
LABEL org.opencontainers.image.vendor="Zylon Labs"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/Jagrit0711/hatchos"