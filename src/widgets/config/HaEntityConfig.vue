<template>
  <div class="space-y-2">
    <label class="text-sm text-neutral-300 block mb-1">Room control entity</label>
    <div v-if="options.length > 0" class="flex flex-col gap-1 max-h-48 overflow-y-auto">
      <button
        v-for="e in options"
        :key="e.entityId"
        class="px-3 py-2 text-sm rounded border text-left transition-colors"
        :class="selected === e.entityId
          ? 'border-blue-500 bg-blue-500/20 text-blue-300'
          : 'border-white/20 bg-white/5 text-neutral-300 hover:border-white/40'"
        @click="selected = e.entityId"
      >
        {{ e.friendlyName }}
        <span class="text-xs text-neutral-500 ml-1">({{ e.domain }})</span>
      </button>
    </div>
    <div v-else>
      <UInput v-model="selected" placeholder="entity_id (e.g. light.desk)" class="w-full" />
      <p class="text-xs text-neutral-500 mt-1">Home Assistant not connected — enter entity ID manually</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useHomeAssistant } from '@/plugins/homeassistant'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [config: Record<string, unknown>] }>()

const ha = useHomeAssistant()

const selected = ref<string>((props.config.entityId as string) ?? '')
const options = computed(() => [
  ...ha.lights.value,
  ...ha.switches.value,
].sort((a, b) => a.friendlyName.localeCompare(b.friendlyName)))

watch(selected, (entityId) => {
  emit('update', { entityId })
}, { immediate: true })
</script>
