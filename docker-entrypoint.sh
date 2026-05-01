#!/bin/sh
set -e

# Use /config/yardbird.yaml if volume-mounted, overriding the built-in default
if [ -f /config/yardbird.yaml ]; then
  echo "Using config from /config/yardbird.yaml"
  ln -sf /config/yardbird.yaml /usr/share/caddy/yardbird.yaml
fi

# Start Caddy in foreground
exec caddy run --config /etc/caddy/Caddyfile
