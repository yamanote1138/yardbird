# YardBird — Architecture

## Overview

YardBird is a pure frontend SPA. The browser communicates directly with JMRI and (optionally) Home Assistant over WebSocket — there is no intermediate server.

```
┌─────────────────────────────────┐
│        Browser (Vue 3)          │
│                                 │
│  useConfig ← localStorage       │
│           ← yardbird.yaml       │
│                                 │
│  plugins/jmri ──────────────────│──→ ws://jmri:12080  (JMRI JSON WebSocket)
│  plugins/homeassistant ─────────│──→ ws://ha:8123     (HA WebSocket API)
└─────────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │         JMRI         │
    │                      │
    │  Main connection ────│──→ DCC / LCC / LocoNet hardware
    │  DCC-EX connection ──│──→ DCC-EX command station (tram control)
    └──────────────────────┘
```

## Project Structure

```
src/
├── core/
│   ├── types.ts            — All shared TypeScript interfaces and types
│   ├── useConfig.ts        — Active config: localStorage → YAML → DEFAULT_CONFIG
│   └── useLayout.ts        — YAML parser (used only as fallback by useConfig)
│
├── composables/            — App-level singletons
│   ├── useEditMode.ts      — Edit mode toggle (module-scope ref)
│   └── useWidgetConfig.ts  — Widget config modal state (open/confirm/cancel)
│
├── widgets/                — Dashboard widget system
│   ├── registry.ts         — WidgetDefinition registry (type → component, size, plugin)
│   ├── WidgetFrame.vue     — Edit-mode wrapper (drag handle, ⚙ config, ✕ delete)
│   ├── WidgetPalette.vue   — Slide-in sidebar of draggable widget types (edit mode)
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
│   │       ├── ThrottleWidget.vue, ThrottleCard.vue, ThrottleList.vue
│   │       ├── TurnoutWidget.vue
│   │       ├── LightWidget.vue
│   │       ├── PowerWidget.vue
│   │       ├── RosterCard.vue
│   │       └── LocomotiveHeader.vue
│   └── homeassistant/
│       ├── index.ts                — useHomeAssistant composable (singleton)
│       └── components/
│           └── HaEntityWidget.vue
│
├── components/             — Shared UI components
│   ├── ConnectionSetup.vue — Splash/connection screen
│   ├── TabCanvas.vue       — Gridstack grid canvas for a single tab
│   ├── TabManager.vue      — Edit-mode tab bar (add/rename/reorder/delete + import/export)
│   └── HeaderButtons.vue   — Header control row (power, stop, edit, info, exit)
│
├── utils/
│   └── logger.ts           — setDebugMode(bool) gate for debug output
└── types/
    ├── jmri.ts
    └── homeAssistant.ts

public/
└── yardbird.yaml           — Factory-default config (fetched once at startup)
```

## Key Architectural Decisions

### Singleton State Pattern

All plugin composables (`useJmri`, `useHomeAssistant`) hold reactive state at **module scope**. Every call to `useJmri()` returns the same refs — one WebSocket connection, one roster, one throttle map. State persists across component mount/unmount cycles.

### Config Flow: localStorage → YAML → DEFAULT_CONFIG

`useConfig` is the single source of truth for active config. Priority on load:

1. `localStorage` key `yardbird:config` (JSON, `StoredConfig` format)
2. `public/yardbird.yaml` (fetched via `useLayout`, `LayoutConfig` format, migrated to `StoredConfig`)
3. `DEFAULT_CONFIG` built into `useLayout.ts` (fallback if YAML fetch fails)

On first load from YAML, the migrated config is saved to localStorage. Subsequent page loads use localStorage only. `useConfig.reset()` clears localStorage so the next load re-reads YAML.

The `StoredConfig` schema (what lives in localStorage and in exported files):

```typescript
interface StoredConfig {
  version: 1
  debug?: boolean
  connections: {
    jmri?: JmriPluginConfig
    homeassistant?: HomeAssistantPluginConfig
  }
  tabs: TabConfig[]   // each tab contains widgets: WidgetInstance[]
}
```

The `LayoutConfig` schema (what `yardbird.yaml` uses):

```typescript
interface LayoutConfig {
  debug?: boolean
  plugins: {
    jmri: JmriPluginConfig
    homeassistant?: HomeAssistantPluginConfig
  }
  tabs: Array<{ id: string; name: string; icon: string }>
}
```

### Widget Registry

`src/widgets/registry.ts` maps each `WidgetType` to its display name, icon, default and minimum grid size, Vue component, required plugin, and whether a config modal is needed. To add a new widget type:

1. Add a `WidgetType` union member in `src/core/types.ts`
2. Add a `WidgetDefinition` entry in `src/widgets/registry.ts`
3. Create the widget component (e.g. `src/plugins/jmri/components/MyWidget.vue`)
4. Add a config sub-form in `src/widgets/config/` if needed
5. Wire the sub-form into `WidgetConfigModal.vue`

### Gridstack Canvas

`TabCanvas.vue` mounts Gridstack on a `ref` div using the vanilla JS API. Key points:

- 12-column grid, cell height ~80px
- `acceptWidgets: '.ybw-palette-item'` — must be the explicit class selector; `true` is broken in Gridstack v12 (hardcodes `.grid-stack-item` internally)
- Palette drag-in uses `GridStack.setupDragIn('.ybw-palette-item', { helper: 'clone' })`
- Widget type is communicated via a module-level `draggingWidgetType` ref in `src/widgets/dragState.ts` (not DOM attributes — the clone is a new node)
- External drops fire the `dropped` event, not `added` (which only fires for `addWidget`/`makeWidget`)
- `gridstack.disable()` in run mode; `gridstack.enable()` in edit mode

### JMRI Browser Bundle

Vite aliases `jmri-client` to `node_modules/jmri-client/dist/browser/jmri-client.js`. The Node.js bundle breaks WebSocket reconnection in the browser — do **not** change this alias.

### Power / Command Stations

- `commandStations` ref is populated during the WebSocket `connected` event via `resolveCommandStations()`
- Per-zone power state is tracked in `powerByPrefix: Map<string, PowerState>` (key = prefix string)
- State is managed **optimistically** after `setPower()` — JMRI does not reliably return named-connection power state via the WebSocket API, so we don't re-query after `power:changed` events
- `applyCommandStationsConfig()` allows re-resolving stations without reconnecting (called by App.vue when config changes while connected)

### Tram Throttle Behaviour

- Tram addresses 30 (inner loop) and 31 (outer loop) are filtered from the main locomotive roster
- Controlled entirely through JMRI — no separate protocol
- `tramPrefix` in config routes acquisition to the DCC-EX system connection
- PWM frequency set via throttle functions F29/F30/F31 after a 500 ms delay on acquire
- `tramPwmFreq` in config sets the default frequency index (3 = Supersonic)
