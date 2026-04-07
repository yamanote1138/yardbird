#!/bin/sh
set -e

# Start DCC-EX WebSocket proxy in background (if DCCEX_HOST is set)
if [ -n "$DCCEX_HOST" ]; then
  echo "Starting DCC-EX proxy: ws://0.0.0.0:${DCCEX_WS_PORT:-2561} → ${DCCEX_HOST}:${DCCEX_PORT:-2560}"
  node /opt/dccex-proxy/dccex-ws-proxy.mjs \
    --ws-port "${DCCEX_WS_PORT:-2561}" \
    --dccex-host "$DCCEX_HOST" \
    --dccex-port "${DCCEX_PORT:-2560}" &
fi

# Start Caddy in foreground
exec caddy run --config /etc/caddy/Caddyfile
