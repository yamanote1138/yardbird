<template>
  <UCard class="mb-2 sm:mb-3" :ui="{ body: 'py-2 sm:py-3' }">
    <LocomotiveHeader
      :name="entry.name"
      :road="entry.road"
      :number="entry.number"
      :thumbnail-url="entry.thumbnailUrl"
      :disabled="acquireDisabled"
      :compact="true"
      @click="onAcquire"
    >
      <template #status>
        <div v-if="isAcquiring" class="text-amber-400 text-sm mt-1">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin" /> Acquiring...
        </div>
      </template>
    </LocomotiveHeader>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri } from '@/composables/useJmri'
import { PowerState } from 'jmri-client'
import type { RosterEntry } from '@/types/jmri'
import LocomotiveHeader from './LocomotiveHeader.vue'

const props = defineProps<{
  entry: RosterEntry
}>()

const { isConnected, power, acquireThrottle } = useJmri()

const isAcquiring = ref(false)

// Disable acquire button when not connected or power is off
const acquireDisabled = computed(() => {
  return !isConnected.value || power.value !== PowerState.ON || isAcquiring.value
})

async function onAcquire() {
  isAcquiring.value = true
  try {
    await acquireThrottle(props.entry.address)
  } finally {
    isAcquiring.value = false
  }
}
</script>
