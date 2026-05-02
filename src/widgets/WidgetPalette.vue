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
          <!-- Palette item — Gridstack picks these up via setupDragIn -->
          <div
            class="ybw-palette-item flex items-center gap-2 px-2 py-2 rounded cursor-grab active:cursor-grabbing
                   bg-neutral-800 hover:bg-neutral-700 border border-white/10 hover:border-white/20
                   text-white/70 hover:text-white transition-colors select-none"
            :data-gs-widget-type="def.type"
            :data-gs-w="def.defaultSize.w"
            :data-gs-h="def.defaultSize.h"
            :data-gs-min-w="def.minSize.w"
            :data-gs-min-h="def.minSize.h"
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
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { GridStack } from 'gridstack'
import { useEditMode } from '@/composables/useEditMode'
import { useJmri } from '@/plugins/jmri'
import { useHomeAssistant } from '@/plugins/homeassistant'
import { WIDGET_REGISTRY } from '@/widgets/registry'

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

let dragInSetup = false

function setupDragIn() {
  if (dragInSetup) return
  dragInSetup = true
  GridStack.setupDragIn('.ybw-palette-item', {
    helper: 'clone',
    appendTo: 'body',
  })
}

function teardownDragIn() {
  dragInSetup = false
  // Gridstack doesn't expose a teardown for setupDragIn, but removing
  // the class from elements is sufficient since the selector won't match.
}

watch(editMode, (isEdit) => {
  if (isEdit) setupDragIn()
  else teardownDragIn()
}, { immediate: true })

onMounted(() => {
  if (editMode.value) setupDragIn()
})

onBeforeUnmount(() => {
  teardownDragIn()
})
</script>
