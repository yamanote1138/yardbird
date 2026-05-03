# YardBird — Installation

## Prerequisites

- **JMRI** with the JSON WebSocket server enabled  
  *(JMRI → Preferences → Web Server → JSON WebSocket, default port 12080)*
- A web browser on the same network as your JMRI server

## Docker (recommended for production)

Pull the pre-built image and run it with your config volume-mounted:

```
your-deployment/
├── compose.yaml
└── config/
    └── yardbird.yaml      ← your config goes here
```

**`compose.yaml`:**
```yaml
services:
  yardbird:
    image: yamanote1138/yardbird:latest
    ports:
      - "9273:80"
    volumes:
      - ./config:/config
```

```bash
# Create config dir and copy the example as a starting point
mkdir -p config
cp yardbird.example.yaml config/yardbird.yaml

# Edit to match your setup
$EDITOR config/yardbird.yaml

# Start
docker compose up -d
```

Open `http://<your-server>:9273` in a browser. Changes to `config/yardbird.yaml` take effect on the next browser page load — no container restart needed.

### Custom port

```bash
PORT=8080 docker compose up -d
```

### Build from source

```bash
docker compose up --build -d
```

### Development with hot reload

```bash
docker compose -f compose.dev.yaml up --build   # http://localhost:5173
```

## Local development

**Requirements:** Node.js 22+

```bash
npm install

# Edit the default config
$EDITOR public/yardbird.yaml

# Start the dev server
npm run dev          # http://localhost:5173

# Other commands
npm run build        # Type-check + production build
npm run type-check   # TypeScript check only
npm run preview      # Preview the production build locally
```

The dev server binds to all interfaces (`host: true` in `vite.config.ts`), so you can test on mobile devices on the same network.

### Testing without hardware

Set `mock: true` in `yardbird.yaml` (under `plugins.jmri`). The app will simulate JMRI responses — no JMRI server or layout hardware required.

## JMRI setup

### Enable the JSON WebSocket server

In JMRI: **Preferences → Web Server** — check **Enable**, and ensure **JSON WebSocket** is checked. The default port is **12080**.

### DCC-EX tram control

YardBird controls DC tram loops through JMRI. No separate proxy is needed.

1. Add your DCC-EX command station in JMRI: **Preferences → Connections → Add** → DCC-EX, configure IP and port (DCC-EX default: 2560).
2. Note the prefix letter JMRI assigns (shown in the connection list, typically `D`).
3. Set `tramPrefix: D` (or your prefix) in `yardbird.yaml`.

If JMRI loses its DCC-EX connection (e.g. the command station is power-cycled), it will **not** auto-reconnect — restart JMRI to restore it.

## First run

On first load, YardBird reads `yardbird.yaml` and saves the connection settings to localStorage. You'll be presented with a connection screen prefilled from your config. Click **All Aboard!** to connect.

If there are no tabs yet (first run or after a reset), you'll see a welcome screen prompting you to enter edit mode and build your dashboard.

## Resetting to defaults

To clear your saved dashboard layout and reload from `yardbird.yaml`:

- In the app: enter edit mode → click the reset (↺) button in the tab bar
- Via browser DevTools: clear `yardbird:config` from Application → Local Storage, then reload
