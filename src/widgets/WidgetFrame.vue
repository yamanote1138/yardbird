<template>
  <div class="widget-frame relative h-full w-full overflow-hidden rounded-lg" :class="editMode ? 'ring-1 ring-white/20' : ''">
    <!-- Edit mode overlay -->
    <div
      v-if="editMode"
      class="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-1 px-2 py-1 bg-neutral-900/90 border-b border-white/10"
    >
      <!-- Drag handle (Gridstack uses this element) -->
      <div class="gs-drag-handle flex items-center gap-1.5 cursor-grab active:cursor-grabbing flex-1 min-w-0">
        <UIcon name="i-heroicons-bars-2" class="w-4 h-4 text-white/40 flex-shrink-0" />
        <span class="text-xs text-white/50 truncate">{{ def.name }}</span>
      </div>
      <!-- Config + delete -->
      <div class="flex items-center gap-0.5 flex-shrink-0">
        <button
          v-if="def.hasConfig"
          class="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          title="Configure widget"
          @click.stop="$emit('configure', widgetId)"
        >
          <UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title="Remove widget"
          @click.stop="$emit('remove', widgetId)"
        >
          <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Widget content -->
    <div class="h-full overflow-auto @container" :class="editMode ? 'pt-7' : ''">
      <Suspense>
        <component
          :is="resolvedComponent"
          v-if="resolvedComponent"
          v-bind="widgetConfig"
        />
        <template #fallback>
          <div class="flex items-center justify-center h-full text-neutral-600 text-xs">Loading...</div>
        </template>
      </Suspense>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, computed } from 'vue'
import { useEditMode } from '@/composables/useEditMode'
import { getWidgetDef } from '@/widgets/registry'
import type { WidgetType } from '@/core/types'

const props = defineProps<{
  widgetId: string
  widgetType: WidgetType
  widgetConfig: Record<string, unknown>
}>()

defineEmits<{
  configure: [widgetId: string]
  remove: [widgetId: string]
}>()

const { editMode } = useEditMode()

const def = computed(() => getWidgetDef(props.widgetType))

const resolvedComponent = computed(() =>
  defineAsyncComponent(def.value.component)
)
</script>
