<template>
  <!-- Gridstack container — Vue renders items, Gridstack manages positions -->
  <div class="relative mt-2">
    <!-- Empty state overlay (pointer-events-none so the grid receives drops) -->
    <div
      v-if="editMode && renderedWidgets.length === 0"
      class="absolute inset-0 flex items-center justify-center border-2 border-dashed border-white/10 rounded-lg text-neutral-500 text-sm pointer-events-none z-10"
    >
      Drag widgets from the palette to add them here
    </div>

    <div ref="gridEl" class="grid-stack">
    <div
      v-for="widget in renderedWidgets"
      :key="widget.id"
      class="grid-stack-item"
      :gs-id="widget.id"
      :gs-x="initialPos[widget.id]?.x ?? 0"
      :gs-y="initialPos[widget.id]?.y ?? 0"
      :gs-w="initialPos[widget.id]?.w ?? 4"
      :gs-h="initialPos[widget.id]?.h ?? 3"
      :gs-min-w="getDef(widget.type).minSize.w"
      :gs-min-h="getDef(widget.type).minSize.h"
    >
      <div class="grid-stack-item-content">
        <WidgetFrame
          :widget-id="widget.id"
          :widget-type="widget.type"
          :widget-config="widget.config"
          @configure="$emit('configure', $event)"
          @remove="handleRemove"
        />
      </div>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { GridStack } from 'gridstack'
import type { GridStackNode } from 'gridstack'
import { useEditMode } from '@/composables/useEditMode'
import { useConfig } from '@/core/useConfig'
import { getWidgetDef } from '@/widgets/registry'
import { draggingWidgetType, setDraggingType } from '@/widgets/dragState'
import WidgetFrame from '@/widgets/WidgetFrame.vue'
import type { TabConfig, WidgetInstance, WidgetType } from '@/core/types'

const props = defineProps<{ tab: TabConfig }>()

const emit = defineEmits<{
  configure: [widgetId: string]
  'configure-new': [widget: WidgetInstance]
}>()

const { editMode } = useEditMode()
const cfg = useConfig()

const gridEl = ref<HTMLElement>()
let grid: GridStack | null = null

// Snapshot of widgets to render — updated only on add/remove (not position sync).
// Positions are stored in initialPos (read once on render; Gridstack owns them after).
const renderedWidgets = ref<WidgetInstance[]>([])
const initialPos = ref<Record<string, { x: number; y: number; w: number; h: number }>>({})

function getDef(type: WidgetType) {
  return getWidgetDef(type)
}

function snapshotWidgets(widgets: WidgetInstance[]) {
  renderedWidgets.value = [...widgets]
  const pos: Record<string, { x: number; y: number; w: number; h: number }> = {}
  for (const w of widgets) pos[w.id] = { ...w.grid }
  initialPos.value = pos
}

// ── Grid lifecycle ─────────────────────────────────────────────────────────────

function initGrid() {
  const el = gridEl.value
  if (!el) return

  grid = GridStack.init(
    {
      column: 12,
      cellHeight: 80,
      minRow: 3,
      handle: '.gs-drag-handle',
      acceptWidgets: '.ybw-palette-item',
      float: true,
      disableDrag: !editMode.value,
      disableResize: !editMode.value,
      animate: true,
    },
    el,
  )

  grid.on('change', (_: Event, nodes: GridStackNode[]) => {
    syncPositions(nodes)
  })

  grid.on('dropped', (_: Event, _prev: GridStackNode | undefined, node: GridStackNode) => {
    handlePaletteDrop(node)
  })
}

function destroyGrid() {
  if (!grid) return
  try { grid.destroy(false) } catch {}
  grid = null
}

onMounted(() => {
  snapshotWidgets(props.tab.widgets)
  nextTick(initGrid)
})

onBeforeUnmount(destroyGrid)

watch(() => props.tab.id, () => {
  destroyGrid()
  snapshotWidgets(props.tab.widgets)
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

// When tab.widgets gains new items (committed from config modal), adopt them.
watch(
  () => props.tab.widgets.length,
  (newLen, oldLen) => {
    if (newLen <= oldLen) return
    const currentIds = new Set(renderedWidgets.value.map(w => w.id))
    const added = props.tab.widgets.filter(w => !currentIds.has(w.id))
    for (const widget of added) {
      initialPos.value[widget.id] = { ...widget.grid }
      renderedWidgets.value = [...renderedWidgets.value, widget]
      nextTick(() => {
        // Tell Gridstack about the newly rendered DOM element
        const el = gridEl.value?.querySelector(`[gs-id="${widget.id}"]`) as HTMLElement | null
        if (el && grid) grid.makeWidget(el)
      })
    }
  },
)

// ── Position sync ─────────────────────────────────────────────────────────────

function syncPositions(nodes: GridStackNode[]) {
  const tabs = cfg.tabs.value.map(t => {
    if (t.id !== props.tab.id) return t
    return {
      ...t,
      widgets: t.widgets.map(w => {
        const node = nodes.find(n => n.id === w.id)
        if (!node) return w
        return { ...w, grid: { x: node.x ?? w.grid.x, y: node.y ?? w.grid.y, w: node.w ?? w.grid.w, h: node.h ?? w.grid.h } }
      }),
    }
  })
  cfg.saveTabs(tabs)
}

// ── Palette drop ──────────────────────────────────────────────────────────────

function handlePaletteDrop(node: GridStackNode) {
  const widgetType = draggingWidgetType as WidgetType | null
  setDraggingType(null)

  if (!widgetType) {
    if (node.el) grid?.removeWidget(node.el, true)
    return
  }

  const def = getWidgetDef(widgetType)
  const newWidget: WidgetInstance = {
    id: crypto.randomUUID(),
    type: widgetType,
    grid: {
      x: node.x ?? 0,
      y: node.y ?? 0,
      w: node.w ?? def.defaultSize.w,
      h: node.h ?? def.defaultSize.h,
    },
    config: {},
  }

  // Remove Gridstack's placeholder — commitWidget will add the real item via Vue + makeWidget
  if (node.el) grid?.removeWidget(node.el, true)

  if (def.hasConfig) {
    emit('configure-new', newWidget)
  } else {
    commitWidget(newWidget)
  }
}

// ── Widget add / remove ───────────────────────────────────────────────────────

function commitWidget(widget: WidgetInstance) {
  // 1. Persist to config
  const tabs = cfg.tabs.value.map(t => {
    if (t.id !== props.tab.id) return t
    return { ...t, widgets: [...t.widgets, widget] }
  })
  cfg.saveTabs(tabs)
  // 2. Add to local render state; the watch on tab.widgets.length will adopt the new DOM el
  initialPos.value[widget.id] = { ...widget.grid }
  renderedWidgets.value = [...renderedWidgets.value, widget]
  nextTick(() => {
    const el = gridEl.value?.querySelector(`[gs-id="${widget.id}"]`) as HTMLElement | null
    if (el && grid) grid.makeWidget(el)
  })
}

function handleRemove(widgetId: string) {
  const node = grid?.engine.nodes.find(n => n.id === widgetId)
  if (node?.el) grid?.removeWidget(node.el, false)
  renderedWidgets.value = renderedWidgets.value.filter(w => w.id !== widgetId)
  const tabs = cfg.tabs.value.map(t => {
    if (t.id !== props.tab.id) return t
    return { ...t, widgets: t.widgets.filter(w => w.id !== widgetId) }
  })
  cfg.saveTabs(tabs)
}

defineExpose({ commitWidget })
</script>
