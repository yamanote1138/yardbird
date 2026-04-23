# YardBird - Project Guide

This file contains project conventions, architecture decisions, and development standards for maintaining consistency across Claude sessions.

## Project Overview

**YardBird** is a pure frontend SPA for model railroad control. The browser connects directly to JMRI and (optionally) DCC-EX via WebSocket — no backend server required. Tabs and plugin connections are driven by a YAML config file.

### Tech Stack
- **Vue 3** with Composition API and TypeScript
- **Vite** for fast development and building
- **Nuxt UI 4** + **Tailwind CSS 4** for responsive UI components
- **Iconify** (Material Design Icons + Heroicons) for icons
- **jmri-client 4.1+** for WebSocket-based JMRI communication
- **js-yaml** for parsing `yardbird.yaml` at startup
- **Node.js 20+** required

### Current Version
v6.1.0 — Modular plugin architecture + YAML config + tram throttle improvements

## User Context & Preferences

**Train Enthusiasm**: The user is specifically interested in Japanese trains, particularly the Yamanote Line. When discussing trains in conversation or explanations, favour Japanese railway references. This is context for communication style only — do NOT add Japanese train references to code, documentation, or user-facing features.

## Architecture

### Pure Frontend SPA
- **No backend server** — browser communicates directly with JMRI via WebSocket
- **YAML-driven config** — `public/yardbird.yaml` (dev) or `/config/yardbird.yaml` (Docker volume)
- **Plugin system** — each integration lives in `src/plugins/<name>/` with an `index.ts` composable and `components/` directory
- **Mock mode** — run without hardware by setting `mock: true` in the JMRI plugin config

### Project Structure
```
src/
├── core/
│   ├── types.ts          — Layout config type definitions (LayoutConfig, plugin configs, TabConfig)
│   └── useLayout.ts      — Fetches and parses yardbird.yaml; exposes tabs, plugins, debug flag
│
├── plugins/
│   ├── jmri/
│   │   ├── index.ts                — useJmri composable (singleton)
│   │   ├── ExtendedJmriClient.ts   — JMRI client subclass (named power sources)
│   │   └── components/
│   │       ├── ThrottleList.vue, ThrottleCard.vue
│   │       ├── TurnoutList.vue, LightList.vue
│   │       └── RosterCard.vue, LocomotiveHeader.vue
│   ├── dccex/
│   │   ├── index.ts                — useDccEx composable (singleton)
│   │   └── components/
│   │       └── TramWidget.vue
│   └── homeassistant/
│       ├── index.ts                — useHomeAssistant composable (singleton)
│       └── components/
│           └── SceneWidget.vue
│
├── components/           — Shared UI (not plugin-specific)
│   ├── ConnectionSetup.vue   — Splash screen with "All Aboard!" button
│   └── PowerControl.vue
│
├── utils/
│   └── logger.ts         — setDebugMode(bool) controls debug output; called from App.vue
└── types/
    ├── jmri.ts
    └── homeAssistant.ts

public/
└── yardbird.yaml         — Default layout and connection configuration

proxy/
└── dccex-ws-proxy.mjs    — WebSocket-to-TCP relay for DCC-EX
```

### Key Architectural Decisions

1. **jmri-client Browser Bundle**
   - CRITICAL: Vite aliases `jmri-client` → `node_modules/jmri-client/dist/browser/jmri-client.js`
   - The Node.js bundle breaks WebSocket reconnection in the browser — do NOT change this alias

2. **Singleton State Pattern**
   - All plugin composables (`useJmri`, `useDccEx`, `useHomeAssistant`) hold state at module scope
   - Single instance shared across all components — prevents multiple WebSocket connections
   - State persists across component mount/unmount cycles

3. **YAML Config Flow**
   - `useLayout.ts` fetches `/yardbird.yaml` on module import (auto-loads at startup)
   - Falls back to `DEFAULT_CONFIG` (JMRI only, three tabs) on any fetch/parse error
   - `App.vue` reads `layout.tabs` for tab bar and `layout.plugins` for connection params
   - `layout.debug` drives `setDebugMode()` in logger

4. **DCC-EX Proxy Architecture**
   - DCC-EX EX-CommandStation speaks raw TCP, not WebSocket — browser needs a relay
   - Proxy runs alongside the app (locally via `dev:all`, in Docker via `DCCEX_HOST` env var)
   - **YAML `dccex.host/port`** = where the browser connects (the proxy, always `localhost:2561`)
   - **`DCCEX_HOST`/`DCCEX_PORT` env vars** = where the proxy connects (the hardware)
   - Proxy opens two TCP connections per browser client: WiThrottle (throttles) + native (power/PWM)
   - Two connections required because DCC-EX locks protocol on first message (`<` = native, else WiThrottle)

5. **Tram Throttle Behaviour**
   - Tram addresses 30 (inner loop) and 31 (outer loop) are filtered from the main JMRI roster
   - On acquire: PWM frequency is sent via `<F addr DCFREQ n>` native command (500ms delay)
   - Release button shown once throttle is acquired; sends speed=0 then WiThrottle release
   - All acquired tram throttles are auto-released when DCC-EX power transitions from on → off
   - PWM frequency label displayed in parentheses in the sublabel (e.g. "Inner Loop (Supersonic)")
   - Four frequency options: 131 Hz (0), 490 Hz (1), 3.4 kHz (2), Supersonic (3)

6. **Power State**
   - Uses official `PowerState` enum from jmri-client (0=UNKNOWN, 2=ON, 4=OFF)
   - Three-state UI: ON (green), OFF (red), UNKNOWN (yellow)
   - DCC-EX power: WiThrottle `PPA` only controls MAIN tracks; native `<1>`/`<0>` controls ALL tracks including DC

7. **Green Colour Override**
   - `main.css` overrides `--ui-color-success-*` variables with YardBird greens (`#a1c54b` / `#98c130`)
   - Speed bar components use `bg-success-600` / `bg-success-600/50` (not `bg-green-*`)

8. **Lights & Turnouts / LCC Independence**
   - LCC entities (lights, turnouts) remain controllable when DCC track power is off
   - Only throttles require power to be on

9. **Heartbeat**
   - JMRI: 15-second heartbeat (JMRI disconnects after 30s idle)
   - DCC-EX: heartbeat interval set by server (`*N` message); sent at half the interval

## Configuration

All layout and connection settings live in `yardbird.yaml`. The browser fetches it from `/yardbird.yaml` at startup.

**In development:** edit `public/yardbird.yaml` — Vite serves `public/` as static files.

**In Docker/production:** volume-mount a `config/` directory:
```yaml
volumes:
  - ./config:/config   # place yardbird.yaml inside config/
```
The entrypoint symlinks `/config/yardbird.yaml` → the web root if present.

**DCC-EX config notes:**
- `dccex.host: localhost` and `dccex.port: 2561` always (browser connects to the proxy)
- Hardware address goes in `DCCEX_HOST` env var (used by proxy, not YAML)
- `pwmFreq` sets the default PWM frequency applied to all trams on acquire

## Development Conventions

### Vue/TypeScript Style
- `<script setup>` syntax, Composition API only
- `@/` import alias for all `src/` imports — no relative `../../` paths
- Use `logger.debug/info/warn/error` from `@/utils/logger` — no direct `console.log`
- Debug output only shown when `debug: true` in `yardbird.yaml`

### Component Organisation
```
1. Imports (grouped: vue, external, local)
2. Props/Emits
3. Composables
4. Local state
5. Computed
6. Methods
7. Lifecycle hooks
```

### Naming Conventions
- Plugin composables: `use<Name>` in `plugins/<name>/index.ts`
- Widget components: `<Noun>Widget.vue` (plugin-specific) or `<Noun>List.vue` / `<Noun>Card.vue`
- Shared components (used by multiple plugins): `src/components/`
- Tab `id` in `yardbird.yaml` must match a key in the `tabComponents` map in `App.vue`

## Git Conventions

### Commit Format
- Feature/fix: `Brief description of change`
- Release: `Release vX.Y.Z: Brief description`
- No AI attribution in commits

### Release Workflow
```bash
# 1. Commit changes
git add <files>
git commit -m "Description"

# 2. Bump version in package.json, commit
git add package.json
git commit -m "Release vX.Y.Z: Brief description"

# 3. Tag and push
git tag -a vX.Y.Z -m "Release vX.Y.Z: Brief description"
git push && git push --tags

# 4. GitHub release
gh release create vX.Y.Z --title "vX.Y.Z: Title" --notes "..."
```
GitHub Actions builds and pushes the Docker image on tag push.

## Docker

- Multi-stage Dockerfile: Node 20 Alpine builder → Node 20 Alpine + Caddy production
- Multi-platform: linux/amd64 and linux/arm64
- DCC-EX proxy starts automatically when `DCCEX_HOST` env var is set
- Image: `yamanote1138/yardbird`

### Env Vars (Docker)
| Variable | Purpose | Default |
|---|---|---|
| `DCCEX_HOST` | DCC-EX CommandStation IP (proxy target) | — (proxy disabled) |
| `DCCEX_PORT` | DCC-EX TCP port | 2560 |
| `DCCEX_WS_PORT` | Proxy WebSocket listen port | 2561 |
| `PORT` | Host port for the web app | 8080 |

No `YB_*` variables — all app config lives in `yardbird.yaml`.

## Common Tasks

### Development
```bash
npm install
npm run dev          # Vite only (JMRI features)
npm run dev:all      # Vite + DCC-EX proxy (requires DCCEX_HOST in .env.local)
npm run build        # Type-check + production build
npm run type-check   # TypeScript check only
```

`.env.local` for DCC-EX dev:
```
DCCEX_HOST=192.168.1.231
```

### Testing Without Hardware
Set `mock: true` in the `jmri` plugin config in `yardbird.yaml`.

## JMRI Integration Notes

- **Connection lifecycle**: autoConnect off → manual connect → fetch power/turnouts/lights → fetch roster
- **Throttles**: created on-demand by DCC address; stored in Map; release is a future enhancement
- **Lights**: LCC-based, independent of DCC power; fetched on connect via `listLights()`
- **Power quirks**: JMRI state can be inconsistent immediately after set — always verify after change

## Troubleshooting

**DCC-EX stuck on "connecting"**
- Check `dccex.host: localhost` and `dccex.port: 2561` in `yardbird.yaml` (common mistake: putting hardware IP here)
- Confirm `npm run dev:all` is running (not just `npm run dev`)
- Confirm `DCCEX_HOST` is set (in `.env.local` for dev, env var for Docker)

**Cannot connect to JMRI**
- Verify JMRI WebSocket server enabled: *Preferences → Web Server → JSON WebSocket*
- Set `debug: true` in `yardbird.yaml` and check browser console

**Config changes not appearing**
- App fetches `yardbird.yaml` once at startup — reload the page

---

*Last updated: April 2026 (v6.1.0)*
