# Vue Component Test Infrastructure — Design

**Date:** 2026-05-25
**Status:** Approved

## Goal

Set up `@vue/test-utils` so all Vue components (excluding TabCanvas) can be mounted and tested in the existing Vitest/jsdom environment. Write full component test coverage: ~65 tests across 19 components.

## Context

- `@vue/test-utils ^2.4.10` is already installed
- Vitest config currently uses only `@vitejs/plugin-vue` — Nuxt UI components are not auto-imported in tests
- 8 Nuxt UI components are used: `UButton`, `UIcon`, `UInput`, `UCheckbox`, `UModal`, `UCard`, `UAlert`, `UToaster`
- Tailwind CSS 4 is pure CSS — no JS impact in jsdom; no stub needed
- `TabCanvas.vue` is excluded — it depends on Gridstack DOM layout measurements that jsdom cannot provide
- `App.vue` is excluded — it is the root orchestrator; its logic is covered by composable tests

## Approach

Option C: global stubs via `setupFiles` + `mountWithUI` test utility wrapper.

Rejected:
- Option A (add `@nuxt/ui/vite` to vitest config): imports `#build/app.config` (Nuxt virtual module), not available in Vitest
- Option B (stubs only in setupFiles, no wrapper): inflexible for per-test overrides and JMRI mock init

## Infrastructure

### Files changed

| File | Change |
|---|---|
| `vitest.config.ts` | Add `setupFiles: ['./src/__tests__/setup.ts']` |
| `src/__tests__/setup.ts` | New — configure global Nuxt UI stubs + suppress unknown-component warnings |
| `src/__tests__/test-utils.ts` | New — export `mountWithUI` and `connectMockJmri` |

### `setup.ts`

Runs before every test file via `setupFiles`. Imports `config` from `@vue/test-utils` and registers stub components for all 8 Nuxt UI components via `config.global.stubs`. Sets `config.global.config.warnHandler` to suppress "Failed to resolve component" noise.

### Nuxt UI stub designs

| Component | Stub | Notes |
|---|---|---|
| `UButton` | `<button v-bind="$attrs" @click="$emit('click')"><slot name="leading" /><slot /></button>` | Click passthrough, named leading slot |
| `UIcon` | `<span :data-icon="name" />` | `name` prop as `data-icon` attribute — lets tests use `find('[data-icon="i-mdi-check"]')` |
| `UInput` | `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" v-bind="$attrs" />` | Full v-model passthrough |
| `UCheckbox` | `<input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" v-bind="$attrs" />` | Full v-model passthrough |
| `UModal` | `<div v-if="modelValue || open"><slot /></div>` | Conditionally renders slot |
| `UCard` | `<div><slot name="header" /><slot /><slot name="footer" /></div>` | All slots passthrough |
| `UAlert` | `<div role="alert"><slot /></div>` | Slot passthrough |
| `UToaster` | `<div />` | Empty — nothing to assert |

### `test-utils.ts`

Exports:
- `mountWithUI(component, options?)` — wraps `mount` from `@vue/test-utils`; merges per-test stubs on top of globals
- `connectMockJmri(settings?)` — calls `useJmri().initialize({ mockEnabled: true, mockDelay: 0, ... })` then `vi.waitFor` until `CONNECTED`; returns the jmri instance. Mirrors the existing pattern in `useJmri.test.ts`.
- Re-exports `mount`, `VueWrapper` and other types from `@vue/test-utils`

### JMRI mock cleanup (component tests that use JMRI)

```typescript
afterEach(async () => {
  useJmri().disconnect()
  await new Promise(resolve => setTimeout(resolve, 50))
})
```

Same pattern as `useJmri.test.ts`.

## Test File Structure

Mirrors `src/` under `src/__tests__/`:

```
src/__tests__/
├── setup.ts                          (new — global config)
├── test-utils.ts                     (new — mountWithUI, connectMockJmri)
├── components/
│   ├── ConnectionSetup.test.ts       (new)
│   ├── HeaderButtons.test.ts         (new)
│   └── TabManager.test.ts            (new)
├── plugins/
│   ├── jmri/
│   │   ├── LightWidget.test.ts       (new)
│   │   ├── LocomotiveHeader.test.ts  (new)
│   │   ├── PowerWidget.test.ts       (new)
│   │   ├── RosterCard.test.ts        (new)
│   │   ├── ThrottleCard.test.ts      (new)
│   │   ├── ThrottleWidget.test.ts    (new)
│   │   └── TurnoutWidget.test.ts     (new)
│   └── homeassistant/
│       └── HaEntityWidget.test.ts    (new)
└── widgets/
    ├── config/
    │   ├── HaEntityConfig.test.ts    (new)
    │   ├── LightConfig.test.ts       (new)
    │   ├── PowerConfig.test.ts       (new)
    │   ├── ThrottleConfig.test.ts    (new)
    │   └── TurnoutConfig.test.ts     (new)
    ├── WidgetConfigModal.test.ts     (new)
    ├── WidgetFrame.test.ts           (new)
    └── WidgetPalette.test.ts         (new)
```

## Coverage Per Component

### Config sub-forms (ThrottleConfig, TurnoutConfig, LightConfig, PowerConfig, HaEntityConfig)

Each: renders correct input fields; pre-populates from `config` prop; emits `update` with new value on change; shows entity list from JMRI when entities are loaded; falls back to manual text input when none are.

### Simple JMRI widgets (TurnoutWidget, LightWidget, PowerWidget)

Each: renders button with correct color per entity state; button is disabled when `isConnected` is false; clicking calls the correct JMRI action (e.g. `toggleTurnout`); shows "not found" message when entity isn't in JMRI state.

### WidgetFrame

Edit-mode overlay (drag handle, configure button, delete button) visible in edit mode; overlay absent in run mode; `configure` emit fires on config button click; `remove` emit fires on delete button click.

### WidgetPalette

Renders when edit mode is active; each widget type from the registry appears as a draggable item.

### HeaderButtons

Power button shows correct icon per power state; stop-all disabled when no throttles; edit mode toggle shows save icon when active; all controls disabled when not connected.

### TabManager

Renders correct tab labels from config; add-tab button present; active tab highlighted.

### RosterCard

Renders entry name, road, number; acquire button disabled when power is off; shows "Acquiring…" during acquire.

### ThrottleCard

Speed display updates on slider input; direction buttons call correct action; emergency stop calls the correct action; release button resets state.

### ThrottleWidget

Renders roster entries; clicking a card triggers acquire.

### LocomotiveHeader

Renders name, road, number from props.

### WidgetConfigModal

Hidden when no pending config; renders correct sub-form for each widget type.

### ConnectionSetup

`fetch` stubbed for Docker banner. Renders JMRI host/port fields; shows error when `setError` called; connect button emits `connect`; reset button calls config reset.

### HaEntityWidget

Renders entity state; clicking calls the HA action.

## Estimated Test Count

~65 tests across 19 new test files + 2 infrastructure files.

## What Is Explicitly Excluded

- `TabCanvas.vue` — Gridstack requires real DOM layout; jsdom cannot provide it
- `App.vue` — root orchestrator; logic covered by composable tests
