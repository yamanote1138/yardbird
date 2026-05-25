# Test Suite Design

**Date:** 2026-05-24
**Scope:** Vitest unit + JMRI integration tests, CI pipeline

## Goal

Provide a regression safety net for ongoing development and dependency upgrades. Tests must run fast, be robust against UI refactors, and directly protect against breaking changes in `jmri-client`.

## Approach

Approach B: pure logic layer tests + JMRI integration tests using jmri-client's built-in mock mode. Component tests are deferred (see Future Considerations in CLAUDE.md).

---

## Framework & Tooling

| Package | Purpose |
|---|---|
| `vitest` | Test runner, assertions, module mocking |
| `@vue/test-utils` | Vue reactivity support in tests; ready for component tests later |
| `jsdom` | DOM + localStorage simulation |
| `@vitest/coverage-v8` | Coverage reports |

`vitest.config.ts` at project root extends the existing Vite config so the `jmri-client` browser alias (`node_modules/jmri-client/dist/browser/jmri-client.js`) resolves identically in tests and production.

npm scripts added:
- `npm test` — run all tests
- `npm run test:watch` — watch mode
- `npm run coverage` — coverage report

---

## Test Scope

### Pure Logic (no mocking)

**`useConfig`** (`src/core/useConfig.ts`)
- `loadFromStorage` — returns null on empty localStorage, null on invalid JSON, null on version mismatch, returns parsed config on valid data
- `saveToStorage` — writes to localStorage, handles write errors gracefully
- `migrateFromLayout` — converts YAML-sourced layout into correct `StoredConfig` shape with empty widget arrays
- `save(patch)` — deep-merges partial update into existing config, persists to localStorage
- `reset()` — clears `yardbird:config` from localStorage
- `init()` priority — localStorage → YAML fallback → DEFAULT_CONFIG

**`useEditMode`** (`src/composables/useEditMode.ts`)
- Toggle from false → true → false
- Module-scope singleton: two calls to `useEditMode()` share the same ref

**`useWidgetConfig`** (`src/composables/useWidgetConfig.ts`)
- `open()` sets pending widget and resolves the promise on `confirm()`
- `open()` resolves null on `cancel()`
- State is idle after confirm or cancel

**`registry.ts`** (`src/widgets/registry.ts`)
- All expected widget types present: `jmri-power`, `jmri-throttle`, `jmri-turnout`, `jmri-light`, `jmri-tram`, `ha-entity`
- Each entry has: `label`, `icon`, `defaultSize`, `minSize`, `component`, `plugin`
- `getWidget(type)` returns correct definition; unknown type returns undefined

**`logger.ts`** (`src/utils/logger.ts`)
- `setDebugMode(false)` suppresses `logger.debug` calls
- `setDebugMode(true)` enables them
- `logger.warn` and `logger.error` always fire regardless of debug mode

---

### JMRI Integration (jmri-client built-in mock)

**`useJmri`** (`src/plugins/jmri/index.ts`)

Tests call `connect()` with `mockEnabled: true`. jmri-client's `MockResponseManager` handles all WebSocket responses internally — no real network, no Vitest module mocking of jmri-client required.

**Connection**
- `connectionState` transitions: DISCONNECTED → CONNECTED on successful connect
- `railroadName` and `jmriVersion` populated from hello response
- `connectionState` → DISCONNECTED on `disconnect()`

**Power**
- `powerOn()` → power state becomes ON
- `powerOff()` → power state becomes OFF
- `powerByPrefix` map updated correctly for default (empty-string) prefix

**Roster**
- `getRoster()` populates `jmriState.roster`
- Tram addresses (30, 31) are excluded from the roster map
- Non-tram entries are present

**Throttles**
- `acquireThrottle(address)` → throttle appears in `jmriState.throttles`
- `setSpeed` / `setDirection` / `setFunction` update throttle state
- `releaseThrottle(address)` → throttle removed from map

**Turnouts**
- `listTurnouts()` → `jmriState.turnouts` populated
- `throwTurnout(name)` / `closeTurnout(name)` → state updated

**Lights**
- `listLights()` → `jmriState.lights` populated
- `turnOnLight(name)` / `turnOffLight(name)` → state updated

---

## Singleton State Management

All composables use module-scope refs. Tests must not bleed state between cases.

Strategy:
- `beforeEach`: `localStorage.clear()` for config tests
- `afterEach`: call `disconnect()` on useJmri to clean up the mock client
- For tests that require a completely fresh module instance (e.g. verifying init priority): use `vi.resetModules()` + dynamic `import()` inside the test

---

## File Layout

```
src/
└── __tests__/
    ├── core/
    │   └── useConfig.test.ts
    ├── composables/
    │   ├── useEditMode.test.ts
    │   └── useWidgetConfig.test.ts
    ├── widgets/
    │   └── registry.test.ts
    ├── utils/
    │   └── logger.test.ts
    └── plugins/
        └── jmri/
            └── useJmri.test.ts
```

---

## CI Workflows

### `ci.yml` (new)

Triggers: push to `main`, all pull requests.

```
checkout → setup Node 22 → npm ci → type-check → test
```

Gives fast feedback on every PR — especially useful for Dependabot PRs, which will be automatically validated before review.

### `docker-build-push.yml` (updated)

Triggers: push of `v*` tags only (unchanged).

Adds a `test` job that runs the same steps as `ci.yml`. The existing `docker` job gets `needs: test` — the image is never pushed if tests or type-check fail.

```
test: checkout → Node 22 → npm ci → type-check → test
docker: [needs: test] → buildx → DockerHub login → push
```

---

## CLAUDE.md Changes

### New: Testing section
- Framework, how to run tests, coverage
- Singleton reset pattern (`vi.resetModules()` + dynamic import)
- Note that jmri-client mock mode (`mockEnabled: true`) is used for JMRI tests — no real WebSocket required

### New: Future Considerations — Component Tests
- `@vue/test-utils` already installed; no new deps needed
- Add when UI stabilises and components stop changing frequently
- Priority targets: `WidgetFrame` (edit-mode overlay logic), `WidgetPalette` (drag setup), `ConnectionSetup` (form field validation)
- Avoid testing implementation details — test behaviour from the user's perspective
