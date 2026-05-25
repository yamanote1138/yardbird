# YardBird - Project Guide

This file contains project conventions, architecture decisions, and development standards for maintaining consistency across Claude sessions.

## Project Overview

**YardBird** is a pure frontend SPA for model railroad control. The browser connects directly to JMRI via WebSocket — no backend server required. Connections are configured via the setup screen (manual entry or YAML import); layout config persists in `localStorage`.

### Tech Stack
- **Vue 3** with Composition API and TypeScript
- **Vite** for fast development and building
- **Nuxt UI 4** + **Tailwind CSS 4** for responsive UI components
- **Iconify** (Material Design Icons + Heroicons) for icons
- **jmri-client 4.2+** for WebSocket-based JMRI communication (includes connection prefix support)
- **js-yaml** for YAML import/export (`useYamlConfig.ts`)
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
- **localStorage-first config** — `useConfig` is a pure localStorage manager; YAML is import/export only
- **Plugin system** — each integration lives in `src/plugins/<name>/` with an `index.ts` composable and `components/` directory
- **Mock mode** — run without hardware by setting `mock: true` in the JMRI connection config

### Project Structure
```
src/
├── core/
│   ├── types.ts          — StoredConfig, WidgetInstance, plugin configs, PowerZone types
│   ├── useConfig.ts      — Pure localStorage manager: sanitize on load, needsSetup, applyImport, save()
│   └── useYamlConfig.ts  — Stateless YAML import/export: sanitize(), importYaml(), exportYaml()
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

3. **Config Flow (localStorage only)**
   - `useConfig.ts` is a pure localStorage manager — no YAML dependency at runtime
   - On load: reads `yardbird:config` from localStorage, runs through `sanitize()` (strips unknown/deprecated fields), sets `needsSetup = true` if empty or invalid
   - `needsSetup: true` → `ConnectionSetup.vue` is shown; user fills in the form manually or imports a YAML file
   - YAML (`public/yardbird.yaml`) is a blank template — served for Docker operators to volume-mount a seed config
   - Docker banner: on mount, `ConnectionSetup` fetches `/yardbird.yaml`; if it has a real host, shows an import prompt
   - `applyImport(config)` sets config from a parsed `StoredConfig` and clears `needsSetup`
   - `saveConnections()` also works when `needsSetup` (config is null) — creates a fresh config
   - `reset()` clears localStorage and sets `needsSetup = true`

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

10. **Roster Groups**
    - `rosterGroups` in YAML maps JMRI group names to command station prefixes (no address lists)
    - `fetchRosterGroups()` calls `getRosterGroups()` + `getRosterEntriesByGroup()` from jmri-client v5.1+
    - All fetched entries are added to `jmriState.roster`; only configured groups go into `groupedRosterEntries`
    - `groupedRoster` computed: entries per configured group; `ungroupedRoster` computed: entries not in any configured group
    - `jmri-client` exports its own `RosterGroup` type — our config type is `RosterGroupConfig` to avoid collision
    - `fetchRoster()` mock mode is broken (issue #21); use `fetchRosterGroups()` to populate roster in tests

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
- `ConnectionSetup.vue` shows when `needsSetup` is true (no valid config) or when the user navigates back
- First-run: form starts blank; optional Docker banner if `/yardbird.yaml` has a real host
- "Configure/Edit" per connection → form modal → `saveConnections()` → clears `needsSetup`
- "Import config" link → file input → `importYaml()` → `applyImport()` with warnings display
- "Export config" link → `exportYaml()` → Blob download as `yardbird.yaml`

## Configuration

Config lives entirely in `localStorage` key `yardbird:config` (a `StoredConfig` JSON blob).

**First-run setup:** Enter JMRI host/port manually in the setup screen, or import a YAML file.

**Docker operators:** Volume-mount a pre-filled `yardbird.yaml` to `/config/yardbird.yaml`. The entrypoint symlinks it to the web root. The setup screen detects it and offers a one-click import.

**In development:** `public/yardbird.yaml` is a blank template — edit it to test the Docker banner, or just fill in the setup form.

**Config notes:**
- `tramPrefix` — **deprecated**, silently stripped on load/import; ignored
- `tramPwmFreq` — default DC PWM frequency index: 0=131Hz, 1=490Hz, 2=3.4kHz, 3=Supersonic (default 3)
- `commandStations` — array of `{name, prefix}`, or `{discover: true}`, or omit for single button

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

### Testing

- **Framework**: Vitest v4+ with jsdom environment; `@vue/test-utils` for component tests
- **Run**: `npm test` (single run), `npm run test:watch` (watch mode), `npm run coverage` (coverage report)
- **Singleton reset**: module-scope composables must be reset in `afterEach`
  - `useEditMode().exit()` — resets edit mode to false
  - `useWidgetConfig().cancel()` — clears pending config state
  - `useJmri().disconnect()` — clears all JMRI state; add a 50ms `setTimeout` flush after to let mock callbacks settle
  - `useConfig` — use `vi.resetModules()` + `vi.doMock()` + dynamic import per test (module-scope init runs on import)
- **JMRI mock mode**: set `mockEnabled: true` in settings; mock client auto-connects and serves fixture data
- **`fetchRoster()` limitation (issue #21)**: mock data format differs from real JMRI; use `fetchRosterGroups()` to populate roster in tests — it calls `getRosterEntriesByGroup()` which works correctly in mock mode
- **`vi.waitFor()`**: use as `vi.waitFor(fn, opts)` — it is NOT a standalone named export from vitest
- **Test files**: `src/__tests__/<layer>/<module>.test.ts` mirroring `src/` structure

### Future Component Tests

Vue component tests (`.vue` files) will use `@vue/test-utils` with `mount`. These require Nuxt UI and Tailwind stubs; not yet implemented. Until then, test logic at the composable layer.

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

No `YB_*` variables — app config lives in the browser's localStorage; seed via `/config/yardbird.yaml` volume mount.

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
- Ensure `commandStation` in the JMRI connection config matches the DCC-EX prefix in JMRI Preferences → Connections
- Enable `debug: true` in the connection settings and check the browser console for acquisition errors

**Power zone shows UNKNOWN after connect**
- JMRI doesn't reliably return named-connection power state via WebSocket — this is expected
- Toggle the button once to set a known state

**Cannot connect to JMRI**
- Verify JMRI WebSocket server enabled: *Preferences → Web Server → JSON WebSocket*
- Enable `debug: true` in the connection settings and check browser console

**Config changes not appearing**
- Live config is in `localStorage` key `yardbird:config`
- To reset: click "Reset" on the setup screen, or clear `yardbird:config` from DevTools → Application → Local Storage
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
