# Webcam Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `webcam` widget type that displays a live MJPEG stream from a local IP camera in an `<img>` tag, with pause/resume control.

**Architecture:** Plugin-free widget — no composable, no WebSocket. Config stores a `streamUrl` and `label`; `WidgetFrame` spreads these as individual props via `v-bind="widgetConfig"`. Pause/resume works by toggling `v-if` on the `<img>` element, which mounts/unmounts the HTTP connection.

**Tech Stack:** Vue 3 Composition API, TypeScript, Nuxt UI 4, Vitest + `@vue/test-utils`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/core/types.ts` | Modify | Add `'webcam'` to `WidgetType` union |
| `src/widgets/registry.ts` | Modify | Make `plugin` optional; add webcam entry |
| `src/widgets/WebcamWidget.vue` | Create | `<img>` stream, pause/resume, loading/error states |
| `src/widgets/config/WebcamConfig.vue` | Create | Config form — label + stream URL |
| `src/widgets/WidgetConfigModal.vue` | Modify | Add webcam to `CONFIG_COMPONENTS` lookup |
| `src/__tests__/widgets/registry.test.ts` | Modify | Add `'webcam'` to expected types, allow undefined plugin |
| `src/__tests__/widgets/config/WebcamConfig.test.ts` | Create | Config form tests |
| `src/__tests__/widgets/WebcamWidget.test.ts` | Create | Widget render and interaction tests |

---

## Task 1: Create branch

- [ ] **Create and switch to branch**

```bash
git checkout -b add-webcam-widget
```

Expected: `Switched to a new branch 'add-webcam-widget'`

---

## Task 2: Extend WidgetType and registry (TDD)

**Files:**
- Modify: `src/__tests__/widgets/registry.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/widgets/registry.ts`

- [ ] **Step 1: Update registry test to expect webcam — this creates the failing state**

Replace the contents of `src/__tests__/widgets/registry.test.ts`:

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
  'webcam',
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
        if (def.plugin !== undefined) {
          expect(['jmri', 'homeassistant']).toContain(def.plugin)
        }
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
    expect(def.plugin).toBe('jmri')
  })

  it('returns undefined for an unknown type', () => {
    const def = getWidgetDef('not-a-widget' as WidgetType)
    expect(def).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test src/__tests__/widgets/registry.test.ts
```

Expected: FAIL — `missing type: webcam` and `has no extra widget types` fails because `'webcam'` is not yet in `WIDGET_REGISTRY`.

- [ ] **Step 3: Add `'webcam'` to `WidgetType` in `src/core/types.ts`**

```typescript
export type WidgetType =
  | 'jmri-power'
  | 'jmri-throttle'
  | 'jmri-turnout'
  | 'jmri-light'
  | 'ha-entity'
  | 'webcam'
```

- [ ] **Step 4: Update `src/widgets/registry.ts` — make `plugin` optional and add webcam entry**

Replace the full file:

```typescript
import type { Component } from 'vue'
import type { WidgetType, WidgetGridPos } from '@/core/types'

export interface WidgetDefinition {
  type: WidgetType
  name: string
  icon: string
  plugin?: 'jmri' | 'homeassistant'
  defaultSize: WidgetGridPos
  minSize: { w: number; h: number }
  hasConfig: boolean
  component: () => Promise<Component>
}

export const WIDGET_REGISTRY: Record<WidgetType, WidgetDefinition> = {
  'jmri-throttle': {
    type: 'jmri-throttle',
    name: 'Throttle',
    icon: 'i-mdi-train',
    plugin: 'jmri',
    defaultSize: { x: 0, y: 0, w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    hasConfig: true,
    component: () => import('@/plugins/jmri/components/ThrottleWidget.vue'),
  },

  'jmri-turnout': {
    type: 'jmri-turnout',
    name: 'Turnout',
    icon: 'i-mdi-source-branch',
    plugin: 'jmri',
    defaultSize: { x: 0, y: 0, w: 2, h: 1 },
    minSize: { w: 2, h: 1 },
    hasConfig: true,
    component: () => import('@/plugins/jmri/components/TurnoutWidget.vue'),
  },

  'jmri-light': {
    type: 'jmri-light',
    name: 'Light',
    icon: 'i-mdi-lightbulb-outline',
    plugin: 'jmri',
    defaultSize: { x: 0, y: 0, w: 2, h: 1 },
    minSize: { w: 2, h: 1 },
    hasConfig: true,
    component: () => import('@/plugins/jmri/components/LightWidget.vue'),
  },

  'jmri-power': {
    type: 'jmri-power',
    name: 'Command Station',
    icon: 'i-heroicons-bolt',
    plugin: 'jmri',
    defaultSize: { x: 0, y: 0, w: 2, h: 1 },
    minSize: { w: 2, h: 1 },
    hasConfig: true,
    component: () => import('@/plugins/jmri/components/PowerWidget.vue'),
  },

  'ha-entity': {
    type: 'ha-entity',
    name: 'Room Control',
    icon: 'i-mdi-home',
    plugin: 'homeassistant',
    defaultSize: { x: 0, y: 0, w: 2, h: 1 },
    minSize: { w: 2, h: 1 },
    hasConfig: true,
    component: () => import('@/plugins/homeassistant/components/HaEntityWidget.vue'),
  },

  'webcam': {
    type: 'webcam',
    name: 'Webcam',
    icon: 'i-mdi-webcam',
    defaultSize: { x: 0, y: 0, w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    hasConfig: true,
    component: () => import('@/widgets/WebcamWidget.vue'),
  },
}

export function getWidgetDef(type: WidgetType): WidgetDefinition {
  return WIDGET_REGISTRY[type]
}
```

- [ ] **Step 5: Run registry tests — expect green**

```bash
npm test src/__tests__/widgets/registry.test.ts
```

Expected: PASS — all tests including the new `webcam` entries pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/widgets/registry.ts src/__tests__/widgets/registry.test.ts
git commit -m "Add webcam widget type to registry"
```

---

## Task 3: WebcamConfig component (TDD)

**Files:**
- Create: `src/__tests__/widgets/config/WebcamConfig.test.ts`
- Create: `src/widgets/config/WebcamConfig.vue`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/widgets/config/WebcamConfig.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mountWithUI } from '@/__tests__/test-utils'
import WebcamConfig from '@/widgets/config/WebcamConfig.vue'

describe('WebcamConfig', () => {
  it('renders two input fields (label and stream URL)', () => {
    const wrapper = mountWithUI(WebcamConfig, { props: { config: {} } })
    expect(wrapper.findAll('input')).toHaveLength(2)
  })

  it('pre-populates label from config', () => {
    const wrapper = mountWithUI(WebcamConfig, {
      props: { config: { label: 'Train Room', streamUrl: '' } },
    })
    const input = wrapper.findAll('input')[0]
    expect((input.element as HTMLInputElement).value).toBe('Train Room')
  })

  it('pre-populates streamUrl from config', () => {
    const wrapper = mountWithUI(WebcamConfig, {
      props: { config: { label: '', streamUrl: 'http://cam/stream' } },
    })
    const input = wrapper.findAll('input')[1]
    expect((input.element as HTMLInputElement).value).toBe('http://cam/stream')
  })

  it('emits update immediately with initial values', () => {
    const wrapper = mountWithUI(WebcamConfig, {
      props: { config: { label: 'Cam', streamUrl: 'http://cam/stream' } },
    })
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates?.[0]?.[0]).toEqual({ label: 'Cam', streamUrl: 'http://cam/stream' })
  })

  it('emits update when label changes', async () => {
    const wrapper = mountWithUI(WebcamConfig, { props: { config: {} } })
    await wrapper.findAll('input')[0].setValue('New Label')
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates[updates.length - 1][0]).toMatchObject({ label: 'New Label' })
  })

  it('emits update when stream URL changes', async () => {
    const wrapper = mountWithUI(WebcamConfig, { props: { config: {} } })
    await wrapper.findAll('input')[1].setValue('http://newcam/stream')
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates[updates.length - 1][0]).toMatchObject({ streamUrl: 'http://newcam/stream' })
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test src/__tests__/widgets/config/WebcamConfig.test.ts
```

Expected: FAIL — `Failed to resolve import "@/widgets/config/WebcamConfig.vue"`

- [ ] **Step 3: Implement `src/widgets/config/WebcamConfig.vue`**

```vue
<template>
  <div class="space-y-3">
    <div>
      <label class="text-sm text-neutral-300 block mb-1">Label</label>
      <UInput v-model="label" placeholder="Train room camera" class="w-full" />
    </div>
    <div>
      <label class="text-sm text-neutral-300 block mb-1">Stream URL</label>
      <UInput
        v-model="streamUrl"
        placeholder="http://user:pass@192.168.1.17/cgi-bin/mjpg/video.cgi?channel=0&subtype=1"
        class="w-full"
      />
      <p class="text-xs text-neutral-500 mt-1">MJPEG stream URL from your IP camera</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [config: Record<string, unknown>] }>()

const label = ref<string>((props.config.label as string) ?? '')
const streamUrl = ref<string>((props.config.streamUrl as string) ?? '')

watch([label, streamUrl], ([l, s]) => {
  emit('update', { label: l, streamUrl: s })
}, { immediate: true })
</script>
```

- [ ] **Step 4: Run to confirm green**

```bash
npm test src/__tests__/widgets/config/WebcamConfig.test.ts
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/config/WebcamConfig.vue src/__tests__/widgets/config/WebcamConfig.test.ts
git commit -m "Add WebcamConfig form component"
```

---

## Task 4: WebcamWidget component (TDD)

**Files:**
- Create: `src/__tests__/widgets/WebcamWidget.test.ts`
- Create: `src/widgets/WebcamWidget.vue`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/widgets/WebcamWidget.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mountWithUI } from '@/__tests__/test-utils'
import WebcamWidget from '@/widgets/WebcamWidget.vue'

describe('WebcamWidget', () => {
  it('shows loading state on mount before stream loads', () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://cam/stream', label: '' },
    })
    expect(wrapper.text()).toContain('Loading')
  })

  it('renders img with correct src when not paused', () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://cam/stream', label: '' },
    })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('http://cam/stream')
  })

  it('shows label overlay when label is set', () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://cam/stream', label: 'Train Room' },
    })
    expect(wrapper.text()).toContain('Train Room')
  })

  it('does not show label overlay when label is empty', () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://cam/stream', label: '' },
    })
    expect(wrapper.find('[data-testid="label"]').exists()).toBe(false)
  })

  it('hides img when paused', async () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://cam/stream', label: '' },
    })
    await wrapper.find('[data-testid="toggle-pause"]').trigger('click')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('shows paused overlay when paused', async () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://cam/stream', label: '' },
    })
    await wrapper.find('[data-testid="toggle-pause"]').trigger('click')
    expect(wrapper.find('[data-icon="i-heroicons-play-circle"]').exists()).toBe(true)
  })

  it('remounts img when resumed', async () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://cam/stream', label: '' },
    })
    const btn = wrapper.find('[data-testid="toggle-pause"]')
    await btn.trigger('click') // pause
    await btn.trigger('click') // resume
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('shows error state after stream error event', async () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://bad/stream', label: '' },
    })
    await wrapper.find('img').trigger('error')
    expect(wrapper.text()).toContain('unavailable')
  })

  it('shows retry button in error state', async () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://bad/stream', label: '' },
    })
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('[data-testid="retry"]').exists()).toBe(true)
  })

  it('resets to loading state after retry', async () => {
    const wrapper = mountWithUI(WebcamWidget, {
      props: { streamUrl: 'http://bad/stream', label: '' },
    })
    await wrapper.find('img').trigger('error')
    await wrapper.find('[data-testid="retry"]').trigger('click')
    expect(wrapper.find('img').exists()).toBe(true)
    expect(wrapper.text()).toContain('Loading')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test src/__tests__/widgets/WebcamWidget.test.ts
```

Expected: FAIL — `Failed to resolve import "@/widgets/WebcamWidget.vue"`

- [ ] **Step 3: Implement `src/widgets/WebcamWidget.vue`**

```vue
<template>
  <div class="relative w-full bg-black overflow-hidden" style="aspect-ratio: 16/9;">
    <!-- Loading overlay -->
    <div
      v-if="loading && !paused && !error"
      class="absolute inset-0 flex items-center justify-center"
    >
      <span class="text-neutral-500 text-xs">Loading...</span>
    </div>

    <!-- Error overlay -->
    <div
      v-if="error"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2"
    >
      <p class="text-red-400 text-xs">Stream unavailable</p>
      <UButton data-testid="retry" size="xs" color="neutral" @click="retry">Retry</UButton>
    </div>

    <!-- Paused overlay -->
    <div
      v-if="paused && !error"
      class="absolute inset-0 flex items-center justify-center"
    >
      <UIcon name="i-heroicons-play-circle" class="w-10 h-10 text-white/30" />
    </div>

    <!-- MJPEG stream -->
    <img
      v-if="!paused && !error"
      :src="streamUrl"
      class="w-full h-full object-contain"
      alt=""
      @load="onLoad"
      @error="onError"
    />

    <!-- Label overlay -->
    <span
      v-if="label"
      data-testid="label"
      class="absolute bottom-8 left-2 text-xs text-white/70 bg-black/50 px-1.5 py-0.5 rounded"
    >{{ label }}</span>

    <!-- Pause / resume button -->
    <button
      data-testid="toggle-pause"
      class="absolute bottom-1 right-1 p-1 rounded bg-black/40 hover:bg-black/70 text-white/60 hover:text-white transition-colors"
      @click="togglePause"
    >
      <UIcon :name="paused ? 'i-heroicons-play' : 'i-heroicons-pause'" class="w-4 h-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  streamUrl?: string
  label?: string
}>()

const paused = ref(false)
const loading = ref(true)
const error = ref(false)

function onLoad() {
  loading.value = false
}

function onError() {
  loading.value = false
  error.value = true
}

function togglePause() {
  if (error.value) return
  paused.value = !paused.value
  if (!paused.value) loading.value = true
}

function retry() {
  error.value = false
  paused.value = false
  loading.value = true
}
</script>
```

- [ ] **Step 4: Run to confirm green**

```bash
npm test src/__tests__/widgets/WebcamWidget.test.ts
```

Expected: PASS — 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/WebcamWidget.vue src/__tests__/widgets/WebcamWidget.test.ts
git commit -m "Add WebcamWidget component"
```

---

## Task 5: Wire into WidgetConfigModal

**Files:**
- Modify: `src/widgets/WidgetConfigModal.vue`

No new tests needed — WidgetConfigModal's existing tests cover modal behaviour; adding an entry to the lookup does not require a separate test.

- [ ] **Step 1: Add webcam to `CONFIG_COMPONENTS` in `src/widgets/WidgetConfigModal.vue`**

Find this block:

```typescript
const CONFIG_COMPONENTS: Record<string, () => Promise<Component>> = {
  'jmri-throttle': () => import('@/widgets/config/ThrottleConfig.vue'),
  'jmri-turnout':  () => import('@/widgets/config/TurnoutConfig.vue'),
  'jmri-light':    () => import('@/widgets/config/LightConfig.vue'),
  'jmri-power':    () => import('@/widgets/config/PowerConfig.vue'),
  'ha-entity':     () => import('@/widgets/config/HaEntityConfig.vue'),
}
```

Replace with:

```typescript
const CONFIG_COMPONENTS: Record<string, () => Promise<Component>> = {
  'jmri-throttle': () => import('@/widgets/config/ThrottleConfig.vue'),
  'jmri-turnout':  () => import('@/widgets/config/TurnoutConfig.vue'),
  'jmri-light':    () => import('@/widgets/config/LightConfig.vue'),
  'jmri-power':    () => import('@/widgets/config/PowerConfig.vue'),
  'ha-entity':     () => import('@/widgets/config/HaEntityConfig.vue'),
  'webcam':        () => import('@/widgets/config/WebcamConfig.vue'),
}
```

- [ ] **Step 2: Commit**

```bash
git add src/widgets/WidgetConfigModal.vue
git commit -m "Wire WebcamConfig into WidgetConfigModal"
```

---

## Task 6: Full verification and release prep

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass. Count should be 31 files, ~209 tests (29 existing + 2 new files + 18 new tests: 6 WebcamConfig + 10 WebcamWidget + 2 registry for webcam type).

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Update CLAUDE.md version and test count**

In `CLAUDE.md`, update:

```
### Current Version
v8.4.0 — Webcam widget (MJPEG stream, pause/resume)
```

And in the Component Test Suite section:
```
31 test files, 207 tests
```

- [ ] **Step 4: Commit CLAUDE.md**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md for v8.4.0"
```

- [ ] **Step 5: Bump version, tag, push, release**

```bash
# Bump version
# Edit package.json: "version": "8.4.0"
git add package.json
git commit -m "Release v8.4.0: add webcam widget"

git tag -a v8.4.0 -m "Release v8.4.0: add webcam widget"
git push origin add-webcam-widget
git push --tags
```

Then open a PR from `add-webcam-widget` → `main` and merge, or merge locally:

```bash
git checkout main
git merge --no-ff add-webcam-widget -m "Merge add-webcam-widget: webcam widget v8.4.0"
git push
```

Then create the GitHub release:

```bash
gh release create v8.4.0 \
  --title "v8.4.0: Webcam widget" \
  --notes "### New feature

**Webcam widget** — display a live MJPEG stream from any local IP camera on a dashboard tab.

- Drag from the widget palette like any other widget (no plugin connection required)
- Config: label + stream URL (Amcrest format: \`http://user:pass@ip/cgi-bin/mjpg/video.cgi?channel=0&subtype=1\`)
- Pause/resume button disconnects and reconnects the stream
- Loading, error, and paused states with Retry button
- 16:9 aspect ratio, default 4×4 grid, minimum 3×3

### Tests

31 test files, 207 tests total"
```
