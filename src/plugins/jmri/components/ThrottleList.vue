<template>
  <div>
    <!-- All Locomotives -->
    <div v-if="sortedRoster.length > 0">
      <p v-if="power === PowerState.ON" class="text-neutral-400 mb-1 text-xs">
        <UIcon name="i-heroicons-hand-raised" /> Tap to acquire/release
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-0 md:gap-3">
        <div
          v-for="entry in sortedRoster"
          :key="'loco-' + entry.address"
        >
          <!-- Show ThrottleCard if acquired, otherwise RosterCard -->
          <ThrottleCard v-if="jmriState.throttles.has(entry.address)" :throttle="jmriState.throttles.get(entry.address)!" />
          <RosterCard v-else :entry="entry" />
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <UAlert
      v-else
      color="info"
      icon="i-heroicons-information-circle"
      title="No locomotives loaded. Make sure JMRI is running and has locomotives in the roster."
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useJmri } from '@/plugins/jmri'
import { PowerState } from 'jmri-client'
import ThrottleCard from './ThrottleCard.vue'
import RosterCard from './RosterCard.vue'

const { locoRoster, jmriState, power } = useJmri()

// Sort roster to show acquired throttles first (most recent at top)
const sortedRoster = computed(() => {
  return [...locoRoster.value].sort((a, b) => {
    const aAcquired = jmriState.value.throttles.has(a.address)
    const bAcquired = jmriState.value.throttles.has(b.address)

    // Both acquired - sort by most recent first
    if (aAcquired && bAcquired) {
      const aThrottle = jmriState.value.throttles.get(a.address)!
      const bThrottle = jmriState.value.throttles.get(b.address)!
      return bThrottle.acquiredAt - aThrottle.acquiredAt
    }

    // Only a acquired - a comes first
    if (aAcquired) return -1

    // Only b acquired - b comes first
    if (bAcquired) return 1

    // Neither acquired - maintain original roster order
    return 0
  })
})
</script>
