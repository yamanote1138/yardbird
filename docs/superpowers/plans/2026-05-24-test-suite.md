# Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Vitest test suite covering the pure logic layer and JMRI integration (via jmri-client's built-in mock), plus CI workflows that gate the Docker publish behind passing tests.

**Architecture:** Vitest with jsdom environment. Composables are tested by importing them directly — Vue reactivity works without a mounted component. `useConfig` re-initialises on each test via `vi.resetModules()` + `vi.doMock()` to avoid stale singleton state. `useJmri` is reset by calling `disconnect()` in `afterEach`. jmri-client's `mock: { enabled: true }` option is used for JMRI tests — no real WebSocket connections or Vitest module mocking of jmri-client required.

**Tech Stack:** Vitest, @vue/test-utils, @vitest/coverage-v8, jsdom, GitHub Actions

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `vitest.config.ts` | Vitest config with jsdom env + alias replication |
| Create | `src/__tests__/utils/logger.test.ts` | Logger debug mode tests |
| Create | `src/__tests__/widgets/registry.test.ts` | Widget registry shape tests |
| Create | `src/__tests__/composables/useEditMode.test.ts` | Edit mode toggle tests |
| Create | `src/__tests__/composables/useWidgetConfig.test.ts` | Widget config modal state tests |
| Create | `src/__tests__/core/useConfig.test.ts` | Config persistence + init priority tests |
| Create | `src/__tests__/plugins/jmri/useJmri.test.ts` | JMRI integration tests via mock client |
| Modify | `package.json` | Add test/coverage scripts + devDependencies |
| Modify | `CLAUDE.md` | Add testing section + future component tests note |
| Create | `.github/workflows/ci.yml` | CI on push/PR |
| Modify | `.github/workflows/docker-build-push.yml` | Add test job + `needs: test` gate |

---

## Task 1: Install Vitest and configure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dev dependencies**

```bash
npm install --save-dev vitest @vue/test-utils @vitest/coverage-v8
```

Expected: packages added to `devDependencies` in `package.json`, `package-lock.json` updated.

- [ ] **Step 2: Add test scripts to package.json**

In the `"scripts"` block, add after `"type-check"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"coverage": "vitest run --coverage"
```

- [ ] **Step 3: Create vitest.config.ts**

Do NOT merge with `vite.config.ts` — Nuxt UI's Vite plugin is not test-safe. Replicate only the aliases we need.

Create `vitest.config.ts` at project root:

```typescript
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'jmri-client': fileURLToPath(new URL('./node_modules/jmri-client/dist/browser/jmri-client.js', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
  },
})
```

- [ ] **Step 4: Verify the config loads**

```bash
npm test
```

Expected output (no test files yet):

```
No test files found, exiting with code 0
```

If it errors on missing packages or config syntax, fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add Vitest test infrastructure"
```

---

## Task 2: Logger tests

**Files:**
- Read: `src/utils/logger.ts`
- Create: `src/__tests__/utils/logger.test.ts`

The logger uses `console.log` for debug output (not `console.debug`). `setDebugMode(false)` suppresses it; `warn` and `error` always fire.

- [ ] **Step 1: Write the tests**

Create `src/__tests__/utils/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, setDebugMode } from '@/utils/logger'

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setDebugMode(false)
  })

  it('suppresses debug output when debug mode is off', () => {
    setDebugMode(false)
    logger.debug('hello')
    expect(console.log).not.toHaveBeenCalled()
  })

  it('emits debug output when debug mode is on', () => {
    setDebugMode(true)
    logger.debug('hello')
    expect(console.log).toHaveBeenCalledWith('[DEBUG]', 'hello')
  })

  it('emits info output regardless of debug mode', () => {
    setDebugMode(false)
    logger.info('hello')
    expect(console.log).toHaveBeenCalledWith('[INFO]', 'hello')
  })

  it('emits warn regardless of debug mode', () => {
    setDebugMode(false)
    logger.warn('something')
    expect(console.warn).toHaveBeenCalledWith('[WARN]', 'something')
  })

  it('emits error regardless of debug mode', () => {
    setDebugMode(false)
    logger.error('boom')
    expect(console.error).toHaveBeenCalledWith('[ERROR]', 'boom')
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: 5 tests pass. Fix any failures before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/utils/logger.test.ts
git commit -m "Add logger tests"
```

---

## Task 3: Widget registry tests

**Files:**
- Read: `src/widgets/registry.ts`, `src/core/types.ts`
- Create: `src/__tests__/widgets/registry.test.ts`

The registry has 5 widget types: `jmri-power`, `jmri-throttle`, `jmri-turnout`, `jmri-light`, `ha-entity`. There is no `jmri-tram` widget type.

- [ ] **Step 1: Write the tests**

Create `src/__tests__/widgets/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { WIDGET_REGISTRY, getWidgetDef } from '@/widgets/registry'
import type { WidgetType } from '@/core/types'

const EXPECTED_TYPES: WidgetType[] = [
  'jmri-power',
  'jmri-throttle',
  'jmri-turnout',
  'jmri-light',
  'ha-entity',
]

describe('WIDGET_REGISTRY', () => {
  it('contains all expected widget types', () => {
    for (const type of EXPECTED_TYPES) {
      expect(WIDGET_REGISTRY[type], `missing type: ${type}`).toBeDefined()
    }
  })

  it('has no extra widget types beyond the expected set', () => {
    const registeredTypes = Object.keys(WIDGET_REGISTRY)
    expect(registeredTypes.sort()).toEqual([...EXPECTED_TYPES].sort())
  })

  for (const type of EXPECTED_TYPES) {
    describe(`${type}`, () => {
      it('has required fields', () => {
        const def = WIDGET_REGISTRY[type]
        expect(typeof def.name).toBe('string')
        expect(def.name.length).toBeGreaterThan(0)
        expect(typeof def.icon).toBe('string')
        expect(def.icon.length).toBeGreaterThan(0)
        expect(['jmri', 'homeassistant']).toContain(def.plugin)
        expect(typeof def.defaultSize.w).toBe('number')
        expect(typeof def.defaultSize.h).toBe('number')
        expect(typeof def.minSize.w).toBe('number')
        expect(typeof def.minSize.h).toBe('number')
        expect(typeof def.hasConfig).toBe('boolean')
        expect(typeof def.component).toBe('function')
      })

      it('has minSize no larger than defaultSize', () => {
        const def = WIDGET_REGISTRY[type]
        expect(def.minSize.w).toBeLessThanOrEqual(def.defaultSize.w)
        expect(def.minSize.h).toBeLessThanOrEqual(def.defaultSize.h)
      })
    })
  }
})

describe('getWidgetDef', () => {
  it('returns the correct definition for a known type', () => {
    const def = getWidgetDef('jmri-power')
    expect(def.type).toBe('jmri-power')
    expect(def.plugin).toBe('jmri')
  })

  it('returns undefined for an unknown type', () => {
    const def = getWidgetDef('not-a-widget' as WidgetType)
    expect(def).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: all registry tests pass. Fix any failures before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/widgets/registry.test.ts
git commit -m "Add widget registry tests"
```

---

## Task 4: useEditMode tests

**Files:**
- Read: `src/composables/useEditMode.ts`
- Create: `src/__tests__/composables/useEditMode.test.ts`

`editMode` is module-scope — reset with `exit()` in `afterEach`.

- [ ] **Step 1: Write the tests**

Create `src/__tests__/composables/useEditMode.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { useEditMode } from '@/composables/useEditMode'

describe('useEditMode', () => {
  afterEach(() => {
    useEditMode().exit()
  })

  it('starts as false', () => {
    const { editMode } = useEditMode()
    expect(editMode.value).toBe(false)
  })

  it('toggle sets editMode to true', () => {
    const { editMode, toggle } = useEditMode()
    toggle()
    expect(editMode.value).toBe(true)
  })

  it('toggle twice returns to false', () => {
    const { editMode, toggle } = useEditMode()
    toggle()
    toggle()
    expect(editMode.value).toBe(false)
  })

  it('exit sets editMode to false', () => {
    const { editMode, toggle, exit } = useEditMode()
    toggle()
    expect(editMode.value).toBe(true)
    exit()
    expect(editMode.value).toBe(false)
  })

  it('multiple calls to useEditMode share the same ref', () => {
    const a = useEditMode()
    const b = useEditMode()
    a.toggle()
    expect(b.editMode.value).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/composables/useEditMode.test.ts
git commit -m "Add useEditMode tests"
```

---

## Task 5: useWidgetConfig tests

**Files:**
- Read: `src/composables/useWidgetConfig.ts`
- Create: `src/__tests__/composables/useWidgetConfig.test.ts`

`pending` is module-scope. Reset by calling `cancel()` in `afterEach`.

- [ ] **Step 1: Write the tests**

Create `src/__tests__/composables/useWidgetConfig.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useWidgetConfig } from '@/composables/useWidgetConfig'
import type { WidgetInstance } from '@/core/types'

const MOCK_WIDGET: WidgetInstance = {
  id: 'test-id',
  type: 'jmri-turnout',
  grid: { x: 0, y: 0, w: 2, h: 1 },
  config: { address: 'LT1' },
}

describe('useWidgetConfig', () => {
  afterEach(() => {
    useWidgetConfig().cancel()
  })

  it('starts with no pending config', () => {
    const { pending } = useWidgetConfig()
    expect(pending.value).toBeNull()
  })

  describe('open', () => {
    it('sets pending to the provided opts', () => {
      const { open, pending } = useWidgetConfig()
      const onConfirm = vi.fn()
      const onCancel = vi.fn()
      open({ widgetId: 'w1', widgetType: 'jmri-turnout', config: {}, onConfirm, onCancel })
      expect(pending.value?.widgetId).toBe('w1')
      expect(pending.value?.widgetType).toBe('jmri-turnout')
    })
  })

  describe('openForNew', () => {
    it('sets widgetId to null and copies config', () => {
      const { openForNew, pending } = useWidgetConfig()
      openForNew(MOCK_WIDGET, vi.fn(), vi.fn())
      expect(pending.value?.widgetId).toBeNull()
      expect(pending.value?.widgetType).toBe('jmri-turnout')
      expect(pending.value?.config).toEqual({ address: 'LT1' })
    })

    it('calls onConfirm with merged widget on confirm', () => {
      const { openForNew, confirm } = useWidgetConfig()
      const onConfirm = vi.fn()
      openForNew(MOCK_WIDGET, onConfirm, vi.fn())
      confirm({ address: 'LT2' })
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test-id', config: { address: 'LT2' } })
      )
    })

    it('calls onCancel and clears pending on cancel', () => {
      const { openForNew, cancel, pending } = useWidgetConfig()
      const onCancel = vi.fn()
      openForNew(MOCK_WIDGET, vi.fn(), onCancel)
      cancel()
      expect(onCancel).toHaveBeenCalled()
      expect(pending.value).toBeNull()
    })
  })

  describe('openForEdit', () => {
    it('sets widgetId and config for an existing widget', () => {
      const { openForEdit, pending } = useWidgetConfig()
      openForEdit('existing-id', 'jmri-light', { address: 'IL1' }, vi.fn())
      expect(pending.value?.widgetId).toBe('existing-id')
      expect(pending.value?.config).toEqual({ address: 'IL1' })
    })
  })

  describe('confirm', () => {
    it('calls onConfirm with new config and clears pending', () => {
      const { open, confirm, pending } = useWidgetConfig()
      const onConfirm = vi.fn()
      open({ widgetId: 'w1', widgetType: 'jmri-light', config: {}, onConfirm, onCancel: vi.fn() })
      confirm({ address: 'IL2' })
      expect(onConfirm).toHaveBeenCalledWith({ address: 'IL2' })
      expect(pending.value).toBeNull()
    })
  })

  describe('cancel', () => {
    it('calls onCancel and clears pending', () => {
      const { open, cancel, pending } = useWidgetConfig()
      const onCancel = vi.fn()
      open({ widgetId: 'w1', widgetType: 'jmri-light', config: {}, onConfirm: vi.fn(), onCancel })
      cancel()
      expect(onCancel).toHaveBeenCalled()
      expect(pending.value).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/composables/useWidgetConfig.test.ts
git commit -m "Add useWidgetConfig tests"
```

---

## Task 6: useConfig tests

**Files:**
- Read: `src/core/useConfig.ts`, `src/core/useLayout.ts`
- Create: `src/__tests__/core/useConfig.test.ts`

`useConfig` calls `init()` at module scope. `init()` calls `useLayout()`. To prevent real YAML fetches in tests, mock `@/core/useLayout` with `vi.doMock()` (not hoisted) before each dynamic import of the module. `vi.resetModules()` ensures a fresh singleton per test.

The `save()` function does a shallow spread of `StoredConfig` keys — it does not recursively deep-merge nested objects.

- [ ] **Step 1: Write the tests**

Create `src/__tests__/core/useConfig.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, waitFor } from 'vitest'
import { ref } from 'vue'

const STORAGE_KEY = 'yardbird:config'

const MOCK_LAYOUT = {
  loading: ref(false),
  debug: ref(false),
  tabs: ref([{ id: 'yaml-tab', name: 'YAML Tab', icon: 'i-mdi-train' }]),
  plugins: ref({ jmri: { host: 'localhost', port: 12080 } }),
}

// Fresh module + mock before each test
async function freshConfig() {
  vi.resetModules()
  vi.doMock('@/core/useLayout', () => ({ useLayout: () => MOCK_LAYOUT }))
  const { useConfig } = await import('@/core/useConfig')
  const cfg = useConfig()
  await waitFor(() => expect(cfg.loading.value).toBe(false))
  return cfg
}

describe('useConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('init — priority order', () => {
    it('loads from localStorage when valid config exists', async () => {
      const stored = {
        version: 1,
        connections: {},
        tabs: [{ id: 'stored-tab', name: 'Stored Tab', icon: 'i-mdi-home', widgets: [] }],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

      const { tabs } = await freshConfig()
      expect(tabs.value[0].id).toBe('stored-tab')
    })

    it('falls back to YAML layout when localStorage is empty', async () => {
      const { tabs } = await freshConfig()
      expect(tabs.value[0].id).toBe('yaml-tab')
    })

    it('ignores localStorage entry with wrong version', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, connections: {}, tabs: [] }))
      const { tabs } = await freshConfig()
      // Falls back to YAML mock which has yaml-tab
      expect(tabs.value[0].id).toBe('yaml-tab')
    })

    it('ignores invalid JSON in localStorage', async () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json')
      const { tabs } = await freshConfig()
      expect(tabs.value[0].id).toBe('yaml-tab')
    })

    it('migrates YAML layout tabs with empty widgets arrays', async () => {
      const { tabs } = await freshConfig()
      expect(tabs.value[0].widgets).toEqual([])
    })

    it('persists migrated config to localStorage after YAML fallback', async () => {
      await freshConfig()
      const raw = localStorage.getItem(STORAGE_KEY)
      expect(raw).not.toBeNull()
      const stored = JSON.parse(raw!)
      expect(stored.version).toBe(1)
      expect(stored.tabs[0].id).toBe('yaml-tab')
    })
  })

  describe('save', () => {
    it('merges top-level fields and persists to localStorage', async () => {
      const { save, tabs } = await freshConfig()
      save({ tabs: [{ id: 'new-tab', name: 'New', icon: 'i-mdi-train', widgets: [] }] })
      expect(tabs.value[0].id).toBe('new-tab')
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.tabs[0].id).toBe('new-tab')
    })

    it('preserves unmodified top-level fields', async () => {
      const { save, debug } = await freshConfig()
      save({ debug: true })
      expect(debug.value).toBe(true)
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.tabs[0].id).toBe('yaml-tab') // tabs untouched
    })
  })

  describe('saveTabs', () => {
    it('replaces tabs and persists', async () => {
      const { saveTabs, tabs } = await freshConfig()
      saveTabs([{ id: 'x', name: 'X', icon: 'i-mdi-home', widgets: [] }])
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].id).toBe('x')
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.tabs[0].id).toBe('x')
    })
  })

  describe('saveConnections', () => {
    it('replaces connections and persists', async () => {
      const { saveConnections, connections } = await freshConfig()
      saveConnections({ jmri: { host: '192.168.1.1', port: 12080 } })
      expect(connections.value.jmri?.host).toBe('192.168.1.1')
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.connections.jmri.host).toBe('192.168.1.1')
    })
  })

  describe('reset', () => {
    it('removes yardbird:config from localStorage', async () => {
      const { reset } = await freshConfig()
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
      reset()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: all tests pass. The `freshConfig()` helper resets modules before each test, so singleton state never bleeds between cases.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/core/useConfig.test.ts
git commit -m "Add useConfig tests"
```

---

## Task 7: useJmri integration tests

**Files:**
- Read: `src/plugins/jmri/index.ts`
- Create: `src/__tests__/plugins/jmri/useJmri.test.ts`

`useJmri` is a module-scope singleton. Call `disconnect()` in `afterEach` — it sets `connectionState` back to DISCONNECTED and clears all maps.

`initialize(settings)` creates the jmri-client and calls `connect()` internally. Connection is asynchronous; use `waitFor` to poll for `CONNECTED`.

**Known limitation:** `fetchRoster()` fails with mock mode because jmri-client's mock data returns entries in a different format than the real JMRI server (tracked as issue #21 on jmri-client). Roster and tram-roster tests use `acquireThrottle()` instead, which creates synthetic roster entries — this still validates the tram-filtering logic in `locoRoster`.

- [ ] **Step 1: Write the tests**

Create `src/__tests__/plugins/jmri/useJmri.test.ts`:

```typescript
import { describe, it, expect, afterEach, waitFor } from 'vitest'
import { useJmri, ConnectionState } from '@/plugins/jmri'
import { PowerState, LightState } from 'jmri-client'

const MOCK_SETTINGS = {
  host: 'localhost',
  port: 12080,
  protocol: 'ws' as const,
  mockEnabled: true,
  mockDelay: 0,
}

async function connectMock() {
  const jmri = useJmri()
  jmri.initialize(MOCK_SETTINGS)
  await waitFor(() => {
    expect(jmri.connectionState.value).toBe(ConnectionState.CONNECTED)
  }, { timeout: 3000 })
  return jmri
}

describe('useJmri', () => {
  afterEach(() => {
    useJmri().disconnect()
  })

  describe('connection', () => {
    it('starts as DISCONNECTED', () => {
      const { connectionState } = useJmri()
      expect(connectionState.value).toBe(ConnectionState.DISCONNECTED)
    })

    it('transitions to CONNECTED after initialize with mock', async () => {
      const { connectionState } = await connectMock()
      expect(connectionState.value).toBe(ConnectionState.CONNECTED)
    })

    it('populates railroadName from hello response', async () => {
      const { railroadName } = await connectMock()
      expect(railroadName.value).toBe('Demo Railroad')
    })

    it('populates jmriVersion from hello response', async () => {
      const { jmriVersion } = await connectMock()
      expect(jmriVersion.value).toBe('5.9.2')
    })

    it('transitions to DISCONNECTED after disconnect', async () => {
      const { connectionState, disconnect } = await connectMock()
      disconnect()
      expect(connectionState.value).toBe(ConnectionState.DISCONNECTED)
    })

    it('clears all state on disconnect', async () => {
      const { disconnect, jmriState, acquireThrottle } = await connectMock()
      await acquireThrottle(3)
      disconnect()
      expect(jmriState.value.throttles.size).toBe(0)
      expect(jmriState.value.lights.size).toBe(0)
      expect(jmriState.value.turnouts.size).toBe(0)
    })
  })

  describe('power', () => {
    it('sets power to ON', async () => {
      const { setPower, jmriState } = await connectMock()
      await setPower('on')
      expect(jmriState.value.power).toBe(PowerState.ON)
    })

    it('sets power to OFF', async () => {
      const { setPower, jmriState } = await connectMock()
      await setPower('on')
      await setPower('off')
      expect(jmriState.value.power).toBe(PowerState.OFF)
    })
  })

  describe('lights', () => {
    it('populates lights automatically on connect', async () => {
      const { lights } = await connectMock()
      await waitFor(() => {
        expect(lights.value.length).toBeGreaterThan(0)
      }, { timeout: 3000 })
    })

    it('toggles a light from OFF to ON', async () => {
      const { lights, toggleLight, jmriState } = await connectMock()
      // Wait for lights to be fetched
      await waitFor(() => expect(lights.value.length).toBeGreaterThan(0), { timeout: 3000 })
      // IL1 starts OFF in mock data
      const il1Before = jmriState.value.lights.get('IL1')
      expect(il1Before?.state).toBe(LightState.OFF)
      await toggleLight('IL1')
      await waitFor(() => {
        expect(jmriState.value.lights.get('IL1')?.state).toBe(LightState.ON)
      }, { timeout: 3000 })
    })
  })

  describe('turnouts', () => {
    it('populates turnouts automatically on connect', async () => {
      const { turnouts } = await connectMock()
      await waitFor(() => {
        expect(turnouts.value.length).toBeGreaterThan(0)
      }, { timeout: 3000 })
    })

    it('throws a turnout', async () => {
      const { turnouts, throwTurnout, jmriState } = await connectMock()
      await waitFor(() => expect(turnouts.value.length).toBeGreaterThan(0), { timeout: 3000 })
      // LT1 starts CLOSED (state 2) in mock data
      await throwTurnout('LT1')
      await waitFor(() => {
        const t = jmriState.value.turnouts.get('LT1')
        expect(t?.state).toBe(4) // TurnoutState.THROWN
      }, { timeout: 3000 })
    })
  })

  describe('throttles', () => {
    it('adds a throttle to state on acquire', async () => {
      const { acquireThrottle, throttles } = await connectMock()
      await acquireThrottle(3)
      expect(throttles.value).toHaveLength(1)
      expect(throttles.value[0].address).toBe(3)
    })

    it('removes throttle from state on release', async () => {
      const { acquireThrottle, releaseThrottle, throttles } = await connectMock()
      await acquireThrottle(3)
      expect(throttles.value).toHaveLength(1)
      await releaseThrottle(3)
      expect(throttles.value).toHaveLength(0)
    })

    it('creates a synthetic roster entry for unknown addresses', async () => {
      const { acquireThrottle, jmriState } = await connectMock()
      await acquireThrottle(99)
      expect(jmriState.value.roster.has(99)).toBe(true)
      expect(jmriState.value.roster.get(99)?.name).toBe('Address 99')
    })
  })

  describe('locoRoster tram filtering', () => {
    it('excludes tram addresses 30 and 31 from locoRoster', async () => {
      const { acquireThrottle, locoRoster } = await connectMock()
      // acquireThrottle creates synthetic roster entries for unknown addresses
      await acquireThrottle(30)  // tram address
      await acquireThrottle(31)  // tram address
      await acquireThrottle(3)   // regular loco
      expect(locoRoster.value.some(e => e.address === 30)).toBe(false)
      expect(locoRoster.value.some(e => e.address === 31)).toBe(false)
      expect(locoRoster.value.some(e => e.address === 3)).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: all tests pass. If turnout or light event tests are timing out, increase the `timeout` values. Fix any failures before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/plugins/jmri/useJmri.test.ts
git commit -m "Add useJmri integration tests"
```

---

## Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Two additions: a **Testing** section under Development Conventions, and a **Future Considerations** note about component tests. Also correct the spec doc's erroneous mention of `jmri-tram` as a WidgetType.

- [ ] **Step 1: Add Testing section to CLAUDE.md**

In the **Development Conventions** section, after the existing "Component Organisation" subsection, add:

```markdown
### Testing

- Framework: **Vitest** with jsdom environment
- Run tests: `npm test` — run once; `npm run test:watch` — watch mode; `npm run coverage` — with v8 coverage
- `vitest.config.ts` at project root replicates `@` and `jmri-client` aliases from `vite.config.ts` — do NOT merge the two configs; Nuxt UI's Vite plugin is not test-safe
- **Singleton reset pattern:** composables with module-scope state need cleanup between tests:
  - `useEditMode` / `useWidgetConfig`: call `exit()` / `cancel()` in `afterEach`
  - `useJmri`: call `disconnect()` in `afterEach`
  - `useConfig`: use `vi.resetModules()` + `vi.doMock('@/core/useLayout', ...)` + dynamic `await import('@/core/useConfig')` — the module calls `init()` on load and must be freshly imported per test
- **JMRI tests use jmri-client's built-in mock mode** — pass `mockEnabled: true` to `initialize()`. No real WebSocket needed. No Vitest module mocking of jmri-client required.
- Known limitation: `fetchRoster()` does not work correctly in mock mode (jmri-client issue #21 — mock data format mismatch). Roster tests use `acquireThrottle()` instead, which creates synthetic roster entries.

### Future: Component Tests

`@vue/test-utils` is already installed. Add component tests when the UI has stabilised and components stop changing frequently.

Priority targets when that time comes:
- `WidgetFrame.vue` — edit-mode overlay logic (drag handle, config button, delete)
- `WidgetPalette.vue` — palette item rendering and drag setup
- `ConnectionSetup.vue` — form field rendering and validation

Test behaviour from the user's perspective, not implementation details. Mount with `@vue/test-utils`' `mount()` and assert on emitted events and rendered output — not on internal refs or method calls.
```

- [ ] **Step 2: Run type-check to make sure nothing broke**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Add testing section to CLAUDE.md"
```

---

## Task 9: Add CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

Runs on every push to `main` and on all pull requests. This gives fast feedback for Dependabot PRs automatically.

- [ ] **Step 1: Create ci.yml**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run type-check

      - name: Test
        run: npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI workflow"
```

---

## Task 10: Gate Docker publish behind tests

**Files:**
- Modify: `.github/workflows/docker-build-push.yml`

Add a `test` job that mirrors CI. The existing `docker` job gets `needs: test` — the image is never pushed if tests or type-check fail. The `v*` tag trigger is unchanged.

- [ ] **Step 1: Read the current workflow**

Read `.github/workflows/docker-build-push.yml` to confirm the current structure before editing.

- [ ] **Step 2: Add the test job and needs gate**

Replace the contents of `.github/workflows/docker-build-push.yml` with:

```yaml
name: Build and Push Docker Image

on:
  push:
    tags:
      - 'v*'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run type-check

      - name: Test
        run: npm test

  docker:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: yamanote1138/yardbird
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 3: Run all tests locally one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/docker-build-push.yml
git commit -m "Gate Docker publish behind passing tests"
git push
```

---

## Self-Review

**Spec coverage check:**
- ✅ Vitest + jsdom + @vue/test-utils + @vitest/coverage-v8 → Task 1
- ✅ `useConfig` tests (init priority, save, saveTabs, saveConnections, reset) → Task 6
- ✅ `useEditMode` tests → Task 4
- ✅ `useWidgetConfig` tests → Task 5
- ✅ `registry.ts` tests → Task 3
- ✅ `logger.ts` tests → Task 2
- ✅ `useJmri` mock integration (connect, hello, power, lights, turnouts, throttles, tram filtering) → Task 7
- ✅ Singleton reset pattern documented and implemented in every test file
- ✅ CLAUDE.md: testing section + future component tests → Task 8
- ✅ `ci.yml` on push/PR → Task 9
- ✅ Docker publish gated behind `needs: test` → Task 10
- ✅ `jmri-tram` corrected — not a WidgetType, not in registry

**Spec error noted:** The design spec incorrectly listed `jmri-tram` as a WidgetType. The actual `WidgetType` union in `src/core/types.ts` contains only: `jmri-power`, `jmri-throttle`, `jmri-turnout`, `jmri-light`, `ha-entity`. Tram control uses address-based throttle acquisition, not a distinct widget type. The registry tests and useJmri tests reflect the correct set.

**Placeholder scan:** No TBDs, no "implement later", no vague instructions. Every step has exact commands or complete code blocks.

**Type consistency:** `ConnectionState` imported from `@/plugins/jmri`; `PowerState`, `LightState` from `jmri-client`; `WidgetType`, `WidgetInstance` from `@/core/types`. All consistent across tasks.
