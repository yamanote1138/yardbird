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

Open `http://<your-server>:9273` in a browser. On a browser with no saved setup, YardBird spots the mounted file and offers to import it. After that, settings live in the browser and are changed in the app; editing the file again only affects browsers that haven't been set up yet (or have been reset).

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

**Requirements:** Node.js 24+

```bash
npm install

# Start the dev server (then fill in the setup screen)
npm run dev          # http://localhost:5173

# Other commands
npm run build        # Type-check + production build
npm run type-check   # TypeScript check only
npm run preview      # Preview the production build locally
```

The dev server binds to all interfaces (`host: true` in `vite.config.ts`), so you can test on mobile devices on the same network.

### Testing without hardware

Tick **Mock mode** in the JMRI connection settings on the setup screen (or set `mock: true` under `plugins.jmri` in a YAML you import). The app simulates JMRI responses — no JMRI server or layout hardware required.

## JMRI setup

### Enable the JSON WebSocket server

In JMRI: **Preferences → Web Server** — check **Enable**, and ensure **JSON WebSocket** is checked. The default port is **12080**.

### DCC-EX connection (DC locos)

YardBird runs DC locos through JMRI and DCC-EX. No separate proxy is needed.

1. Add your DCC-EX command station in JMRI: **Preferences → Connections → Add** → DCC-EX, configure IP and port (DCC-EX default: 2560).
2. Note the prefix letter JMRI assigns (shown in the connection list, typically `D`).
3. Add that prefix as a command station (setup screen, or `commandStations` in YAML), then pick it in the throttle widget's settings.
4. Locos on addresses 30–32 show PWM frequency buttons; Supersonic is set automatically on acquire.

If JMRI loses its DCC-EX connection (e.g. the command station is power-cycled), it will **not** auto-reconnect — restart JMRI to restore it.

## First run

On first load you'll see the setup screen. Enter your JMRI host and port (or import a `yardbird.yaml`), then click **All Aboard!** to connect. With Docker, if a config file is mounted, the setup screen offers to import it in one click.

If there are no tabs yet (first run or after a reset), you'll see a welcome screen prompting you to enter edit mode and build your dashboard.

## Resetting to defaults

To clear your saved setup and dashboard and go back to the setup screen:

- In the app: enter edit mode → click the reset (↺) button in the tab bar
- Via browser DevTools: clear `yardbird:config` from Application → Local Storage, then reload
