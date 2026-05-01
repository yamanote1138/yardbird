# YardBird - Project Guide

This file contains project conventions, architecture decisions, and development standards for maintaining consistency across Claude sessions.

## Project Overview

**YardBird** is a pure frontend SPA for model railroad control. The browser connects directly to JMRI via WebSocket — no backend server required. Tabs and plugin connections are driven by a YAML config file.

### Tech Stack
- **Vue 3** with Composition API and TypeScript
- **Vite** for fast development and building
- **Nuxt UI 4** + **Tailwind CSS 4** for responsive UI components
- **Iconify** (Material Design Icons + Heroicons) for icons
- **jmri-client 4.2+** for WebSocket-based JMRI communication (includes connection prefix support)
- **js-yaml** for parsing `yardbird.yaml` at startup
- **Node.js 22+** required

### Current Version
v6.2.0 — Per-connection power zones + JMRI-native tram control + jmri-client 4.2

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
│   ├── types.ts          — LayoutConfig, plugin configs, PowerZone/PowerZonesConfig types
│   └── useLayout.ts      — Fetches and parses yardbird.yaml; exposes tabs, plugins, debug flag
│
├── plugins/
│   ├── jmri/
│   │   ├── index.ts                — useJmri composable (singleton)
│   │   └── components/
│   │       ├── ThrottleList.vue, ThrottleCard.vue
│   │       ├── TurnoutList.vue, LightList.vue
│   │       ├── TramWidget.vue
│   │       └── RosterCard.vue, LocomotiveHeader.vue
│   └── homeassistant/
│       ├── index.ts                — useHomeAssistant composable (singleton)
│       └── components/
│           └── SceneWidget.vue
│
├── components/           — Shared UI (not plugin-specific)
│   ├── ConnectionSetup.vue   — Splash screen with "All Aboard!" button
│   └── PowerControl.vue      — Per-zone or single power button(s) + Stop All + Exit
│
├── utils/
│   └── logger.ts         — setDebugMode(bool) controls debug output; called from App.vue
└── types/
    ├── jmri.ts
    └── homeAssistant.ts

public/
└── yardbird.yaml         — Default layout and connection configuration
```

### Key Architectural Decisions

1. **jmri-client Browser Bundle**
   - CRITICAL: Vite aliases `jmri-client` → `node_modules/jmri-client/dist/browser/jmri-client.js`
   - The Node.js bundle breaks WebSocket reconnection in the browser — do NOT change this alias

2. **Singleton State Pattern**
   - All plugin composables (`useJmri`, `useHomeAssistant`) hold state at module scope
   - Single instance shared across all components — prevents multiple WebSocket connections
   - State persists across component mount/unmount cycles

3. **YAML Config Flow**
   - `useLayout.ts` fetches `/yardbird.yaml` on module import (auto-loads at startup)
   - Falls back to `DEFAULT_CONFIG` (JMRI only, three tabs) on any fetch/parse error
   - `App.vue` reads `layout.tabs` for tab bar and `layout.plugins` for connection params
   - `layout.debug` drives `setDebugMode()` in logger

4. **Tram Throttle Behaviour**
   - Tram addresses 30 (inner loop) and 31 (outer loop) are filtered from the main JMRI loco roster
   - Controlled entirely through JMRI — no separate protocol, no proxy
   - Optional `tramPrefix` in YAML routes acquisition to a specific JMRI system connection (e.g. `D` for DCC++)
   - If tram addresses are not in the JMRI roster, a synthetic entry is created automatically on acquire
   - On acquire: DC PWM frequency is set via JMRI throttle functions after a 500ms delay:
     - F29=on → ~490 Hz, F30=on → ~3.4 kHz, F31=on → Supersonic, all off → 131 Hz (default)
     - Must be at speed=0 (which it always is on acquire)
   - `tramPwmFreq` in YAML sets the default frequency index (default: 3 = Supersonic)
   - Release: speed set to 0 then throttle released; all trams auto-released when JMRI power goes off
   - PWM frequency label shown in parentheses in the sublabel (e.g. "Inner Loop (Supersonic)")

5. **Power Zones**
   - `powerZones` in YAML defines per-connection power buttons; three modes: explicit array, `discover: true`, or omit for single button
   - Per-zone state tracked in `powerByPrefix: Map<string, PowerState>` (key = prefix string, `""` = default connection)
   - JMRI does not reliably return named-connection power state via WebSocket prefix queries — zone state is managed **optimistically** after `setPower()` succeeds; no re-query
   - `power:changed` events carry no prefix info and do not update per-zone state (would clobber optimistic state)
   - Initial zone states are queried on connect; UNKNOWN is acceptable until first toggle
   - Uses official `PowerState` enum from jmri-client (0=UNKNOWN, 2=ON, 4=OFF)
   - Three-state UI per zone: ON (primary/blue), OFF (neutral/grey), UNKNOWN (warning/yellow)

7. **Green Colour Override**
   - `main.css` overrides `--ui-color-success-*` variables with YardBird greens (`#a1c54b` / `#98c130`)
   - Speed bar components use `bg-success-600` / `bg-success-600/50` (not `bg-green-*`)

8. **Lights & Turnouts / LCC Independence**
   - LCC entities (lights, turnouts) remain controllable when DCC track power is off
   - Only throttles require power to be on

9. **Heartbeat**
   - JMRI: 15-second heartbeat (JMRI disconnects after 30s idle)

## Configuration

All layout and connection settings live in `yardbird.yaml`. The browser fetches it from `/yardbird.yaml` at startup.

**In development:** edit `public/yardbird.yaml` — Vite serves `public/` as static files.

**In Docker/production:** volume-mount a `config/` directory:
```yaml
volumes:
  - ./config:/config   # place yardbird.yaml inside config/
```
The entrypoint symlinks `/config/yardbird.yaml` → the web root if present.

**Tram config notes (under `jmri:`):**
- `tramPrefix` — system connection prefix for the DCC-EX hardware connection (e.g. `D`); omit for single-connection layouts
- `tramPwmFreq` — default DC PWM frequency index applied on tram acquire: 0=131Hz, 1=490Hz, 2=3.4kHz, 3=Supersonic (default 3)
- `powerZones` — array of `{name, prefix}` objects, or `{discover: true}`, or omit for single button. See `yardbird.example.yaml` for all modes.

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

- Multi-stage Dockerfile: Node 22 Alpine builder → Node 22 Alpine + Caddy production
- Multi-platform: linux/amd64 and linux/arm64
- Image: `yamanote1138/yardbird`

### Env Vars (Docker)
| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Host port for the web app | 8080 |

No `YB_*` variables — all app config lives in `yardbird.yaml`.

## Common Tasks

### Development
```bash
npm install
npm run dev          # Vite dev server
npm run build        # Type-check + production build
npm run type-check   # TypeScript check only
```

### Testing Without Hardware
Set `mock: true` in the `jmri` plugin config in `yardbird.yaml`.

## JMRI Integration Notes

- **Connection lifecycle**: autoConnect off → manual connect → resolve power zones → fetch power/turnouts/lights → fetch roster
- **Throttles**: created on-demand by DCC address; stored in Map
- **Lights**: LCC-based, independent of DCC power; fetched on connect via `listLights()`
- **Power zones**: `getSystemConnections()` is only called when `discover: true` — avoid calling it unconditionally as it can time out on some JMRI versions
- **DCC-EX reconnect**: if JMRI loses its connection to DCC-EX (e.g. command station power-cycled), JMRI does NOT auto-reconnect — restart JMRI to restore. Trams power zone shows UNKNOWN in this state.

## Troubleshooting

**Trams won't acquire / wrong hardware**
- Set `tramPrefix` in `yardbird.yaml` to match the DCC-EX prefix in JMRI Preferences → Connections
- Enable `debug: true` and check the browser console for acquisition errors

**Power zone shows UNKNOWN after connect**
- JMRI doesn't reliably return named-connection power state via WebSocket — this is expected
- Toggle the button once to set a known state

**Cannot connect to JMRI**
- Verify JMRI WebSocket server enabled: *Preferences → Web Server → JSON WebSocket*
- Set `debug: true` in `yardbird.yaml` and check browser console

**Config changes not appearing**
- App fetches `yardbird.yaml` once at startup — reload the page

---

*Last updated: April 2026*
