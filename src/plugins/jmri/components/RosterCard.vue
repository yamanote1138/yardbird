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
import { useJmri } from '@/plugins/jmri'
import { PowerState } from 'jmri-client'
import type { RosterEntry } from '@/types/jmri'
import LocomotiveHeader from './LocomotiveHeader.vue'

const props = defineProps<{
  entry: RosterEntry
  commandStation?: string
}>()

const { isConnected, power, powerByPrefix, acquireThrottle } = useJmri()

const isAcquiring = ref(false)

const stationPower = computed(() => {
  if (props.commandStation !== undefined) {
    return powerByPrefix.value.get(props.commandStation) ?? PowerState.UNKNOWN
  }
  return power.value
})

const acquireDisabled = computed(() =>
  !isConnected.value || stationPower.value !== PowerState.ON || isAcquiring.value
)

async function onAcquire() {
  isAcquiring.value = true
  try {
    await acquireThrottle(props.entry.address, props.commandStation)
  } finally {
    isAcquiring.value = false
  }
}
</script>
