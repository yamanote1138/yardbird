#!/bin/sh
set -e

# Use /config/yardbird.yaml if volume-mounted, overriding the built-in default
if [ -f /config/yardbird.yaml ]; then
  echo "Using config from /config/yardbird.yaml"
  ln -sf /config/yardbird.yaml /usr/share/caddy/yardbird.yaml
fi

# Start DCC-EX WebSocket proxy in background (if DCCEX_HOST is set)
if [ -n "$DCCEX_HOST" ]; then
  echo "Starting DCC-EX proxy: ws://0.0.0.0:${DCCEX_WS_PORT:-2561} → ${DCCEX_HOST}:${DCCEX_PORT:-2560}"
  node /opt/dccex-proxy/dccex-ws-proxy.mjs &
fi

# Start Caddy in foreground
exec caddy run --config /etc/caddy/Caddyfile
