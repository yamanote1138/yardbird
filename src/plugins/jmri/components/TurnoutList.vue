<template>
  <div>
    <!-- Turnouts Section -->
    <div v-if="sortedTurnouts.length > 0">
      <div class="flex flex-wrap gap-2 md:gap-3">
        <UButton
          v-for="turnout in sortedTurnouts"
          :key="turnout.name"
          size="md"
          :color="getTurnoutButtonColor(turnout)"
          :loading="changingTurnouts.has(turnout.name)"
          :disabled="!isConnected"
          @click="handleToggle(turnout.name)"
        >
          <template #leading>
            <UIcon v-if="!changingTurnouts.has(turnout.name)" :name="getTurnoutIcon(turnout.state)" />
          </template>
          {{ turnout.userName || turnout.name }}
        </UButton>
      </div>
    </div>

    <!-- Empty State -->
    <UAlert
      v-else-if="isConnected"
      color="info"
      icon="i-heroicons-information-circle"
      title="No turnouts configured. Add turnouts in JMRI to see them here."
      class="mt-3 text-sm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri } from '@/plugins/jmri'
import { TurnoutState } from '@/types/jmri'
import type { TurnoutData } from '@/types/jmri'

const { turnouts, isConnected, toggleTurnout } = useJmri()

const changingTurnouts = ref<Set<string>>(new Set())

// Sort turnouts by name (system name or user name)
const sortedTurnouts = computed(() => {
  return [...turnouts.value].sort((a, b) => {
    const aName = a.userName || a.name
    const bName = b.userName || b.name
    return aName.localeCompare(bName)
  })
})

function getTurnoutButtonColor(turnout: TurnoutData): string {
  switch (turnout.state) {
    case TurnoutState.CLOSED:
      return 'primary'
    case TurnoutState.THROWN:
      return 'info'
    case TurnoutState.INCONSISTENT:
      return 'error'
    case TurnoutState.UNKNOWN:
    default:
      return 'warning'
  }
}

function getTurnoutIcon(state: TurnoutState): string {
  switch (state) {
    case TurnoutState.CLOSED:
      return 'i-heroicons-arrows-right-left'
    case TurnoutState.THROWN:
      return 'i-mdi-shuffle-variant'
    case TurnoutState.INCONSISTENT:
      return 'i-heroicons-exclamation-triangle'
    case TurnoutState.UNKNOWN:
    default:
      return 'i-heroicons-question-mark-circle'
  }
}

async function handleToggle(name: string) {
  changingTurnouts.value.add(name)
  try {
    await toggleTurnout(name)
  } finally {
    // Add small delay so user sees feedback before state updates
    setTimeout(() => {
      changingTurnouts.value.delete(name)
    }, 300)
  }
}
</script>
