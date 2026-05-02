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

    <div v-if="rosterOptions.length > 0">
      <p class="text-xs text-neutral-500 mb-1">Or pick from roster:</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="entry in rosterOptions"
          :key="entry.address"
          class="px-2 py-1 text-xs rounded border transition-colors"
          :class="selectedAddress === entry.address
            ? 'border-blue-500 bg-blue-500/20 text-blue-300'
            : 'border-white/20 bg-white/5 text-neutral-300 hover:border-white/40'"
          @click="selectedAddress = entry.address"
        >
          {{ entry.name }} ({{ entry.address }})
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useJmri } from '@/plugins/jmri'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [config: Record<string, unknown>] }>()

const { locoRoster } = useJmri()

const selectedAddress = ref<number>((props.config.address as number) ?? 0)
const addressStr = computed({
  get: () => selectedAddress.value > 0 ? String(selectedAddress.value) : '',
  set: (v) => { const n = parseInt(v); if (!isNaN(n)) selectedAddress.value = n },
})

const rosterOptions = computed(() => locoRoster.value.slice(0, 20))

watch(selectedAddress, (addr) => {
  emit('update', { address: addr })
}, { immediate: true })
</script>
