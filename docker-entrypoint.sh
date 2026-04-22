#!/bin/sh
set -e

# Start DCC-EX WebSocket proxy in background (if DCCEX_HOST is set)
if [ -n "$DCCEX_HOST" ]; then
  echo "Starting DCC-EX proxy: ws://0.0.0.0:${DCCEX_WS_PORT:-2561} → ${DCCEX_HOST}:${DCCEX_PORT:-2560}"
  node /opt/dccex-proxy/dccex-ws-proxy.mjs &
fi

# Generate runtime config.js from YB_* environment variables
node -e "
  const c = {};
  if (process.env.YB_JMRI_HOST) c.jmriHost = process.env.YB_JMRI_HOST;
  if (process.env.YB_JMRI_PORT) c.jmriPort = parseInt(process.env.YB_JMRI_PORT);
  if (process.env.YB_JMRI_SECURE) c.jmriSecure = process.env.YB_JMRI_SECURE === 'true' || process.env.YB_JMRI_SECURE === '1';
  if (process.env.YB_MOCK) c.mock = process.env.YB_MOCK === 'true' || process.env.YB_MOCK === '1';
  if (process.env.YB_DEBUG) c.debug = process.env.YB_DEBUG === 'true' || process.env.YB_DEBUG === '1';
  if (process.env.YB_DCCEX_ENABLED) c.dccexEnabled = process.env.YB_DCCEX_ENABLED === 'true' || process.env.YB_DCCEX_ENABLED === '1';
  if (process.env.YB_DCCEX_HOST) c.dccexHost = process.env.YB_DCCEX_HOST;
  if (process.env.YB_DCCEX_PORT) c.dccexPort = parseInt(process.env.YB_DCCEX_PORT);
  if (process.env.YB_DCCEX_PWM_FREQ) c.dccexPwmFreq = parseInt(process.env.YB_DCCEX_PWM_FREQ);
  if (process.env.YB_HA_ENABLED) c.haEnabled = process.env.YB_HA_ENABLED === 'true' || process.env.YB_HA_ENABLED === '1';
  if (process.env.YB_HA_URL) c.haUrl = process.env.YB_HA_URL;
  if (process.env.YB_HA_TOKEN) c.haToken = process.env.YB_HA_TOKEN;
  if (process.env.YB_HA_AREA) c.haArea = process.env.YB_HA_AREA;
  require('fs').writeFileSync(
    '/usr/share/caddy/config.js',
    'window.__YB_CONFIG__ = ' + JSON.stringify(c) + ';\\n'
  );
  console.log('config.js written with keys:', Object.keys(c).join(', ') || '(none — all defaults)');
"

# Start Caddy in foreground
exec caddy run --config /etc/caddy/Caddyfile
