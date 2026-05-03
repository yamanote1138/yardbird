<template>
  <div class="space-y-3">
    <div>
      <label class="text-sm text-neutral-300 block mb-1">Label</label>
      <UInput v-model="label" placeholder="e.g. DCC or Trams" class="w-full" />
    </div>
    <div>
      <label class="text-sm text-neutral-300 block mb-1">Connection prefix</label>
      <div v-if="zoneOptions.length > 0" class="flex flex-wrap gap-1.5">
        <button
          v-for="z in zoneOptions"
          :key="z.prefix"
          class="px-2 py-1 text-xs rounded border transition-colors"
          :class="prefix === z.prefix
            ? 'border-blue-500 bg-blue-500/20 text-blue-300'
            : 'border-white/20 bg-white/5 text-neutral-300 hover:border-white/40'"
          @click="prefix = z.prefix; if (!label) label = z.name"
        >
          {{ z.name }} <span class="opacity-60">({{ z.prefix || 'default' }})</span>
        </button>
      </div>
      <div v-else>
        <UInput v-model="prefix" placeholder="Leave empty for default connection" class="w-full" />
        <p class="text-xs text-neutral-500 mt-1">Connect to JMRI to see available zones</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useJmri } from '@/plugins/jmri'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [config: Record<string, unknown>] }>()

const { commandStations } = useJmri()

const label  = ref<string>((props.config.label  as string) ?? '')
const prefix = ref<string>((props.config.prefix as string) ?? '')

const zoneOptions = commandStations

watch([label, prefix], ([l, p]) => {
  emit('update', { label: l, prefix: p })
}, { immediate: true })
</script>
