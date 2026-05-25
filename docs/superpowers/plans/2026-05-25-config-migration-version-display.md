# Config Migration & Version Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill new YAML connection fields into existing localStorage configs on load, and show the app version on the splash screen.

**Architecture:** Two independent changes. (1) `useConfig.init()` waits for YAML in all cases and merges YAML connection settings as defaults under any stored values — new fields appear automatically, user overrides are preserved. (2) `ConnectionSetup.vue` imports `version` from `package.json` and renders it between the title and subtitle.

**Tech Stack:** Vue 3, Vitest, TypeScript. `resolveJsonModule` already enabled via `@vue/tsconfig` — no config changes needed.

---

## Files

- **Modify:** `src/core/useConfig.ts` — add `backfillConnections()` helper, update `init()`
- **Modify:** `src/components/ConnectionSetup.vue` — add version string
- **Modify:** `src//__tests__/core/useConfig.test.ts` — add backfill test cases

---

### Task 1: YAML backfill in useConfig.ts

**Files:**
- Modify: `src/core/useConfig.ts`
- Test: `src/__tests__/core/useConfig.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new `describe('yaml backfill')` block inside `describe('useConfig')` in `src/__tests__/core/useConfig.test.ts`. Insert it after the existing `describe('init — priority order')` block.

```typescript
describe('yaml backfill', () => {
  it('backfills missing jmri fields from YAML into stored config', async () => {
    const stored = {
      version: 1,
      connections: { jmri: { host: 'myhost', port: 12080 } }, // no rosterGroups
      tabs: [{ id: 'stored-tab', name: 'Stored', icon: 'i-mdi-home', widgets: [] }],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    vi.resetModules()
    vi.doMock('@/core/useLayout', () => ({
      useLayout: () => ({
        loading: ref(false),
        debug: ref(false),
        tabs: ref([]),
        plugins: ref({
          jmri: { host: 'localhost', port: 12080, rosterGroups: [{ name: 'Trams', commandStation: 'D' }] },
        }),
      }),
    }))
    const { useConfig } = await import('@/core/useConfig')
    const cfg = useConfig()
    await vi.waitFor(() => expect(cfg.loading.value).toBe(false), { timeout: 3000 })

    expect(cfg.jmri.value?.rosterGroups).toEqual([{ name: 'Trams', commandStation: 'D' }])
    expect(cfg.jmri.value?.host).toBe('myhost') // stored value wins
  })

  it('stored jmri values override YAML defaults', async () => {
    const stored = {
      version: 1,
      connections: { jmri: { host: 'override-host', port: 9999 } },
      tabs: [],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    const cfg = await freshConfig()
    // freshConfig uses MOCK_LAYOUT with host: 'localhost', port: 12080
    expect(cfg.jmri.value?.host).toBe('override-host')
    expect(cfg.jmri.value?.port).toBe(9999)
  })

  it('preserves homeassistant config from localStorage when YAML has none', async () => {
    const stored = {
      version: 1,
      connections: {
        jmri: { host: 'localhost', port: 12080 },
        homeassistant: { url: 'http://ha.local:8123', token: 'abc' },
      },
      tabs: [],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    const cfg = await freshConfig() // MOCK_LAYOUT has no homeassistant
    expect(cfg.homeassistant.value?.url).toBe('http://ha.local:8123')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "backfill|FAIL|PASS|✓|✗|×"
```

Expected: three new tests FAIL (backfillConnections not implemented yet).

- [ ] **Step 3: Implement backfillConnections and update init()**

Replace the entire `src/core/useConfig.ts` with:

```typescript
import { ref, computed } from 'vue'
import { useLayout } from './useLayout'
import { logger } from '@/utils/logger'
import type { StoredConfig, TabConfig, JmriPluginConfig, HomeAssistantPluginConfig } from './types'

const STORAGE_KEY = 'yardbird:config'

const config = ref<StoredConfig | null>(null)
const loading = ref(true)

const layout = useLayout()

function migrateFromLayout(layoutConfig: ReturnType<typeof useLayout>): StoredConfig {
  const plugins = layoutConfig.plugins.value
  const tabs = layoutConfig.tabs.value

  return {
    version: 1,
    debug: layoutConfig.debug.value,
    connections: {
      jmri: plugins.jmri,
      homeassistant: plugins.homeassistant,
    },
    tabs: tabs.map(t => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      widgets: [],
    })),
  }
}

// Merge YAML connection settings as defaults under stored values.
// New YAML fields appear automatically; user-saved values are preserved.
// Does NOT save back to localStorage — backfill is a read-time operation.
function backfillConnections(
  stored: StoredConfig['connections'],
  yamlPlugins: ReturnType<typeof useLayout>['plugins']['value']
): StoredConfig['connections'] {
  const jmri = { ...yamlPlugins.jmri, ...stored.jmri } as JmriPluginConfig
  const haBase = yamlPlugins.homeassistant
  const haStored = stored.homeassistant
  const homeassistant =
    haBase !== undefined || haStored !== undefined
      ? ({ ...haBase, ...haStored } as HomeAssistantPluginConfig)
      : undefined
  return { jmri, homeassistant }
}

function loadFromStorage(): StoredConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredConfig
    if (parsed.version !== 1) {
      logger.warn('[Config] Unknown config version in localStorage, ignoring')
      return null
    }
    return parsed
  } catch (e) {
    logger.warn('[Config] Failed to parse localStorage config, ignoring:', e)
    return null
  }
}

function saveToStorage(cfg: StoredConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  } catch (e) {
    logger.error('[Config] Failed to save config to localStorage:', e)
  }
}

async function waitForLayout(): Promise<void> {
  await new Promise<void>(resolve => {
    if (!layout.loading.value) { resolve(); return }
    const interval = setInterval(() => {
      if (!layout.loading.value) { clearInterval(interval); resolve() }
    }, 20)
  })
}

async function init(): Promise<void> {
  // Always wait for YAML — needed for backfill even when localStorage has a config
  await waitForLayout()

  const stored = loadFromStorage()
  if (stored) {
    stored.connections = backfillConnections(stored.connections, layout.plugins.value)
    logger.info('[Config] Loaded from localStorage with YAML backfill')
    config.value = stored
    loading.value = false
    return
  }

  const migrated = migrateFromLayout(layout)
  logger.info('[Config] Migrated config from yardbird.yaml, saving to localStorage')
  saveToStorage(migrated)
  config.value = migrated
  loading.value = false
}

init()

export function useConfig() {
  function save(patch: Partial<StoredConfig>): void {
    if (!config.value) return
    config.value = { ...config.value, ...patch }
    saveToStorage(config.value)
  }

  function saveTabs(tabs: TabConfig[]): void {
    if (!config.value) return
    config.value = { ...config.value, tabs }
    saveToStorage(config.value)
  }

  function saveConnections(connections: StoredConfig['connections']): void {
    if (!config.value) return
    config.value = { ...config.value, connections }
    saveToStorage(config.value)
  }

  function reset(): void {
    localStorage.removeItem(STORAGE_KEY)
    config.value = null
    loading.value = true
    init()
    logger.info('[Config] Reset to YAML defaults')
  }

  return {
    config:        computed(() => config.value),
    loading:       computed(() => loading.value),
    tabs:          computed(() => config.value?.tabs ?? []),
    connections:   computed(() => config.value?.connections ?? {}),
    jmri:          computed(() => config.value?.connections.jmri),
    homeassistant: computed(() => config.value?.connections.homeassistant),
    debug:         computed(() => config.value?.debug ?? false),
    save,
    saveTabs,
    saveConnections,
    reset,
  }
}
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: `Tests  XX passed` — all three new backfill tests pass, no regressions in the existing 11 useConfig tests or any other test file.

- [ ] **Step 5: Commit**

```bash
git add src/core/useConfig.ts src/__tests__/core/useConfig.test.ts
git commit -m "Backfill YAML connection settings into stored config on load"
```

---

### Task 2: Version display on splash screen

**Files:**
- Modify: `src/components/ConnectionSetup.vue`

- [ ] **Step 1: Add the version import and template line**

In `src/components/ConnectionSetup.vue`, find the `<script setup lang="ts">` block and add this import after the existing imports:

```typescript
import { version } from '../../package.json'
```

Then in the template, find:

```html
      <h1 class="text-3xl md:text-4xl font-bold mb-2">YardBird</h1>
      <p class="text-neutral-400 md:text-lg mb-8">Your customizable layout control panel</p>
```

Replace with:

```html
      <h1 class="text-3xl md:text-4xl font-bold mb-1">YardBird</h1>
      <p class="text-xs text-neutral-500 mb-2">v{{ version }}</p>
      <p class="text-neutral-400 md:text-lg mb-8">Your customizable layout control panel</p>
```

Note `mb-2` on the `<h1>` changes to `mb-1` to tighten spacing with the new version line.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Verify the test suite still passes**

```bash
npm test
```

Expected: all tests pass — ConnectionSetup has no unit tests.

- [ ] **Step 4: Commit**

```bash
git add src/components/ConnectionSetup.vue
git commit -m "Show app version on splash screen"
```
