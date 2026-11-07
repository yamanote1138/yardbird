# YardBird — Architecture

## Overview

YardBird is a pure frontend SPA. The browser communicates directly with JMRI and (optionally) Home Assistant over WebSocket — there is no intermediate server.

```
┌─────────────────────────────────┐
│        Browser (Vue 3)          │
│                                 │
│  useConfig ← localStorage       │
│  (yardbird.yaml = import only)  │
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
    │  DCC-EX connection ──│──→ DCC-EX command station (DC locos)
    └──────────────────────┘
```

## Project Structure

```
src/
├── core/
│   ├── types.ts            — All shared TypeScript interfaces and types
│   ├── useConfig.ts        — localStorage manager: sanitize on load, needsSetup, save, updateWidgetConfig
│   └── useYamlConfig.ts    — Stateless YAML import/export (plugins: shape ↔ StoredConfig)
│
├── composables/            — App-level singletons
│   ├── useDisplayMode.ts   — Detects fullscreen / installed-app mode
│   ├── useEditMode.ts      — Edit mode toggle (module-scope ref)
│   └── useWidgetConfig.ts  — Widget config modal state (open/confirm/cancel)
│
├── widgets/                — Dashboard widget system
│   ├── registry.ts         — WidgetDefinition registry (type → component, size, plugin)
│   ├── WidgetFrame.vue     — Edit-mode wrapper (drag handle, ⚙ config, ✕ delete)
│   ├── WidgetPalette.vue   — Slide-in sidebar of draggable widget types (edit mode)
│   ├── WidgetConfigModal.vue — Modal shell + per-type config sub-forms
│   ├── widgetContext.ts    — WIDGET_ID_KEY (WidgetFrame provides its widget id)
│   ├── dragState.ts        — Widget type being dragged from the palette
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
│   │   ├── speedRamp.ts            — Throttle speed ramping (cancelable, timing per segment)
│   │   ├── useRecentLocos.ts       — Last 5 acquired locos (localStorage yardbird:recentLocos)
│   │   └── components/
│   │       ├── ThrottleWidget.vue, ThrottleCard.vue
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
│   ├── logger.ts           — setDebugMode(bool) gate for debug output
│   └── uuid.ts             — Widget/tab id generator
└── types/
    ├── jmri.ts
    └── homeAssistant.ts

public/
└── yardbird.yaml           — Blank template; Docker mounts a filled-in copy for one-click import
```

## Key Architectural Decisions

### Singleton State Pattern

All plugin composables (`useJmri`, `useHomeAssistant`) hold reactive state at **module scope**. Every call to `useJmri()` returns the same refs — one WebSocket connection, one roster, one throttle map. State persists across component mount/unmount cycles.

### Config Flow: localStorage only

`useConfig` is a pure localStorage manager. On load it reads `yardbird:config`, runs it through `sanitize()` (dropping unknown or old fields), and sets `needsSetup` if nothing valid is there. `needsSetup` shows the setup screen, where the user fills in connections by hand or imports YAML. `reset()` clears localStorage and goes back to the setup screen.

YAML is import/export only (`useYamlConfig.ts`). On mount, the setup screen fetches `/yardbird.yaml`; if it has a real host (Docker mounted one), it offers a one-click import.

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

`yardbird.yaml` uses the same data with a `plugins:` key in place of `connections:` and no `version`.

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
- `mode: 'float'` — widgets stay where they're dropped (Gridstack 14 replaced the old `float: true` option)
- `acceptWidgets: '.ybw-palette-item'` — must be the explicit class selector; `true` makes Gridstack use `.grid-stack-item` internally (still the case in v14)
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

### Throttle Ramping

- Ramp logic lives in `speedRamp.ts` (`createSpeedRamp`), separate from `ThrottleCard.vue`
- Tapping a speed step ramps to exactly that level at 2 s per step (distance rounded to whole steps, 100 ms ticks). A new tap cancels the running ramp and re-targets from the current speed
- Speed comes back from JMRI rounded to the decoder's 128 speed steps (30% → 0.3016), so the "already there" check and the segment colors allow 0.005 of slack
- Direction change while moving: ramp to 0, wait 500 ms, flip, wait 100 ms, ramp back. Any speed tap, brake, or E-stop during that cancels the flip
- E-stop sends speed 0 (jmri-client's `emergencyStop()` does the same) and cancels any ramp

### Runtime Loco Swap

- `WidgetFrame` provides its widget id via `WIDGET_ID_KEY`; `ThrottleWidget` injects it
- When no throttle is acquired, `ThrottleWidget` shows **Change loco**, which opens the normal throttle config modal and saves through `useConfig().updateWidgetConfig()`
- `ThrottleConfig` shows recent locos (recorded on successful acquire in `RosterCard`) and disables addresses used by other throttle widgets

### DC Locos (addresses 30–32)

- Controlled entirely through JMRI — typically on a DCC-EX connection, chosen via the throttle widget's command station
- `ThrottleCard` shows mutually exclusive PWM buttons (F29 Default / F30 High Freq / F31 Supersonic) instead of function buttons
- F31 (Supersonic) is set automatically on acquire
