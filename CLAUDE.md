# YardBird - Project Guide

This file contains project conventions, architecture decisions, and development standards for maintaining consistency across Claude sessions.

## Project Overview

**YardBird** is a pure frontend SPA for model railroad control. The browser connects directly to JMRI via WebSocket — no backend server required. Connections are configured via `yardbird.yaml` (factory default) and a runtime dashboard editor; layout config persists in `localStorage`.

### Tech Stack
- **Vue 3** with Composition API and TypeScript
- **Vite** for fast development and building
- **Nuxt UI 4** + **Tailwind CSS 4** for responsive UI components
- **Iconify** (Material Design Icons + Heroicons) for icons
- **jmri-client 4.2+** for WebSocket-based JMRI communication (includes connection prefix support)
- **js-yaml** for parsing `yardbird.yaml` at startup
- **gridstack** for drag-and-drop / resize dashboard grid (widget canvas)
- **vue-draggable-plus** (SortableJS) for tab reordering in edit mode
- **Node.js 22+** required

### Current Version
v8.0.0 — Visual configurator release. Vite 8, TypeScript 6, @vitejs/plugin-vue 6

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
│   ├── types.ts          — LayoutConfig, StoredConfig, WidgetInstance, plugin configs, PowerZone types
│   ├── useLayout.ts      — Fetches and parses yardbird.yaml; used as YAML fallback by useConfig
│   └── useConfig.ts      — Active config: reads localStorage, falls back to useLayout; exposes save()
│
├── composables/          — App-level singletons (not plugin-specific)
│   ├── useEditMode.ts    — Edit mode toggle (module-scope ref)
│   └── useWidgetConfig.ts — Widget config modal state (open/confirm/cancel)
│
├── widgets/              — Dashboard widget system
│   ├── registry.ts       — WidgetDefinition registry (type → component, size, plugin, config flag)
│   ├── WidgetFrame.vue   — Edit-mode wrapper (drag handle, ⚙ config, ✕ delete)
│   ├── WidgetPalette.vue — Slide-in sidebar listing draggable widget types (edit mode only)
│   ├── WidgetConfigModal.vue — Modal shell + per-type config sub-forms
│   └── config/
│       ├── ThrottleConfig.vue
│       ├── TurnoutConfig.vue
│       ├── LightConfig.vue
│       ├── HaEntityConfig.vue
│       └── PowerConfig.vue
│
├── plugins/
│   ├── jmri/
│   │   ├── index.ts                — useJmri composable (singleton)
│   │   └── components/
│   │       ├── ThrottleList.vue, ThrottleCard.vue
│   │       ├── TurnoutList.vue, TurnoutWidget.vue  (single-item widget)
│   │       ├── LightList.vue, LightWidget.vue      (single-item widget)
│   │       ├── TramWidget.vue
│   │       └── RosterCard.vue, LocomotiveHeader.vue
│   └── homeassistant/
│       ├── index.ts                — useHomeAssistant composable (singleton)
│       └── components/
│           └── SceneWidget.vue
│
├── components/           — Shared UI (not plugin-specific)
│   ├── ConnectionSetup.vue   — Splash screen + connection management (add/edit JMRI, HA)
│   ├── TabCanvas.vue         — Gridstack-based grid canvas for a single tab's widgets
│   ├── TabManager.vue        — Edit-mode tab bar (add/rename/reorder/delete tabs)
│   └── HeaderButtons.vue     — Header button row: power, stop all, edit mode, info, exit
│
├── utils/
│   └── logger.ts         — setDebugMode(bool) controls debug output; called from App.vue
└── types/
    ├── jmri.ts
    └── homeAssistant.ts

public/
└── yardbird.yaml         — Factory-default layout and connection configuration
```

### Key Architectural Decisions

1. **jmri-client Browser Bundle**
   - CRITICAL: Vite aliases `jmri-client` → `node_modules/jmri-client/dist/browser/jmri-client.js`
   - The Node.js bundle breaks WebSocket reconnection in the browser — do NOT change this alias

2. **Singleton State Pattern**
   - All plugin composables (`useJmri`, `useHomeAssistant`) hold state at module scope
   - Single instance shared across all components — prevents multiple WebSocket connections
   - State persists across component mount/unmount cycles

3. **Config Flow (localStorage → YAML → DEFAULT_CONFIG)**
   - `useConfig.ts` is the active config source. Priority: `localStorage` key `yardbird:config` → YAML via `useLayout.ts` → `DEFAULT_CONFIG`
   - On first load from YAML: migrates `tabs` into `StoredConfig` format and saves to localStorage
   - `useConfig.save(patch)` persists partial updates to localStorage (deep-merges)
   - `useConfig.reset()` clears localStorage; next load re-reads YAML
   - `useLayout.ts` remains but is only used as the YAML fallback — not called directly by components
   - `App.vue` reads from `useConfig` for tabs, connections, and debug flag

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

### Visual Configurator (feat/visual-configurator)

The dashboard editor allows runtime layout customisation without editing YAML.

#### StoredConfig Schema
```typescript
interface StoredConfig {
  version: 1
  debug?: boolean
  connections: {
    jmri?: JmriPluginConfig
    homeassistant?: HomeAssistantPluginConfig
  }
  tabs: TabConfig[]   // TabConfig now includes widgets: WidgetInstance[]
}

type WidgetType = 'jmri-power' | 'jmri-throttle' | 'jmri-turnout'
                | 'jmri-light' | 'jmri-tram'     | 'ha-entity'

interface WidgetInstance {
  id: string                        // crypto.randomUUID()
  type: WidgetType
  grid: { x: number; y: number; w: number; h: number }
  config: Record<string, unknown>   // address, entityId, prefix, label, etc.
}
```

#### Widget Registry (`src/widgets/registry.ts`)
Each `WidgetType` entry defines: display name, icon, default/min grid size, Vue component, required plugin (`'jmri' | 'homeassistant'`), and whether a config modal is needed. To add a new widget type: add an entry here, create the component, and add a config sub-form if required.

#### Edit Mode
- Toggled via pencil/lock icon in the header (top-right)
- `useEditMode()` singleton — module-scope `ref<boolean>`
- When active: `WidgetPalette` sidebar visible, `TabCanvas` enables Gridstack drag/resize, `WidgetFrame` overlays show drag handle + config + delete, tab bar shows management controls
- When inactive: all editing UI hidden, Gridstack disabled

#### Gridstack Canvas (`src/components/TabCanvas.vue`)
- 12-column grid, cell height ~80px
- Mounts with vanilla Gridstack JS API on a `ref` div
- `GridStack.setupDragIn('.ybw-palette-item', { helper: 'clone' })` connects palette to canvas
- Layout `change` event → syncs positions back to `useConfig.save()`
- `added` event (palette drop) → opens `WidgetConfigModal` before final save
- `gridstack.disable()` in run mode, `gridstack.enable()` in edit mode

#### Tab Management
- `TabManager.vue` wraps the tab bar in edit mode
- Add tab (+) → modal: name + icon picker
- Double-click tab name to rename
- Drag to reorder tabs (vue-draggable-plus / SortableJS)
- × to delete (confirms if tab has widgets)

#### Connection Management
- `ConnectionSetup.vue` reads from `useConfig` — shows saved connections prefilled from localStorage/YAML
- "Edit" per connection → form modal → saves via `useConfig.save()`
- Supports JMRI and Home Assistant connections

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
- App-level composables: `use<Name>` in `src/composables/`
- Widget components: `<Noun>Widget.vue` (plugin-specific) or `<Noun>List.vue` / `<Noun>Card.vue`
- Dashboard infrastructure: `src/widgets/` (registry, frames, palette, config modals)
- Shared components (used by multiple plugins): `src/components/`
- Tab `id` must be unique within the `tabs` array in `StoredConfig` / `yardbird.yaml`

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
| `PORT` | Host port for the web app | 9273 |

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
- `yardbird.yaml` is read once at startup as a fallback; live config is in `localStorage` key `yardbird:config`
- To reset to YAML defaults: call `useConfig().reset()` or clear `yardbird:config` from DevTools → Application → Local Storage
- Reload the page after any manual localStorage edit

---

## Visual Configurator — Complete (shipped in v8.0.0)

All phases implemented on `feat/visual-configurator`, merged to main at v8.0.0.

- [x] **Phase 1** — Config persistence layer: `src/core/types.ts`, `src/core/useConfig.ts`, update `App.vue`
- [x] **Phase 2** — Edit mode toggle: `src/composables/useEditMode.ts`, edit button in header
- [x] **Phase 3** — Widget registry + WidgetFrame: `src/widgets/registry.ts`, `src/widgets/WidgetFrame.vue`, `TurnoutWidget.vue`, `LightWidget.vue`
- [x] **Phase 4** — Gridstack canvas: `src/components/TabCanvas.vue`, replaced tabComponents in `App.vue`
- [x] **Phase 5** — Widget palette + drag-to-grid: `src/widgets/WidgetPalette.vue`, `GridStack.setupDragIn`
- [x] **Phase 6** — Widget config modals: `src/composables/useWidgetConfig.ts`, `src/widgets/WidgetConfigModal.vue`, all sub-forms
- [x] **Phase 7** — Tab management: `src/components/TabManager.vue`, import/export/reset
- [x] **Phase 8** — Connection management UI: `ConnectionSetup.vue`

### Drag-to-canvas: Key implementation notes

- Widget type passes through drag via module-level `draggingWidgetType` in `src/widgets/dragState.ts` (not element attributes — the clone is a new DOM node)
- Correct Gridstack event for external drag-ins is `dropped` `(event, prevNode, newNode)` — NOT `added` (which fires for `addWidget`/`makeWidget` only)
- `setupDragIn` uses `{ flush: 'post' }` watch so palette DOM exists when it runs; `dragInSetup` flag resets on edit mode exit so it re-runs when palette remounts via `v-if`
- **`acceptWidgets` must be `'.ybw-palette-item'`** — when set to `true`, Gridstack v12 internally hardcodes the selector as `.grid-stack-item` (`gridstack.js:2345`), which never matches our palette divs. Use the explicit class selector.
- Grid has `minRow: 3` (240px min height); empty-state overlay uses `pointer-events-none` so it never blocks drops

---

*Last updated: May 2026 — v8.0.0*
