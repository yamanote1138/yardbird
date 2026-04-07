# syntax=docker/dockerfile:1

# ============================================
# Builder Stage
# ============================================
FROM node:20.18.0-alpine AS builder

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
# Production Stage - Caddy + DCC-EX Proxy
# ============================================
FROM node:20-alpine

# Install Caddy
COPY --from=caddy:2-alpine /usr/bin/caddy /usr/bin/caddy

# Copy built static files
COPY --from=builder /usr/src/app/dist /usr/share/caddy

# Set up the DCC-EX WebSocket proxy with its dependency
COPY proxy/dccex-ws-proxy.mjs /opt/dccex-proxy/dccex-ws-proxy.mjs
RUN cd /opt/dccex-proxy && npm init -y > /dev/null 2>&1 && npm install ws

# Create a simple Caddyfile for SPA routing
RUN echo $'{\n\
    auto_https off\n\
}\n\
\n\
:80 {\n\
    root * /usr/share/caddy\n\
    encode gzip\n\
    try_files {path} /index.html\n\
    file_server\n\
}' > /etc/caddy/Caddyfile

# Entrypoint: start proxy in background, then Caddy in foreground
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose HTTP and DCC-EX proxy ports
EXPOSE 80 2561

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
