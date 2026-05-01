<div align="center">
  <img src="public/favicon.svg" width="96" alt="YardBird" />
  <h1>YardBird</h1>
  <p>A customizable, plugin-driven layout control panel for model railroads.</p>
</div>

---

YardBird is a pure frontend SPA that connects directly to your layout hardware via WebSocket — no backend server required. Tabs, plugins, and connections are defined in a single YAML file you own and edit.

## Features

- **Locomotive throttles** — speed, direction, and function buttons from your JMRI roster
- **Turnouts** — toggle switch positions via JMRI / LCC
- **Lights** — toggle LCC lights, independent of track power
- **DC tram control** — JMRI-native control of DC loop trams via a DCC-EX sub-connection, with configurable PWM frequency
- **Per-connection power zones** — separate power buttons for each system connection (e.g. main DCC layout and tram DC loops)
- **Home Assistant** — trigger HA scenes from a layout tab
- **Config-driven tabs** — add, remove, rename, and reorder tabs in `yardbird.yaml`
- **Responsive** — works on desktop, tablet, and mobile

## Tech Stack

| | |
|---|---|
| [Vue 3](https://vuejs.org/) + TypeScript | Composition API throughout |
| [Vite](https://vitejs.dev/) | Dev server and build tool |
| [Nuxt UI 4](https://ui.nuxt.com/) + [Tailwind CSS 4](https://tailwindcss.com/) | UI components and styling |
| [jmri-client 4.2](https://www.npmjs.com/package/jmri-client) | JMRI WebSocket communication |
| [js-yaml](https://github.com/nodeca/js-yaml) | Config file parsing |

## Architecture

YardBird is a pure frontend SPA. The browser connects directly to JMRI and (optionally) Home Assistant — no intermediate server is involved.

JMRI handles all hardware connections, including DCC-EX for tram control. YardBird sends throttle and power commands to JMRI, which forwards them to the appropriate system connection.

```
┌────────────────────────────┐
│       Browser (Vue 3)      │
│                            │
│  core/useLayout ← yardbird.yaml
│                            │
│  plugins/jmri ─────────────│──→ ws://jmri:12080 (JSON WebSocket)
│  plugins/homeassistant ────│──→ ws://ha:8123
└────────────────────────────┘
              │
              ▼
   ┌──────────────────────┐
   │         JMRI         │
   │                      │
   │  Main connection ────│──→ DCC / LCC / LocoNet hardware
   │  DCC-EX connection ──│──→ DCC-EX command station (IP or serial)
   └──────────────────────┘
```

### Plugin system

Each integration lives in its own directory under `src/plugins/`. A plugin exposes a composable (`index.ts`) and one or more widget components.

```
src/
├── core/
│   ├── types.ts          — LayoutConfig, plugin config, PowerZone type definitions
│   └── useLayout.ts      — Loads and parses yardbird.yaml; exposes tabs + plugin configs
│
├── plugins/
│   ├── jmri/
│   │   ├── index.ts                — useJmri composable (singleton)
│   │   └── components/
│   │       ├── ThrottleList.vue
│   │       ├── ThrottleCard.vue
│   │       ├── TurnoutList.vue
│   │       ├── LightList.vue
│   │       ├── TramWidget.vue
│   │       ├── RosterCard.vue
│   │       └── LocomotiveHeader.vue
│   └── homeassistant/
│       ├── index.ts                — useHomeAssistant composable (singleton)
│       └── components/
│           └── SceneWidget.vue
│
├── components/           — Shared UI (not plugin-specific)
│   ├── ConnectionSetup.vue
│   └── PowerControl.vue
│
├── utils/
│   └── logger.ts
└── types/
    ├── jmri.ts
    └── homeAssistant.ts

public/
└── yardbird.yaml         — Layout and connection configuration (edit this)
```

---

## Configuration

All layout and connection settings live in a single file: **`yardbird.yaml`**.

The app fetches this file from `/yardbird.yaml` at startup. If the file is missing or unparseable it falls back to safe defaults (JMRI only, three tabs). Reload the browser page to pick up any changes.

**Start from the example:** copy [`yardbird.example.yaml`](yardbird.example.yaml) and edit it to match your layout. Every option is documented inline.

### Full schema

```yaml
# Enable verbose logging in the browser console
debug: false

plugins:

  jmri:
    host: jmri.local          # JMRI server hostname or IP
    port: 12080               # JSON WebSocket port (JMRI default: 12080)
    secure: false             # true → wss:// (for TLS / reverse-proxy setups)
    mock: false               # true → simulated data, no hardware needed

    # Tram / DC loop control
    # tramPrefix: system-connection prefix for DCC-EX within JMRI (e.g. "D").
    # Omit if your layout has only one system connection.
    tramPrefix: D

    # DC PWM frequency applied on tram acquire (via F29/F30/F31):
    #   0=131Hz  1=~490Hz  2=~3.4kHz  3=Supersonic (default, recommended)
    tramPwmFreq: 3

    # Power zone buttons in the header toolbar.
    # Option A — explicit named zones:
    powerZones:
      - name: DCC              # Label shown on the button
        prefix: ""             # "" = default JMRI connection
      - name: Trams
        prefix: D              # Must match tramPrefix
    # Option B — auto-discover from JMRI:
    # powerZones:
    #   discover: true
    # Option C — single combined button: remove the powerZones key entirely

  homeassistant:               # Optional — remove to disable
    enabled: true
    url: http://homeassistant.local:8123
    token: ''                  # Long-Lived Access Token from HA Profile → Security
    area: train_room           # HA area_id — only scenes in this area are shown

tabs:
  - id: throttles              # id must match a key in App.vue tabComponents
    name: Locomotives          # Displayed in the tab bar
    icon: i-mdi-train          # Any Iconify icon name

  - id: turnouts
    name: Turnouts
    icon: i-mdi-source-branch

  - id: lights
    name: Lights
    icon: i-mdi-lightbulb-outline

  - id: trams
    name: Trams
    icon: i-mdi-tram

  - id: room
    name: Room
    icon: i-mdi-home
```

Tabs are rendered in the order they appear. Remove an entry to hide that tab entirely. `name` can be anything; `id` is what binds the tab to its component.

Icon names use the Iconify format. Material Design Icons (`i-mdi-*`) and Heroicons (`i-heroicons-*`) are bundled. Browse icons at [icon-sets.iconify.design](https://icon-sets.iconify.design/).

### In development

Edit `public/yardbird.yaml` directly. Vite serves the `public/` directory as static files.

```bash
# 1. Edit the config
$EDITOR public/yardbird.yaml

# 2. Reload the browser — changes take effect immediately
```

### In Docker / production

The built image ships with a minimal default `yardbird.yaml`. Override it by volume-mounting your own file via a `config/` directory:

```
your-deployment/
├── compose.yaml
├── config/
│   └── yardbird.yaml   ← your config goes here
```

**`compose.yaml`:**
```yaml
services:
  yardbird:
    image: yamanote1138/yardbird:latest
    ports:
      - "8080:80"
    volumes:
      - ./config:/config
```

```bash
# 1. Create config dir and copy the example as a starting point
mkdir -p config
cp yardbird.example.yaml config/yardbird.yaml

# 2. Edit it
$EDITOR config/yardbird.yaml

# 3. Deploy
docker compose up -d
```

Changes take effect on the next browser page load — no container restart needed.

---

## JMRI setup

### Required: enable the JSON WebSocket server

In JMRI: **Preferences → Web Server** — enable the server and ensure **JSON WebSocket** is checked. The default port is 12080.

### Tram control via DCC-EX

YardBird controls tram loops natively through JMRI. You do not need a separate proxy.

1. Add your DCC-EX command station as a system connection in JMRI: **Preferences → Connections → Add** → choose DCC-EX, configure the IP address and port (default: 2560).
2. Note the prefix letter JMRI assigns to it (shown in the connection list — typically `D`).
3. Set `tramPrefix: D` (or your prefix) in `yardbird.yaml`.
4. Tram addresses 30 (inner loop) and 31 (outer loop) are reserved. They appear on the **Trams** tab and are excluded from the main locomotive roster.

If JMRI loses the DCC-EX connection (e.g. the command station is power-cycled), it will **not** automatically reconnect — JMRI must be restarted. The Trams power zone will show UNKNOWN in this state, which is expected.

### Power zones

Power zones let you control each JMRI system connection's track power independently from the header toolbar. Without `powerZones` configured, a single combined power button controls all connections.

Find your connection prefix by enabling `debug: true` in `yardbird.yaml`, connecting, and checking the browser console. Or check **JMRI Preferences → Connections**.

---

## Development

```bash
npm install          # First time setup

npm run dev          # Vite dev server at http://localhost:5173
npm run build        # Type-check + production build
npm run type-check   # TypeScript check only
npm run preview      # Preview the production build
```

The dev server binds to all interfaces (`host: true`) so you can test on mobile devices on the same network.

To test without hardware: set `mock: true` in `yardbird.yaml`.

## Deployment

```bash
# Pull and run the pre-built image
docker compose up -d

# Build from source
docker compose up --build -d

# Development with hot reload
docker compose -f compose.dev.yaml up --build   # http://localhost:5173

# Custom port
PORT=3000 docker compose up -d
```

---

## Troubleshooting

**Cannot connect to JMRI**
- Verify the JSON WebSocket server is enabled: JMRI → *Preferences → Web Server → JSON WebSocket*
- Confirm `host` and `port` in `yardbird.yaml` match your JMRI server
- Browser and JMRI must be on the same network (or reachable via hostname)
- Enable `debug: true` and check the browser console for connection errors

**Locomotives not showing**
- Ensure locomotives are added to the JMRI roster
- Check the browser console with `debug: true`

**Tram tab appears but no controls**
- Confirm `tramPrefix` matches the DCC-EX connection prefix in JMRI
- Ensure JMRI is connected to the DCC-EX command station (*Preferences → Connections*)
- The Trams power zone must show ON before trams can be acquired

**Trams power zone shows UNKNOWN**
- JMRI has lost its connection to the DCC-EX command station
- Power-cycling the command station without restarting JMRI will leave the connection in a broken state — restart JMRI to restore it

**Power zone button stays UNKNOWN after first connect**
- JMRI does not reliably return named-connection power state via the WebSocket API
- Toggle the zone button once — the state will be set correctly from that point on

**Config changes not appearing**
- The app fetches `yardbird.yaml` once at startup — reload the page

---

## License

Private use only
