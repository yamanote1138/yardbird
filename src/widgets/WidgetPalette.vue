<template>
  <transition
    enter-active-class="transition-all duration-200"
    enter-from-class="-translate-x-full opacity-0"
    enter-to-class="translate-x-0 opacity-100"
    leave-active-class="transition-all duration-200"
    leave-from-class="translate-x-0 opacity-100"
    leave-to-class="-translate-x-full opacity-0"
  >
    <div
      v-if="editMode"
      class="w-44 flex-shrink-0 bg-neutral-900 border-r border-white/10 overflow-y-auto"
    >
      <div class="p-2 border-b border-white/10">
        <p class="text-xs text-neutral-400 font-medium uppercase tracking-wider">Widgets</p>
      </div>

      <div class="p-2 space-y-1.5">
        <template v-for="def in availableWidgets" :key="def.type">
          <!-- gs-w/h (no data- prefix) are read by Gridstack on drop to size the new item -->
          <div
            class="ybw-palette-item flex items-center gap-2 px-2 py-2 rounded cursor-grab active:cursor-grabbing
                   bg-neutral-800 hover:bg-neutral-700 border border-white/10 hover:border-white/20
                   text-white/70 hover:text-white transition-colors select-none"
            :gs-w="def.defaultSize.w"
            :gs-h="def.defaultSize.h"
            :gs-min-w="def.minSize.w"
            :gs-min-h="def.minSize.h"
            @pointerdown="setDragging(def.type)"
          >
            <UIcon :name="def.icon" class="w-4 h-4 flex-shrink-0" />
            <span class="text-xs truncate">{{ def.name }}</span>
          </div>
        </template>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, watch, onUpdated } from 'vue'
import { GridStack } from 'gridstack'
import { useEditMode } from '@/composables/useEditMode'
import { useJmri } from '@/plugins/jmri'
import { useHomeAssistant } from '@/plugins/homeassistant'
import { WIDGET_REGISTRY } from '@/widgets/registry'
import { setDraggingType } from '@/widgets/dragState'
import type { WidgetType } from '@/core/types'

const { editMode } = useEditMode()
const { isConnected: jmriConnected } = useJmri()
const ha = useHomeAssistant()

const availableWidgets = computed(() =>
  Object.values(WIDGET_REGISTRY).filter(def => {
    if (def.plugin === 'jmri') return jmriConnected.value
    if (def.plugin === 'homeassistant') return ha.isConnected.value
    return true
  })
)

function setDragging(type: WidgetType) {
  setDraggingType(type)
}

let dragInSetup = false

function setupDragIn() {
  if (dragInSetup) return
  const items = document.querySelectorAll('.ybw-palette-item')
  if (!items.length) return
  dragInSetup = true
  GridStack.setupDragIn('.ybw-palette-item', {
    helper: 'clone',
    appendTo: 'body',
  })
}

// flush:'post' runs after Vue has updated the DOM, so palette items exist when we query them
watch(editMode, (isEdit) => {
  if (isEdit) setupDragIn()
  else dragInSetup = false
}, { flush: 'post' })

// Belt-and-suspenders: also try on every render update
onUpdated(() => {
  if (editMode.value && !dragInSetup) setupDragIn()
})
</script>
