# Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor hardcoded tram address filtering into a general roster group system, then add a Vitest test suite covering the pure logic layer and JMRI integration, plus CI workflows that gate the Docker publish behind passing tests.

**Architecture:** Roster group membership is fetched from JMRI via `getRosterGroups()` + `getRosterEntriesByGroup()` (jmri-client v5.1.0). YAML config (`jmri.rosterGroups`) maps group names to `commandStation` prefixes for per-zone power routing — no address lists in config. `useJmri` exposes `ungroupedRoster` (entries not in any configured group) and `groupedRoster` (configured groups with resolved entries). Tests use Vitest with jsdom; jmri-client's built-in mock mode handles JMRI integration without a real WebSocket.

**Tech Stack:** Vue 3, TypeScript, Vitest, @vue/test-utils, @vitest/coverage-v8, jsdom, GitHub Actions

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `src/core/types.ts` | Add `RosterGroupConfig` (name + commandStation only — no addresses), remove `tramPrefix`, update `JmriPluginConfig` |
| Modify | `src/plugins/jmri/index.ts` | Remove `TRAM_ADDRESSES`, replace per-zone power logic, replace `locoRoster`/`tramRoster` |
| Modify | `src/widgets/config/ThrottleConfig.vue` | Dynamic grouped roster sections |
| Modify | `src/App.vue` | Pass `rosterGroups` instead of `tramPrefix` |
| Modify | `src/components/ConnectionSetup.vue` | Remove tramPrefix form field |
| Modify | `public/yardbird.yaml` | Replace `tramPrefix` with `rosterGroups` config |
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

## Task 1: Add RosterGroupConfig type and update config types

**Files:**
- Modify: `src/core/types.ts`

Remove `tramPrefix` from `JmriPluginConfig`. Add `RosterGroupConfig` interface — name only (addresses come from JMRI) plus an optional `commandStation` prefix for power routing. Use `RosterGroupConfig` not `RosterGroup` to avoid collision with jmri-client's exported `RosterGroup` type (`{ name, length }`).

- [ ] **Step 1: Update types.ts**

In `src/core/types.ts`, replace the `JmriPluginConfig` interface with:

```typescript
export interface RosterGroupConfig {
  name: string             // must match a JMRI roster group name exactly
  commandStation?: string  // system connection prefix for per-zone power routing
}

export interface JmriPluginConfig {
  host: string
  port: number
  secure?: boolean
  mock?: boolean
  tramPwmFreq?: number
  commandStations?: CommandStationsConfig
  rosterGroups?: RosterGroupConfig[]
}
```

- [ ] **Step 2: Run type-check to see what breaks**

```bash
npm run type-check 2>&1 | head -40
```

This will show every downstream reference to `tramPrefix` that TypeScript now rejects. Do not fix them yet — the next tasks address each one.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "Add RosterGroupConfig type, remove tramPrefix from JmriPluginConfig"
```

---

## Task 2: Refactor useJmri — remove TRAM_ADDRESSES, add grouped roster

**Files:**
- Modify: `src/plugins/jmri/index.ts`

Five changes in this file:
1. Remove the `TRAM_ADDRESSES` export and constant
2. Update `JmriConnectionSettings` — remove `tramPrefix`, add `rosterGroups`
3. Add internal `groupedRosterEntries` ref + `fetchRosterGroups()` function
4. Replace per-zone power-off logic in `setPower`
5. Replace `locoRoster`/`tramRoster` computeds with `ungroupedRoster`/`groupedRoster`

- [ ] **Step 1: Update JmriConnectionSettings interface**

Find and replace the interface (around line 24):

```typescript
export interface JmriConnectionSettings {
  host: string
  port: number
  protocol: 'ws' | 'wss'
  mockEnabled: boolean
  mockDelay?: number
  rosterGroups?: RosterGroupConfig[]
  commandStationsConfig?: CommandStationsConfig
}
```

Update the import for config types at the top of the file:

```typescript
import type { JmriState, Throttle, RosterEntry, Direction, ThrottleFunction, LightData } from '@/types/jmri'
import type { CommandStation, CommandStationsConfig, RosterGroupConfig } from '@/core/types'
```

- [ ] **Step 2: Remove TRAM_ADDRESSES**

Delete this line (around line 31):

```typescript
export const TRAM_ADDRESSES = [30, 31] as const
```

- [ ] **Step 3: Add groupedRosterEntries internal state**

After the `jmriState` declaration (around line 48), add:

```typescript
// Group name → resolved entries; populated by fetchRosterGroups()
const groupedRosterEntries = ref<Map<string, RosterEntry[]>>(new Map())
```

In `disconnect()` (around line 1089), alongside the other `.clear()` calls, add:

```typescript
groupedRosterEntries.value.clear()
```

In the `'disconnected'` event handler (around line 218), also add a clear if that handler resets state — check the existing pattern and match it.

- [ ] **Step 4: Add fetchRosterGroups() function**

After `fetchRoster()` (around line 636), add:

```typescript
async function fetchRosterGroups() {
  if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
    logger.error('Cannot fetch roster groups: JMRI client not connected')
    return
  }
  try {
    logger.info('Fetching roster groups from JMRI')
    const configuredNames = new Set(
      (currentSettings?.rosterGroups ?? []).map(g => g.name)
    )
    const allGroups = await jmriClient.getRosterGroups()
    const httpProtocol = currentSettings?.protocol === 'wss' ? 'https' : 'http'
    const { host, port, mockEnabled } = currentSettings ?? { host: '', port: 0, mockEnabled: false }

    for (const group of allGroups) {
      const entries = await jmriClient.getRosterEntriesByGroup(group.name)
      const parsedEntries: RosterEntry[] = []

      for (const entry of entries) {
        const entryData = entry.data
        const address = parseInt(entryData.address)
        let thumbnailUrl: string | undefined
        if (mockEnabled) {
          thumbnailUrl = `/locomotives/${entryData.name}.png`
        } else {
          thumbnailUrl = entryData.icon
            ? `${httpProtocol}://${host}:${port}${entryData.icon}`
            : entryData.name
            ? `${httpProtocol}://${host}:${port}/roster/${encodeURI(entryData.name)}/icon?maxHeight=200`
            : undefined
        }
        const rawFunctionKeys = entryData.functionKeys
        const functionKeys: Record<string, string> = {}
        if (Array.isArray(rawFunctionKeys)) {
          for (const fn of rawFunctionKeys) {
            if (fn.label && fn.name) functionKeys[fn.name] = fn.label
          }
        }
        if (!functionKeys.F0) functionKeys.F0 = 'Headlight'
        const rosterEntry: RosterEntry = {
          address,
          name: entryData.name || `Loco ${address}`,
          road: entryData.road || '',
          number: entryData.number || '',
          thumbnailUrl,
          functionKeys,
        }
        jmriState.value.roster.set(address, rosterEntry)
        parsedEntries.push(rosterEntry)
      }

      if (configuredNames.has(group.name)) {
        groupedRosterEntries.value.set(group.name, parsedEntries)
      }
    }
    logger.info(`Loaded ${allGroups.length} roster group(s) from JMRI`)
  } catch (error) {
    logger.error('Failed to fetch roster groups:', error)
    throw error
  }
}
```

- [ ] **Step 5: Replace per-zone power-off logic in setPower**

Find this block in `setPower` (the `if (state === 'off')` block, around lines 441–460):

```typescript
if (state === 'off') {
  const tramAddrs = TRAM_ADDRESSES as readonly number[]
  const addresses = Array.from(jmriState.value.throttles.keys())

  if (prefix === undefined) {
    // Global power-off: release everything
    for (const address of addresses) {
      await releaseThrottle(address)
    }
  } else {
    // Per-zone power-off: release only throttles on this connection
    const tramPrefix = currentSettings?.tramPrefix ?? ''
    for (const address of addresses) {
      const isTram = tramAddrs.includes(address)
      const onThisZone = isTram
        ? prefix === tramPrefix
        : prefix === '' || prefix === tramPrefix === false
      if (onThisZone) await releaseThrottle(address)
    }
  }
}
```

Replace with:

```typescript
if (state === 'off') {
  const addresses = Array.from(jmriState.value.throttles.keys())
  const groups = currentSettings?.rosterGroups ?? []

  if (prefix === undefined) {
    // Global power-off: release everything
    for (const address of addresses) {
      await releaseThrottle(address)
    }
  } else {
    // Per-zone power-off: release throttles whose configured group's commandStation matches this prefix.
    // Throttles not in any configured group are treated as the default connection (prefix "").
    for (const address of addresses) {
      const group = groups.find(g => {
        const entries = groupedRosterEntries.value.get(g.name) ?? []
        return entries.some(e => e.address === address)
      })
      const addressPrefix = group?.commandStation ?? ''
      if (addressPrefix === prefix) {
        await releaseThrottle(address)
      }
    }
  }
}
```

- [ ] **Step 6: Replace locoRoster and tramRoster computeds in the return block**

Find (around lines 1115–1121):

```typescript
locoRoster: computed(() =>
  Array.from(jmriState.value.roster.values())
    .filter(e => !(TRAM_ADDRESSES as readonly number[]).includes(e.address))
),
tramRoster: computed(() =>
  TRAM_ADDRESSES.map(addr => jmriState.value.roster.get(addr)).filter(Boolean) as import('@/types/jmri').RosterEntry[]
),
```

Replace with:

```typescript
ungroupedRoster: computed(() => {
  const groupedAddresses = new Set(
    [...groupedRosterEntries.value.values()].flatMap(entries => entries.map(e => e.address))
  )
  return Array.from(jmriState.value.roster.values())
    .filter(e => !groupedAddresses.has(e.address))
}),
groupedRoster: computed<{ name: string; entries: RosterEntry[] }[]>(() =>
  (currentSettings?.rosterGroups ?? []).map(group => ({
    name: group.name,
    entries: groupedRosterEntries.value.get(group.name) ?? [],
  }))
),
```

Also add `fetchRosterGroups` to the return object alongside `fetchRoster`.

- [ ] **Step 7: Run type-check**

```bash
npm run type-check 2>&1 | head -40
```

Expected: errors only in `ThrottleConfig.vue`, `App.vue`, `ConnectionSetup.vue` — not in `useJmri/index.ts` itself.

- [ ] **Step 8: Commit**

```bash
git add src/plugins/jmri/index.ts
git commit -m "Replace TRAM_ADDRESSES with jmri-client roster group API in useJmri"
```

---

## Task 3: Update ThrottleConfig.vue

**Files:**
- Modify: `src/widgets/config/ThrottleConfig.vue`

Replace the hardcoded UTabs with dynamic grouped sections driven by `groupedRoster` and `ungroupedRoster`. Replace the entire file:

- [ ] **Step 1: Replace ThrottleConfig.vue**

```vue
<template>
  <div class="space-y-3">
    <div>
      <label class="text-sm text-neutral-300 block mb-1">DCC Address</label>
      <UInput
        v-model="addressStr"
        type="number"
        min="1"
        max="9999"
        placeholder="e.g. 3"
        class="w-full"
      />
    </div>

    <div v-if="commandStations.length > 0">
      <label class="text-sm text-neutral-300 block mb-1">Command Station</label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="cs in commandStations"
          :key="cs.prefix"
          class="px-2 py-1 text-xs rounded border transition-colors"
          :class="selectedCommandStation === cs.prefix
            ? 'border-blue-500 bg-blue-500/20 text-blue-300'
            : 'border-white/20 bg-white/5 text-neutral-300 hover:border-white/40'"
          @click="selectedCommandStation = cs.prefix"
        >
          {{ cs.name }}
        </button>
      </div>
    </div>

    <div v-if="allRoster.length > 0" class="space-y-2">
      <p class="text-xs text-neutral-500">Or pick from roster:</p>

      <div v-for="group in groupedRoster" :key="group.name">
        <p class="text-xs text-neutral-400 mb-1">{{ group.name }}</p>
        <div class="flex flex-wrap gap-1.5">
          <RosterButton
            v-for="entry in group.entries"
            :key="entry.address"
            :entry="entry"
            :selected="selectedAddress"
            @select="selectedAddress = $event"
          />
          <p v-if="!group.entries.length" class="text-xs text-neutral-600">None connected</p>
        </div>
      </div>

      <div v-if="ungroupedRoster.length > 0">
        <p v-if="groupedRoster.length > 0" class="text-xs text-neutral-400 mb-1">DCC Locos</p>
        <div class="flex flex-wrap gap-1.5">
          <RosterButton
            v-for="entry in ungroupedRoster"
            :key="entry.address"
            :entry="entry"
            :selected="selectedAddress"
            @select="selectedAddress = $event"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineComponent, h } from 'vue'
import { useJmri } from '@/plugins/jmri'
import type { RosterEntry } from '@/types/jmri'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [config: Record<string, unknown>] }>()

const { ungroupedRoster, groupedRoster, commandStations } = useJmri()

const selectedAddress = ref<number>((props.config.address as number) ?? 0)
const addressStr = computed({
  get: () => selectedAddress.value > 0 ? String(selectedAddress.value) : '',
  set: (v) => { const n = parseInt(v); if (!isNaN(n)) selectedAddress.value = n },
})

const selectedCommandStation = ref<string>(
  (props.config.commandStation as string) ?? commandStations.value[0]?.prefix ?? ''
)

const allRoster = computed(() => [
  ...groupedRoster.value.flatMap(g => g.entries),
  ...ungroupedRoster.value,
])

const RosterButton = defineComponent({
  props: {
    entry: { type: Object as () => RosterEntry, required: true },
    selected: { type: Number, required: true },
  },
  emits: ['select'],
  setup(props, { emit }) {
    return () => h('button', {
      class: [
        'px-2 py-1 text-xs rounded border transition-colors',
        props.selected === props.entry.address
          ? 'border-blue-500 bg-blue-500/20 text-blue-300'
          : 'border-white/20 bg-white/5 text-neutral-300 hover:border-white/40',
      ],
      onClick: () => emit('select', props.entry.address),
    }, `${props.entry.name} (${props.entry.address})`)
  },
})

watch([selectedAddress, selectedCommandStation], ([addr, cs]) => {
  emit('update', { address: addr, commandStation: cs })
}, { immediate: true })
</script>
```

- [ ] **Step 2: Run type-check**

```bash
npm run type-check 2>&1 | head -40
```

Expected: errors only in `App.vue` and `ConnectionSetup.vue` now.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/config/ThrottleConfig.vue
git commit -m "Replace hardcoded tram tabs with dynamic roster group sections"
```

---

## Task 4: Update App.vue, ConnectionSetup.vue, and yardbird.yaml

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/ConnectionSetup.vue`
- Modify: `public/yardbird.yaml`

- [ ] **Step 1: Update App.vue**

Find the `jmriSettings` object construction in `App.vue` (around line 270). Replace:

```typescript
tramPrefix: jmri.tramPrefix,
```

With:

```typescript
rosterGroups: jmri.rosterGroups,
```

In the `handleConnect` function, after the `await fetchRoster()` call (around line 319), add:

```typescript
try {
  await fetchRosterGroups()
} catch (error) {
  logger.error('Failed to fetch roster groups:', error)
}
```

Also update the destructure at the top of the `<script setup>` block to include `fetchRosterGroups`:

```typescript
const { initialize, disconnect, fetchRoster, fetchRosterGroups, isConnected, connectionState, railroadName, applyCommandStationsConfig, lastEvent: jmriLastEvent } = useJmri()
```

- [ ] **Step 2: Update ConnectionSetup.vue — remove tramPrefix from the template**

Find and delete this block from the template:

```html
<div>
  <label class="text-xs text-neutral-400 block mb-1">Tram prefix (optional)</label>
  <UInput v-model="jmriForm.tramPrefix" placeholder="e.g. D" class="w-full" />
</div>
```

- [ ] **Step 3: Update ConnectionSetup.vue — remove tramPrefix from the script**

In the `jmriForm` reactive declaration, change:

```typescript
const jmriForm = reactive<Partial<JmriPluginConfig> & { port: string | number }>({
  host: '', port: 12080, secure: false, mock: false, tramPrefix: '',
})
```

To:

```typescript
const jmriForm = reactive<Partial<JmriPluginConfig> & { port: string | number }>({
  host: '', port: 12080, secure: false, mock: false,
})
```

In `openJmriEdit()`, delete:

```typescript
jmriForm.tramPrefix = j?.tramPrefix ?? ''
```

In `saveJmri()`, delete:

```typescript
tramPrefix:  jmriForm.tramPrefix || undefined,
```

- [ ] **Step 4: Update yardbird.yaml**

Replace:

```yaml
tramPrefix: D
tramPwmFreq: 3
```

With:

```yaml
tramPwmFreq: 3
rosterGroups:
  - name: Trams
    commandStation: D
```

The `name` must match the JMRI roster group name exactly (case-sensitive). No `addresses` field — group membership is fetched from JMRI via `fetchRosterGroups()`.

- [ ] **Step 5: Run type-check — expect clean**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Run the production build to confirm no runtime issues**

```bash
npm run build 2>&1 | tail -10
```

Expected: build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/App.vue src/components/ConnectionSetup.vue public/yardbird.yaml
git commit -m "Wire rosterGroups config end-to-end, remove tramPrefix"
```

---

## Task 5: Install Vitest and configure

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

Do NOT merge with `vite.config.ts` — Nuxt UI's Vite plugin is not test-safe. Replicate only the aliases.

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

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add Vitest test infrastructure"
```

---

## Task 6: Logger tests

**Files:**
- Create: `src/__tests__/utils/logger.test.ts`

The logger uses `console.log` for debug (not `console.debug`). `warn` and `error` always fire regardless of debug mode.

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

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/utils/logger.test.ts
git commit -m "Add logger tests"
```

---

## Task 7: Widget registry tests

**Files:**
- Create: `src/__tests__/widgets/registry.test.ts`

The registry has 5 widget types: `jmri-power`, `jmri-throttle`, `jmri-turnout`, `jmri-light`, `ha-entity`.

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

Expected: all registry tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/widgets/registry.test.ts
git commit -m "Add widget registry tests"
```

---

## Task 8: useEditMode tests

**Files:**
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

## Task 9: useWidgetConfig tests

**Files:**
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

## Task 10: useConfig tests

**Files:**
- Create: `src/__tests__/core/useConfig.test.ts`

`useConfig` calls `init()` at module scope on load. `init()` calls `useLayout()` which fetches YAML over HTTP. Mock `@/core/useLayout` with `vi.doMock()` before each dynamic import. `vi.resetModules()` ensures a fresh singleton per test.

`save()` does a shallow spread at the `StoredConfig` key level — not a deep merge.

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
      expect(stored.tabs[0].id).toBe('yaml-tab')
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

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/core/useConfig.test.ts
git commit -m "Add useConfig tests"
```

---

## Task 11: useJmri integration tests

**Files:**
- Create: `src/__tests__/plugins/jmri/useJmri.test.ts`

`useJmri` is a module-scope singleton. Call `disconnect()` in `afterEach` — resets `connectionState` to DISCONNECTED and clears all maps.

`initialize(settings)` creates the jmri-client and calls `connect()` internally. Connection is asynchronous; use `waitFor` to poll for `CONNECTED`.

**Roster group tests** call `fetchRosterGroups()` which uses jmri-client's `getRosterGroups()` + `getRosterEntriesByGroup()`. Mock mode returns two groups: `diesels` (CSX754 addr 754, BNSF5240 addr 5240) and `steam` (UP3985 addr 3985). The `MOCK_SETTINGS_WITH_GROUPS` fixture configures only `diesels` — so steam entries appear in `ungroupedRoster`. This also validates that `fetchRosterGroups()` populates the roster (working around the `fetchRoster()` mock limitation, jmri-client issue #21).

- [ ] **Step 1: Write the tests**

Create `src/__tests__/plugins/jmri/useJmri.test.ts`:

```typescript
import { describe, it, expect, afterEach, waitFor } from 'vitest'
import { useJmri, ConnectionState } from '@/plugins/jmri'
import { PowerState, LightState } from 'jmri-client'
import type { RosterGroupConfig } from '@/core/types'

const MOCK_SETTINGS = {
  host: 'localhost',
  port: 12080,
  protocol: 'ws' as const,
  mockEnabled: true,
  mockDelay: 0,
}

// Configure only the 'diesels' group; 'steam' (UP3985, addr 3985) will be ungrouped
const MOCK_SETTINGS_WITH_GROUPS = {
  ...MOCK_SETTINGS,
  rosterGroups: [
    { name: 'diesels', commandStation: 'D' },
  ] satisfies RosterGroupConfig[],
}

async function connectMock(settings = MOCK_SETTINGS) {
  const jmri = useJmri()
  jmri.initialize(settings)
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
      await waitFor(() => expect(lights.value.length).toBeGreaterThan(0), { timeout: 3000 })
      expect(jmriState.value.lights.get('IL1')?.state).toBe(LightState.OFF)
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
      await throwTurnout('LT1')
      await waitFor(() => {
        expect(jmriState.value.turnouts.get('LT1')?.state).toBe(4) // TurnoutState.THROWN
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

  describe('roster groups', () => {
    // Mock data: diesels = [CSX754 addr 754, BNSF5240 addr 5240], steam = [UP3985 addr 3985]
    // MOCK_SETTINGS_WITH_GROUPS configures only 'diesels' — steam entries end up in ungroupedRoster

    it('fetchRosterGroups populates groupedRoster for configured groups', async () => {
      const { fetchRosterGroups, groupedRoster } = await connectMock(MOCK_SETTINGS_WITH_GROUPS)
      await fetchRosterGroups()
      const diesels = groupedRoster.value.find(g => g.name === 'diesels')
      expect(diesels).toBeDefined()
      const addresses = diesels!.entries.map(e => e.address)
      expect(addresses).toContain(754)
      expect(addresses).toContain(5240)
    })

    it('ungroupedRoster excludes entries belonging to configured groups', async () => {
      const { fetchRosterGroups, ungroupedRoster } = await connectMock(MOCK_SETTINGS_WITH_GROUPS)
      await fetchRosterGroups()
      // diesels members (754, 5240) should be absent
      expect(ungroupedRoster.value.some(e => e.address === 754)).toBe(false)
      expect(ungroupedRoster.value.some(e => e.address === 5240)).toBe(false)
      // steam member (3985) is in a JMRI group but not configured — appears in ungrouped
      expect(ungroupedRoster.value.some(e => e.address === 3985)).toBe(true)
    })

    it('ungroupedRoster includes all entries when no groups are configured', async () => {
      const { fetchRosterGroups, ungroupedRoster } = await connectMock()
      await fetchRosterGroups()
      // All mock entries are loaded; none filtered into a configured group
      expect(ungroupedRoster.value.some(e => e.address === 754)).toBe(true)
      expect(ungroupedRoster.value.some(e => e.address === 3985)).toBe(true)
      expect(ungroupedRoster.value.some(e => e.address === 5240)).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: all tests pass. If turnout or light event tests are timing out, increase the `timeout` values.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/plugins/jmri/useJmri.test.ts
git commit -m "Add useJmri integration tests"
```

---

## Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Two additions: a **Testing** section under Development Conventions, and a **Future Considerations** note about component tests.

- [ ] **Step 1: Add Testing section**

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
- Known limitation: `fetchRoster()` does not work correctly in mock mode (jmri-client issue #21 — mock data format mismatch). Roster group tests use `fetchRosterGroups()` instead, which uses the v5.1.0 `getRosterEntriesByGroup()` API and works correctly in mock mode.

### Future: Component Tests

`@vue/test-utils` is already installed. Add component tests when the UI has stabilised and components stop changing frequently.

Priority targets when that time comes:
- `WidgetFrame.vue` — edit-mode overlay logic (drag handle, config button, delete)
- `WidgetPalette.vue` — palette item rendering and drag setup
- `ConnectionSetup.vue` — form field rendering and validation

Test behaviour from the user's perspective, not implementation details. Mount with `@vue/test-utils`' `mount()` and assert on emitted events and rendered output — not on internal refs or method calls.
```

- [ ] **Step 2: Update the roster groups architecture note**

In the **Key Architectural Decisions** section, add a new entry for roster groups:

```markdown
10. **Roster Groups**
   - Group membership is fetched from JMRI via `useJmri().fetchRosterGroups()` (calls jmri-client `getRosterGroups()` + `getRosterEntriesByGroup()`)
   - YAML `jmri.rosterGroups` = `RosterGroupConfig[]` where each entry is `{ name, commandStation? }` — maps JMRI group names to power routing prefixes; no address lists
   - `useJmri` exposes `ungroupedRoster` (entries not in any configured group) and `groupedRoster` (configured groups with resolved `RosterEntry[]`)
   - `fetchRosterGroups()` loads ALL JMRI groups into the roster; only configured groups appear in `groupedRoster`
   - Per-zone power-off releases throttles whose configured group's `commandStation` matches the zone prefix; unconfigured-group throttles use the default connection (`""`)
   - Note: `RosterGroupConfig` (our config type) ≠ jmri-client's exported `RosterGroup` (`{ name, length }`) — different shapes, different purposes
```

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md: testing section + roster groups architecture"
```

---

## Task 13: Add CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

Runs on every push to `main` and on all pull requests. Gives fast feedback for Dependabot PRs automatically.

- [ ] **Step 1: Create ci.yml**

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

## Task 14: Gate Docker publish behind tests

**Files:**
- Modify: `.github/workflows/docker-build-push.yml`

Add a `test` job. The existing `docker` job gets `needs: test`. The `v*` tag trigger is unchanged.

- [ ] **Step 1: Replace docker-build-push.yml**

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

- [ ] **Step 2: Run all tests locally one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/docker-build-push.yml
git commit -m "Gate Docker publish behind passing tests"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ `RosterGroupConfig` type (name + commandStation, no addresses) + `rosterGroups` on `JmriPluginConfig` → Task 1
- ✅ Remove `TRAM_ADDRESSES`, add `fetchRosterGroups()`, generalise per-zone power logic → Task 2
- ✅ `ungroupedRoster` / `groupedRoster` computeds driven by `groupedRosterEntries` → Task 2
- ✅ Dynamic roster picker in `ThrottleConfig.vue` → Task 3
- ✅ `App.vue`, `ConnectionSetup.vue`, `yardbird.yaml` wired up → Task 4
- ✅ Vitest + jsdom + @vue/test-utils → Task 5
- ✅ Logger tests → Task 6
- ✅ Registry tests (correct 5-type set, no jmri-tram) → Task 7
- ✅ useEditMode tests → Task 8
- ✅ useWidgetConfig tests → Task 9
- ✅ useConfig tests (init priority, save, reset) → Task 10
- ✅ useJmri tests — connection, power, lights, turnouts, throttles, roster groups (via `fetchRosterGroups()` + mock diesels/steam data) → Task 11
- ✅ CLAUDE.md — testing section + roster groups architecture note → Task 12
- ✅ CI on push/PR → Task 13
- ✅ Docker publish gated behind `needs: test` → Task 14

**Placeholder scan:** No TBDs, no vague instructions. All steps have exact commands or complete code.

**Type consistency:** `RosterGroupConfig` defined in `src/core/types.ts` and imported as `RosterGroupConfig` throughout — never confused with jmri-client's `RosterGroup`. `ungroupedRoster`/`groupedRoster` named consistently across `useJmri` return, `ThrottleConfig.vue`, and test assertions. `ConnectionState`/`PowerState`/`LightState` imported from correct packages throughout. Mock addresses 754, 5240 (diesels) and 3985 (steam) used consistently in test assertions.
