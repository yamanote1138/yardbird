<template>
  <!-- Empty state in edit mode -->
  <div
    v-if="editMode && renderedWidgets.length === 0"
    class="min-h-[200px] flex items-center justify-center border-2 border-dashed border-white/10 rounded-lg text-neutral-500 text-sm"
  >
    Drag widgets from the palette to add them here
  </div>

  <div ref="gridEl" class="grid-stack" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue'
import { createApp, type App } from 'vue'
import { GridStack } from 'gridstack'
import type { GridStackNode } from 'gridstack'
import { useEditMode } from '@/composables/useEditMode'
import { useConfig } from '@/core/useConfig'
import { getWidgetDef } from '@/widgets/registry'
import WidgetFrame from '@/widgets/WidgetFrame.vue'
import type { TabConfig, WidgetInstance, WidgetType } from '@/core/types'

// ── Nuxt UI provider for sub-apps ─────────────────────────────────────────────
// We need to pass the Nuxt UI plugin to each sub-app we mount inside grid items.
// Import the app-level plugin list from main.ts is not practical; instead we
// collect providers from the current Vue instance and forward them.
import { getCurrentInstance } from 'vue'

const props = defineProps<{ tab: TabConfig }>()

const emit = defineEmits<{
  configure: [widgetId: string]
  'configure-new': [widget: WidgetInstance]
}>()

const { editMode } = useEditMode()
const cfg = useConfig()

const gridEl = ref<HTMLElement>()
let grid: GridStack | null = null

// Snapshot of widgets rendered in the grid — updated only on add/remove,
// never on position sync (Gridstack owns position after init).
const renderedWidgets = ref<WidgetInstance[]>([])

// Vue sub-apps mounted inside grid items (keyed by widget id)
const widgetApps = new Map<string, App>()

// Capture the current instance's appContext to forward plugins to sub-apps
const instance = getCurrentInstance()

function mountWidgetApp(contentEl: Element, widget: WidgetInstance) {
  const app = createApp(WidgetFrame, {
    widgetId: widget.id,
    widgetType: widget.type,
    widgetConfig: widget.config,
    onConfigure: (id: string) => emit('configure', id),
    onRemove: (id: string) => handleRemove(id),
  })
  if (instance?.appContext?.app) {
    // Forward plugins registered on the root app
    const rootApp = instance.appContext.app as any
    app._context = { ...rootApp._context, app }
  }
  app.mount(contentEl)
  widgetApps.set(widget.id, app)
}

function unmountWidgetApp(widgetId: string) {
  widgetApps.get(widgetId)?.unmount()
  widgetApps.delete(widgetId)
}

function initGrid() {
  const el = gridEl.value
  if (!el) return

  grid = GridStack.init(
    {
      column: 12,
      cellHeight: 80,
      handle: '.gs-drag-handle',
      acceptWidgets: true,
      float: true,
      disableDrag: !editMode.value,
      disableResize: !editMode.value,
      animate: true,
    },
    el,
  )

  // Add existing widgets
  for (const widget of renderedWidgets.value) {
    addGridWidget(widget)
  }

  grid.on('change', (_event: Event, nodes: GridStackNode[]) => {
    syncPositions(nodes)
  })

  grid.on('added', (_event: Event, nodes: GridStackNode[]) => {
    handlePaletteDrop(nodes)
  })
}

function addGridWidget(widget: WidgetInstance) {
  if (!grid) return
  const def = getWidgetDef(widget.type)
  const el = grid.addWidget({
    id: widget.id,
    x: widget.grid.x,
    y: widget.grid.y,
    w: widget.grid.w,
    h: widget.grid.h,
    minW: def.minSize.w,
    minH: def.minSize.h,
    content: `<div class="h-full w-full"></div>`,
  })
  const contentEl = el.querySelector('.grid-stack-item-content')
  if (contentEl) {
    mountWidgetApp(contentEl, widget)
  }
}

function destroyGrid() {
  if (!grid) return
  for (const id of widgetApps.keys()) {
    unmountWidgetApp(id)
  }
  try { grid.destroy(false) } catch {}
  grid = null
}

function syncPositions(nodes: GridStackNode[]) {
  const tabs = cfg.tabs.value.map(t => {
    if (t.id !== props.tab.id) return t
    const updatedWidgets = t.widgets.map(w => {
      const node = nodes.find(n => n.id === w.id)
      if (!node) return w
      return {
        ...w,
        grid: {
          x: node.x ?? w.grid.x,
          y: node.y ?? w.grid.y,
          w: node.w ?? w.grid.w,
          h: node.h ?? w.grid.h,
        },
      }
    })
    return { ...t, widgets: updatedWidgets }
  })
  cfg.saveTabs(tabs)
}

function handlePaletteDrop(nodes: GridStackNode[]) {
  for (const node of nodes) {
    const el = node.el as HTMLElement | undefined
    const widgetType = el?.dataset.gsWidgetType as WidgetType | undefined
    if (!widgetType) continue

    // Remove the placeholder Gridstack created from the palette clone
    grid?.removeWidget(el!, true)

    const def = getWidgetDef(widgetType)
    const newWidget: WidgetInstance = {
      id: crypto.randomUUID(),
      type: widgetType,
      grid: {
        x: node.x ?? 0,
        y: node.y ?? 0,
        w: def.defaultSize.w,
        h: def.defaultSize.h,
      },
      config: {},
    }

    if (def.hasConfig) {
      // Store the pending widget; Phase 6 will open the config modal.
      // For now, add with empty config so the widget appears immediately.
      emit('configure-new', newWidget)
    } else {
      commitWidget(newWidget)
    }
  }
}

function commitWidget(widget: WidgetInstance) {
  renderedWidgets.value.push(widget)
  const tabs = cfg.tabs.value.map(t => {
    if (t.id !== props.tab.id) return t
    return { ...t, widgets: [...t.widgets, widget] }
  })
  cfg.saveTabs(tabs)
  nextTick(() => addGridWidget(widget))
}

function handleRemove(widgetId: string) {
  const el = grid?.engine.nodes.find(n => n.id === widgetId)?.el
  if (el) grid?.removeWidget(el, false)
  unmountWidgetApp(widgetId)
  renderedWidgets.value = renderedWidgets.value.filter(w => w.id !== widgetId)

  const tabs = cfg.tabs.value.map(t => {
    if (t.id !== props.tab.id) return t
    return { ...t, widgets: t.widgets.filter(w => w.id !== widgetId) }
  })
  cfg.saveTabs(tabs)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  renderedWidgets.value = [...props.tab.widgets]
  nextTick(initGrid)
})

onBeforeUnmount(() => {
  destroyGrid()
})

watch(() => props.tab.id, () => {
  destroyGrid()
  renderedWidgets.value = [...props.tab.widgets]
  nextTick(initGrid)
})

watch(editMode, (isEdit) => {
  if (!grid) return
  if (isEdit) {
    grid.enable()
    grid.enableMove(true)
    grid.enableResize(true)
  } else {
    grid.disable()
  }
})

// When widgets are added externally (e.g., from config modal confirmation)
// add them to the running grid
watch(
  () => props.tab.widgets.length,
  (newLen) => {
    const currentIds = new Set(renderedWidgets.value.map(w => w.id))
    const added = props.tab.widgets.filter(w => !currentIds.has(w.id))
    for (const widget of added) {
      renderedWidgets.value.push(widget)
      nextTick(() => addGridWidget(widget))
    }
  },
)

// Public: add a widget to this canvas (called by WidgetPalette in Phase 5)
function addWidget(widget: WidgetInstance) {
  renderedWidgets.value.push(widget)
  nextTick(() => addGridWidget(widget))
}

defineExpose({ addWidget, commitWidget })
</script>
