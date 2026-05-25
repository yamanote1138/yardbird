# YAML Import/Export & Config Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `yardbird.yaml` as a silent config fallback. YAML becomes import/export only. `useConfig` is a pure localStorage manager. New users set up via the connection form or by importing a YAML file.

**Architecture:** Five tasks in order — (1) create `useYamlConfig.ts` with `sanitize`/`importYaml`/`exportYaml`, (2) refactor `useConfig.ts` to use `sanitize` and expose `needsSetup`, (3) remove `useLayout.ts` and `LayoutConfig`, (4) replace `public/yardbird.yaml` with a template, (5) update `ConnectionSetup.vue` with import/export UI.

**Tech Stack:** Vue 3, Vitest, `js-yaml` (already installed), TypeScript.

---

## Files

| Action | File |
|---|---|
| Create | `src/core/useYamlConfig.ts` |
| Create | `src/__tests__/core/useYamlConfig.test.ts` |
| Modify | `src/core/useConfig.ts` |
| Modify | `src/__tests__/core/useConfig.test.ts` |
| Modify | `src/core/types.ts` |
| Modify | `src/components/ConnectionSetup.vue` |
| Replace | `public/yardbird.yaml` |
| Delete | `src/core/useLayout.ts` |

`App.vue` requires no changes — `ConnectionSetup` already shows when `!isInitialized`, which is true whenever the user hasn't connected yet.

---

### Task 1: Create useYamlConfig.ts

**Files:**
- Create: `src/core/useYamlConfig.ts`
- Create: `src/__tests__/core/useYamlConfig.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/core/useYamlConfig.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { sanitize, importYaml, exportYaml } from '@/core/useYamlConfig'

const VALID_STORED = {
  version: 1 as const,
  connections: { jmri: { host: 'myhost', port: 12080 } },
  tabs: [],
}

describe('sanitize', () => {
  it('returns a valid StoredConfig unchanged', () => {
    const result = sanitize(VALID_STORED)
    expect(result).not.toBeNull()
    expect(result!.connections.jmri?.host).toBe('myhost')
  })

  it('returns null when jmri connection is missing', () => {
    expect(sanitize({ version: 1, connections: {}, tabs: [] })).toBeNull()
  })

  it('returns null for wrong version', () => {
    expect(sanitize({ version: 2, connections: { jmri: { host: 'x', port: 1 } }, tabs: [] })).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(sanitize(null)).toBeNull()
    expect(sanitize('string')).toBeNull()
    expect(sanitize(42)).toBeNull()
  })

  it('strips deprecated tramPrefix silently', () => {
    const raw = { version: 1, connections: { jmri: { host: 'h', port: 1, tramPrefix: 'D' } }, tabs: [] }
    const result = sanitize(raw)
    expect(result).not.toBeNull()
    expect((result!.connections.jmri as any).tramPrefix).toBeUndefined()
  })

  it('strips unknown top-level fields', () => {
    const raw = { version: 1, connections: { jmri: { host: 'h', port: 1 } }, tabs: [], unknown: 'field' }
    const result = sanitize(raw)
    expect(result).not.toBeNull()
    expect((result as any).unknown).toBeUndefined()
  })

  it('defaults tabs to [] when missing', () => {
    const raw = { version: 1, connections: { jmri: { host: 'h', port: 1 } } }
    const result = sanitize(raw)
    expect(result!.tabs).toEqual([])
  })
})

describe('importYaml', () => {
  it('imports a valid YAML with plugins.jmri shape', () => {
    const yaml = `
plugins:
  jmri:
    host: myhost
    port: 12080
tabs: []
`
    const { config, warnings } = importYaml(yaml)
    expect(config).not.toBeNull()
    expect(config!.connections.jmri?.host).toBe('myhost')
    expect(warnings).toHaveLength(0)
  })

  it('returns a warning for deprecated tramPrefix', () => {
    const yaml = `
plugins:
  jmri:
    host: myhost
    port: 12080
    tramPrefix: D
tabs: []
`
    const { config, warnings } = importYaml(yaml)
    expect(config).not.toBeNull()
    expect(warnings.some(w => w.includes('tramPrefix'))).toBe(true)
  })

  it('returns null config when jmri host is missing', () => {
    const yaml = `
plugins:
  jmri:
    port: 12080
tabs: []
`
    const { config } = importYaml(yaml)
    expect(config).toBeNull()
  })

  it('returns null config for malformed YAML', () => {
    const { config, warnings } = importYaml(': invalid: yaml: {{{')
    expect(config).toBeNull()
    expect(warnings.length).toBeGreaterThan(0)
  })
})

describe('exportYaml', () => {
  it('round-trips a StoredConfig through export → import', () => {
    const original: typeof VALID_STORED = {
      version: 1,
      connections: { jmri: { host: 'roundtrip', port: 9999 } },
      tabs: [],
    }
    const yaml = exportYaml(original)
    const { config } = importYaml(yaml)
    expect(config).not.toBeNull()
    expect(config!.connections.jmri?.host).toBe('roundtrip')
    expect(config!.connections.jmri?.port).toBe(9999)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "useYamlConfig|FAIL|cannot find"
```

Expected: module not found / all tests fail.

- [ ] **Step 3: Create src/core/useYamlConfig.ts**

```typescript
import yaml from 'js-yaml'
import type {
  StoredConfig, TabConfig, JmriPluginConfig, HomeAssistantPluginConfig,
  CommandStationsConfig, RosterGroupConfig,
} from './types'

// Sanitize raw parsed data (from localStorage or YAML import) into a valid StoredConfig.
// Returns null if the data is fatally unusable (not an object, wrong version, missing jmri).
// Strips unknown and deprecated fields silently.
export function sanitize(raw: unknown): StoredConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  if (r.version !== 1) return null

  const connections = r.connections
  if (!connections || typeof connections !== 'object' || Array.isArray(connections)) return null
  const conn = connections as Record<string, unknown>

  const rawJmri = conn.jmri
  if (!rawJmri || typeof rawJmri !== 'object' || Array.isArray(rawJmri)) return null
  const rj = rawJmri as Record<string, unknown>

  if (typeof rj.host !== 'string' || !rj.host) return null

  const jmri: JmriPluginConfig = {
    host: rj.host,
    port: typeof rj.port === 'number' ? rj.port : 12080,
    ...(typeof rj.secure === 'boolean' && { secure: rj.secure }),
    ...(typeof rj.mock === 'boolean' && { mock: rj.mock }),
    ...(typeof rj.tramPwmFreq === 'number' && { tramPwmFreq: rj.tramPwmFreq }),
    ...(Array.isArray(rj.commandStations) && { commandStations: rj.commandStations as CommandStationsConfig }),
    ...(Array.isArray(rj.rosterGroups) && { rosterGroups: rj.rosterGroups as RosterGroupConfig[] }),
    // tramPrefix intentionally omitted — deprecated, silently dropped
  }

  let homeassistant: HomeAssistantPluginConfig | undefined
  const rawHa = conn.homeassistant
  if (rawHa && typeof rawHa === 'object' && !Array.isArray(rawHa)) {
    const rh = rawHa as Record<string, unknown>
    homeassistant = {
      url:   typeof rh.url   === 'string' ? rh.url   : '',
      token: typeof rh.token === 'string' ? rh.token : '',
      area:  typeof rh.area  === 'string' ? rh.area  : '',
      ...(typeof rh.enabled === 'boolean' && { enabled: rh.enabled }),
      ...(typeof rh.mock    === 'boolean' && { mock:    rh.mock }),
    }
  }

  const tabs: TabConfig[] = Array.isArray(r.tabs)
    ? (r.tabs as unknown[]).filter(
        (t): t is TabConfig =>
          !!t && typeof t === 'object' && typeof (t as TabConfig).id === 'string'
      )
    : []

  return {
    version:     1,
    ...(typeof r.debug === 'boolean' && { debug: r.debug }),
    connections: { jmri, homeassistant },
    tabs,
  }
}

// Parse a YAML string and convert it to a StoredConfig.
// The YAML uses a `plugins:` key (legacy shape); this maps it to `connections:`.
export function importYaml(text: string): { config: StoredConfig | null; warnings: string[] } {
  const warnings: string[] = []

  let parsed: unknown
  try {
    parsed = yaml.load(text)
  } catch (e) {
    return { config: null, warnings: [`Failed to parse YAML: ${String(e)}`] }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: null, warnings: ['YAML did not produce a valid object'] }
  }

  const raw = parsed as Record<string, unknown>
  const plugins = raw.plugins as Record<string, unknown> | undefined
  const jmriPlugin = plugins?.jmri as Record<string, unknown> | undefined

  if (jmriPlugin && 'tramPrefix' in jmriPlugin) {
    warnings.push('tramPrefix is no longer supported and was ignored')
  }

  const normalized: Record<string, unknown> = {
    version: 1,
    ...(typeof raw.debug === 'boolean' && { debug: raw.debug }),
    connections: {
      jmri:          plugins?.jmri,
      homeassistant: plugins?.homeassistant,
    },
    tabs: Array.isArray(raw.tabs) ? raw.tabs : [],
  }

  const config = sanitize(normalized)
  if (!config) {
    warnings.push('Config is missing required JMRI connection details (host)')
    return { config: null, warnings }
  }

  return { config, warnings }
}

// Serialise a StoredConfig back to YAML (plugins: shape for human readability).
export function exportYaml(config: StoredConfig): string {
  const doc: Record<string, unknown> = {}
  if (config.debug) doc.debug = config.debug
  doc.plugins = {
    jmri: config.connections.jmri,
    ...(config.connections.homeassistant && { homeassistant: config.connections.homeassistant }),
  }
  doc.tabs = config.tabs
  return yaml.dump(doc, { indent: 2, lineWidth: 120 })
}
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all useYamlConfig tests pass. Total count increases from 64. No regressions.

- [ ] **Step 5: Commit**

```bash
git add src/core/useYamlConfig.ts src/__tests__/core/useYamlConfig.test.ts
git commit -m "Add useYamlConfig: sanitize, importYaml, exportYaml"
```

---

### Task 2: Refactor useConfig.ts

**Files:**
- Modify: `src/core/useConfig.ts`
- Modify: `src/__tests__/core/useConfig.test.ts`

- [ ] **Step 1: Rewrite useConfig.test.ts**

Remove YAML-fallback tests and the `useLayout` mock. Simplify `freshConfig()`. Add `needsSetup` tests.

Replace the entire file with:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

const STORAGE_KEY = 'yardbird:config'

async function freshConfig() {
  vi.resetModules()
  const { useConfig } = await import('@/core/useConfig')
  const cfg = useConfig()
  // init() is synchronous now — no YAML wait needed
  return cfg
}

describe('useConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('needsSetup', () => {
    it('is true when localStorage is empty', async () => {
      const { needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(true)
    })

    it('is false when valid config exists in localStorage', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(false)
    })

    it('is true when localStorage has wrong version', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, connections: {}, tabs: [] }))
      const { needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(true)
    })

    it('is true when localStorage has invalid JSON', async () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json')
      const { needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(true)
    })
  })

  describe('init — loads from localStorage', () => {
    it('loads tabs from localStorage', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [{ id: 'stored-tab', name: 'Stored Tab', icon: 'i-mdi-home', widgets: [] }],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { tabs } = await freshConfig()
      expect(tabs.value[0].id).toBe('stored-tab')
    })

    it('strips deprecated tramPrefix from jmri config on load', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080, tramPrefix: 'D' } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { jmri } = await freshConfig()
      expect((jmri.value as any)?.tramPrefix).toBeUndefined()
    })
  })

  describe('save', () => {
    it('merges top-level fields and persists to localStorage', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { save, tabs } = await freshConfig()
      save({ tabs: [{ id: 'new-tab', name: 'New', icon: 'i-mdi-train', widgets: [] }] })
      expect(tabs.value[0].id).toBe('new-tab')
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(persisted.tabs[0].id).toBe('new-tab')
    })
  })

  describe('saveTabs', () => {
    it('replaces tabs and persists', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { saveTabs, tabs } = await freshConfig()
      saveTabs([{ id: 'x', name: 'X', icon: 'i-mdi-home', widgets: [] }])
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].id).toBe('x')
    })
  })

  describe('saveConnections', () => {
    it('replaces connections and persists', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { saveConnections, connections } = await freshConfig()
      saveConnections({ jmri: { host: '192.168.1.1', port: 12080 } })
      expect(connections.value.jmri?.host).toBe('192.168.1.1')
    })

    it('works when needsSetup (no existing config) and clears needsSetup', async () => {
      const { saveConnections, needsSetup, jmri } = await freshConfig()
      expect(needsSetup.value).toBe(true)
      saveConnections({ jmri: { host: 'newhost', port: 12080 } })
      expect(needsSetup.value).toBe(false)
      expect(jmri.value?.host).toBe('newhost')
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(persisted.connections.jmri.host).toBe('newhost')
    })
  })

  describe('applyImport', () => {
    it('sets config, clears needsSetup, and persists', async () => {
      const { applyImport, needsSetup, jmri } = await freshConfig()
      expect(needsSetup.value).toBe(true)
      applyImport({
        version: 1,
        connections: { jmri: { host: 'imported', port: 12080 } },
        tabs: [],
      })
      expect(needsSetup.value).toBe(false)
      expect(jmri.value?.host).toBe('imported')
    })
  })

  describe('reset', () => {
    it('removes config from localStorage and sets needsSetup', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { reset, needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(false)
      reset()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(needsSetup.value).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "useConfig|FAIL|failed" | head -20
```

Expected: most useConfig tests fail (needsSetup not exposed, old behaviour).

- [ ] **Step 3: Rewrite src/core/useConfig.ts**

```typescript
import { ref, computed } from 'vue'
import { sanitize } from './useYamlConfig'
import { logger } from '@/utils/logger'
import type { StoredConfig, TabConfig } from './types'

const STORAGE_KEY = 'yardbird:config'

const config = ref<StoredConfig | null>(null)
const loading = ref(true)
const needsSetup = ref(false)

function loadFromStorage(): StoredConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return sanitize(JSON.parse(raw))
  } catch (e) {
    logger.warn('[Config] Failed to parse localStorage config:', e)
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

async function init(): Promise<void> {
  const stored = loadFromStorage()
  if (!stored) {
    logger.info('[Config] No valid config in localStorage — needs setup')
    needsSetup.value = true
    loading.value = false
    return
  }
  logger.info('[Config] Loaded from localStorage')
  needsSetup.value = false
  config.value = stored
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

  // Works even when needsSetup (config is null) — creates a new minimal StoredConfig.
  function saveConnections(connections: StoredConfig['connections']): void {
    const base = config.value ?? { version: 1 as const, connections: {}, tabs: [] }
    config.value = { ...base, connections }
    needsSetup.value = false
    saveToStorage(config.value)
  }

  // Apply a config imported from YAML — replaces current config and clears needsSetup.
  function applyImport(imported: StoredConfig): void {
    config.value = imported
    needsSetup.value = false
    saveToStorage(imported)
    logger.info('[Config] Applied imported config')
  }

  function reset(): void {
    localStorage.removeItem(STORAGE_KEY)
    config.value = null
    needsSetup.value = true
    logger.info('[Config] Config reset')
  }

  return {
    config:        computed(() => config.value),
    loading:       computed(() => loading.value),
    needsSetup:    computed(() => needsSetup.value),
    tabs:          computed(() => config.value?.tabs ?? []),
    connections:   computed(() => config.value?.connections ?? {}),
    jmri:          computed(() => config.value?.connections.jmri),
    homeassistant: computed(() => config.value?.connections.homeassistant),
    debug:         computed(() => config.value?.debug ?? false),
    save,
    saveTabs,
    saveConnections,
    applyImport,
    reset,
  }
}
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all useConfig tests pass. Note: some tests from the old useConfig suite (YAML-fallback tests) no longer exist — they were replaced in Step 1. Total test count may decrease from 64; this is expected.

- [ ] **Step 5: Commit**

```bash
git add src/core/useConfig.ts src/__tests__/core/useConfig.test.ts
git commit -m "Refactor useConfig: pure localStorage manager, add needsSetup"
```

---

### Task 3: Delete useLayout.ts and clean up types.ts

**Files:**
- Delete: `src/core/useLayout.ts`
- Modify: `src/core/types.ts`
- Modify: `src/__tests__/core/useConfig.test.ts` (was already updated in Task 2)

- [ ] **Step 1: Remove LayoutConfig from types.ts**

In `src/core/types.ts`, delete this entire block at the bottom of the file:

```typescript
// ── Legacy YAML config (used only by useLayout.ts as fallback source) ─────────

export interface LayoutConfig {
  debug?: boolean
  plugins: {
    jmri: JmriPluginConfig
    homeassistant?: HomeAssistantPluginConfig
  }
  tabs: Array<{ id: string; name: string; icon: string }>
}
```

Also remove the comment `// ── Layout / YAML config ─────────────────────────────────────────────────────` at the top of the file (the types below it are still needed, just the section header label is misleading now).

- [ ] **Step 2: Delete useLayout.ts**

```bash
rm src/core/useLayout.ts
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: no errors. `useLayout` is no longer imported by anything (was only used by the now-rewritten `useConfig.ts`).

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. The old useConfig tests that mocked `@/core/useLayout` are gone (replaced in Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts
git rm src/core/useLayout.ts
git commit -m "Remove useLayout and LayoutConfig — YAML is now import/export only"
```

---

### Task 4: Replace public/yardbird.yaml with a template

**Files:**
- Replace: `public/yardbird.yaml`

- [ ] **Step 1: Write the template file**

Replace the entire contents of `public/yardbird.yaml` with:

```yaml
# YardBird configuration template
# Import this file via the YardBird setup screen to pre-fill your connection settings.
# To use with Docker: volume-mount your edited copy to /config/yardbird.yaml

connections:
  jmri:
    host: raspi-jmri.local    # hostname or IP of your JMRI server
    port: 12080               # default JMRI WebSocket port
    # secure: false           # set true to use wss:// (requires TLS on JMRI)
    # mock: false             # set true to run without hardware

    # Roster groups: name must match a JMRI roster group exactly (case-sensitive).
    # commandStation routes per-zone power control to the right connection prefix.
    # rosterGroups:
    #   - name: trams
    #     commandStation: D

    # Power zone buttons shown in the header.
    # Option 1 — explicit zones (prefix "" = default JMRI connection):
    # commandStations:
    #   - name: DCC
    #     prefix: "L"
    #   - name: Trams
    #     prefix: D
    # Option 2 — auto-discover from JMRI system connections:
    # commandStations:
    #   discover: true
    # Option 3 — omit commandStations for a single combined power button

  # homeassistant:
  #   url: http://homeassistant.local:8123
  #   token: ''          # long-lived access token
  #   area: train_room   # filter entities by area
```

- [ ] **Step 2: Commit**

```bash
git add public/yardbird.yaml
git commit -m "Replace yardbird.yaml with documented template"
```

---

### Task 5: Update ConnectionSetup.vue

**Files:**
- Modify: `src/components/ConnectionSetup.vue`

This is the most substantial UI change. Replace the entire file.

- [ ] **Step 1: Write the updated ConnectionSetup.vue**

```vue
<template>
  <div class="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center">
    <div class="text-center max-w-sm w-full px-6">
      <img src="/favicon.svg" class="w-16 h-16 md:w-20 md:h-20 mx-auto mb-6" alt="YardBird" />
      <h1 class="text-3xl md:text-4xl font-bold mb-1">YardBird</h1>
      <p class="text-xs text-neutral-500 mb-2">v{{ version }}</p>
      <p class="text-neutral-400 md:text-lg mb-8">Your customizable layout control panel</p>

      <!-- Docker / server config banner (only shown on first run when a real config is found) -->
      <div
        v-if="serverConfig"
        class="mb-4 p-3 bg-success-500/10 border border-success-500/30 rounded-lg text-left flex items-start justify-between gap-2"
      >
        <div class="min-w-0">
          <p class="text-sm text-success-400 font-medium">Server config found</p>
          <p class="text-xs text-neutral-400 truncate">{{ serverConfig.connections.jmri?.host }}:{{ serverConfig.connections.jmri?.port }}</p>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <UButton size="xs" color="success" variant="subtle" @click="applyServerConfig">Import</UButton>
          <UButton size="xs" color="neutral" variant="ghost" @click="serverConfig = null">Dismiss</UButton>
        </div>
      </div>

      <!-- Import warnings -->
      <div
        v-if="importWarnings.length > 0"
        class="mb-4 p-3 bg-warning-500/10 border border-warning-500/30 rounded-lg text-left"
      >
        <p class="text-xs text-warning-400 font-medium mb-1">Import warnings:</p>
        <ul class="text-xs text-neutral-400 space-y-0.5 list-disc list-inside">
          <li v-for="w in importWarnings" :key="w">{{ w }}</li>
        </ul>
      </div>

      <!-- Connection cards -->
      <div class="space-y-2 mb-6 text-left">
        <!-- JMRI -->
        <div class="bg-neutral-900 rounded-lg p-3 border border-white/10">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <UIcon name="i-mdi-train-variant" class="w-4 h-4 text-neutral-400 flex-shrink-0" />
              <div class="min-w-0">
                <p class="text-sm font-medium text-white">JMRI</p>
                <p class="text-xs text-neutral-500 truncate">
                  {{ jmri?.mock ? 'Mock mode' : jmri?.host ? `${jmri.host}:${jmri.port}` : 'Not configured' }}
                  <span v-if="jmri?.secure" class="text-success-500"> (TLS)</span>
                </p>
              </div>
            </div>
            <UButton size="xs" color="neutral" variant="ghost" @click="openJmriEdit">
              {{ jmri?.host ? 'Edit' : 'Configure' }}
            </UButton>
          </div>
        </div>

        <!-- Home Assistant -->
        <div
          class="rounded-lg p-3 border transition-colors"
          :class="haEnabled ? 'bg-neutral-900 border-white/10' : 'bg-neutral-900/40 border-white/5'"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <UIcon name="i-mdi-home" class="w-4 h-4 flex-shrink-0" :class="haEnabled ? 'text-neutral-400' : 'text-neutral-600'" />
              <div class="min-w-0">
                <p class="text-sm font-medium" :class="haEnabled ? 'text-white' : 'text-neutral-600'">
                  Home Assistant
                </p>
                <p class="text-xs text-neutral-500 truncate">
                  {{ haEnabled ? (ha?.url ?? '—') : 'Not configured' }}
                </p>
              </div>
            </div>
            <UButton size="xs" color="neutral" variant="ghost" @click="openHaEdit">
              {{ haEnabled ? 'Edit' : 'Add' }}
            </UButton>
          </div>
        </div>
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        icon="i-heroicons-exclamation-triangle"
        :title="errorMessage"
        class="mb-4 text-left"
      />

      <UButton
        size="xl"
        color="success"
        block
        :loading="isConnecting"
        :disabled="isConnecting || !jmri?.host"
        @click="handleBoard"
      >
        <template v-if="!isConnecting" #leading>
          <UIcon name="i-mdi-train-variant" />
        </template>
        {{ isConnecting ? 'Departing...' : 'All Aboard!' }}
      </UButton>

      <!-- Bottom links -->
      <div class="mt-3 flex items-center justify-center gap-4">
        <label class="text-xs text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer">
          Import config
          <input ref="fileInput" type="file" accept=".yaml,.yml" class="hidden" @change="handleFileImport" />
        </label>
        <button
          v-if="!cfg.needsSetup.value"
          class="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          @click="handleExport"
        >
          Export config
        </button>
        <button
          class="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          @click="handleReset"
        >
          Reset
        </button>
      </div>
    </div>
  </div>

  <!-- JMRI Edit Modal -->
  <UModal v-model:open="showJmriModal" title="JMRI Connection" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <label class="text-xs text-neutral-400 block mb-1">Host</label>
            <UInput v-model="jmriForm.host" placeholder="raspi-jmri.local" class="w-full" />
          </div>
          <div class="w-24">
            <label class="text-xs text-neutral-400 block mb-1">Port</label>
            <UInput v-model="jmriForm.port" type="number" placeholder="12080" class="w-full" />
          </div>
        </div>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
            <UCheckbox v-model="jmriForm.secure" />
            Secure (WSS)
          </label>
          <label class="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
            <UCheckbox v-model="jmriForm.mock" />
            Mock mode
          </label>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showJmriModal = false">Cancel</UButton>
        <UButton color="primary" @click="saveJmri">Save</UButton>
      </div>
    </template>
  </UModal>

  <!-- HA Edit Modal -->
  <UModal v-model:open="showHaModal" title="Home Assistant" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <div class="space-y-3">
        <label class="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
          <UCheckbox v-model="haForm.enabled" />
          Enable Home Assistant
        </label>
        <div v-if="haForm.enabled" class="space-y-3">
          <div>
            <label class="text-xs text-neutral-400 block mb-1">URL</label>
            <UInput v-model="haForm.url" placeholder="http://homeassistant.local:8123" class="w-full" />
          </div>
          <div>
            <label class="text-xs text-neutral-400 block mb-1">Long-lived access token</label>
            <UInput v-model="haForm.token" type="password" placeholder="eyJ..." class="w-full" />
          </div>
          <div>
            <label class="text-xs text-neutral-400 block mb-1">Area (filter entities)</label>
            <UInput v-model="haForm.area" placeholder="e.g. train_room" class="w-full" />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showHaModal = false">Cancel</UButton>
        <UButton color="primary" @click="saveHa">Save</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useConfig } from '@/core/useConfig'
import { importYaml, exportYaml } from '@/core/useYamlConfig'
import type { JmriPluginConfig, HomeAssistantPluginConfig, StoredConfig } from '@/core/types'
import { version } from '../../package.json'

const emit = defineEmits<{ connect: [] }>()

const cfg = useConfig()
const jmri = computed(() => cfg.jmri.value)
const ha   = computed(() => cfg.homeassistant.value)
const haEnabled = computed(() => !!(ha.value?.enabled && ha.value.url))

const isConnecting  = ref(false)
const errorMessage  = ref('')
const importWarnings = ref<string[]>([])
const serverConfig  = ref<StoredConfig | null>(null)
const fileInput     = ref<HTMLInputElement | null>(null)

// ── Docker / server config banner ─────────────────────────────────────────────

onMounted(async () => {
  if (!cfg.needsSetup.value) return
  try {
    const res = await fetch('/yardbird.yaml')
    if (!res.ok) return
    const text = await res.text()
    const { config } = importYaml(text)
    // Only show banner if the YAML has a real host (not the blank template)
    if (config?.connections.jmri?.host) serverConfig.value = config
  } catch {
    // Silently ignore — server config is optional
  }
})

function applyServerConfig() {
  if (!serverConfig.value) return
  cfg.applyImport(serverConfig.value)
  serverConfig.value = null
}

// ── File import ───────────────────────────────────────────────────────────────

async function handleFileImport(event: Event) {
  importWarnings.value = []
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const text = await file.text()
  const { config, warnings } = importYaml(text)
  importWarnings.value = warnings
  if (config) cfg.applyImport(config)
  if (fileInput.value) fileInput.value.value = ''
}

// ── Export ────────────────────────────────────────────────────────────────────

function handleExport() {
  if (!cfg.config.value) return
  const yaml = exportYaml(cfg.config.value)
  const blob = new Blob([yaml], { type: 'text/yaml' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'yardbird.yaml'
  a.click()
  URL.revokeObjectURL(url)
}

// ── JMRI form ─────────────────────────────────────────────────────────────────

const showJmriModal = ref(false)
const jmriForm = reactive<Partial<JmriPluginConfig> & { port: string | number }>({
  host: '', port: 12080, secure: false, mock: false,
})

function openJmriEdit() {
  const j = jmri.value
  jmriForm.host   = j?.host   ?? ''
  jmriForm.port   = j?.port   ?? 12080
  jmriForm.secure = j?.secure ?? false
  jmriForm.mock   = j?.mock   ?? false
  showJmriModal.value = true
}

function saveJmri() {
  const updated: JmriPluginConfig = {
    host:            String(jmriForm.host ?? ''),
    port:            Number(jmriForm.port ?? 12080),
    secure:          !!jmriForm.secure,
    mock:            !!jmriForm.mock,
    commandStations: jmri.value?.commandStations,
    tramPwmFreq:     jmri.value?.tramPwmFreq,
    rosterGroups:    jmri.value?.rosterGroups,
  }
  cfg.saveConnections({ ...cfg.connections.value, jmri: updated })
  showJmriModal.value = false
}

// ── HA form ───────────────────────────────────────────────────────────────────

const showHaModal = ref(false)
const haForm = reactive<Partial<HomeAssistantPluginConfig> & { enabled: boolean }>({
  enabled: false, url: '', token: '', area: '',
})

function openHaEdit() {
  const h = ha.value
  haForm.enabled = h?.enabled ?? false
  haForm.url     = h?.url     ?? ''
  haForm.token   = h?.token   ?? ''
  haForm.area    = h?.area    ?? ''
  showHaModal.value = true
}

function saveHa() {
  const updated: HomeAssistantPluginConfig = {
    enabled: haForm.enabled,
    url:     String(haForm.url   ?? ''),
    token:   String(haForm.token ?? ''),
    area:    String(haForm.area  ?? ''),
  }
  cfg.saveConnections({ ...cfg.connections.value, homeassistant: updated })
  showHaModal.value = false
}

// ── Connect / reset ───────────────────────────────────────────────────────────

const handleBoard = () => {
  errorMessage.value = ''
  isConnecting.value = true
  emit('connect')
}

function handleReset() {
  if (confirm('Reset all settings? This cannot be undone.')) {
    cfg.reset()
  }
}

defineExpose({
  setError: (message: string) => {
    errorMessage.value = message
    isConnecting.value = false
  },
  setConnecting: (connecting: boolean) => {
    isConnecting.value = connecting
  },
})
</script>
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. `ConnectionSetup` has no automated tests.

- [ ] **Step 4: Commit**

```bash
git add src/components/ConnectionSetup.vue
git commit -m "Update ConnectionSetup: import/export, Docker banner, blank-state handling"
```

---

### Final verification

- [ ] **Type-check clean**

```bash
npm run type-check
```

- [ ] **All tests pass**

```bash
npm test
```

- [ ] **Manual checklist**

| Scenario | Expected |
|---|---|
| Clear localStorage, open app | Setup screen shows; JMRI card says "Not configured"; "All Aboard!" disabled |
| Click "Configure" on JMRI card | Modal opens with blank host field |
| Fill in host, save, click "All Aboard!" | Connects, config saved to localStorage |
| Export config | Downloads `yardbird.yaml` |
| Import the exported file on a fresh setup | Connection details pre-filled, no warnings |
| Import a YAML with `tramPrefix` | Warning shown: "tramPrefix is no longer supported" |
| Run with `/yardbird.yaml` serving a real config (Docker) | Banner appears; clicking Import pre-fills form |
| Reset | localStorage cleared; setup screen shows again |
