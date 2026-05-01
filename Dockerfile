# syntax=docker/dockerfile:1

# ============================================
# Builder Stage
# ============================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source files and configuration
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY src ./src
COPY public ./public

# Build the Vue app
RUN npm run build

# ============================================
# Production Stage
# ============================================
FROM caddy:2-alpine

# Copy built static files
COPY --from=builder /usr/src/app/dist /usr/share/caddy
RUN chmod 777 /usr/share/caddy

# Config directory — volume mount /config/yardbird.yaml to override the built-in default
RUN mkdir -p /config

# Caddyfile for SPA routing
COPY Caddyfile /etc/caddy/Caddyfile

# Entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
