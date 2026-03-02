<template>
  <div>
    <!-- Turnouts Section -->
    <div v-if="sortedTurnouts.length > 0">
      <h5 class="text-light mb-2 mt-3 mt-sm-4">
        <i class="fas fa-code-branch"></i> Turnouts
      </h5>
      <div class="d-flex flex-wrap gap-2">
        <button
          v-for="turnout in sortedTurnouts"
          :key="turnout.name"
          type="button"
          class="btn btn-sm"
          :class="getTurnoutButtonClass(turnout)"
          @click="handleToggle(turnout.name)"
          :disabled="controlsDisabled || changingTurnouts.has(turnout.name)"
        >
          <i v-if="!changingTurnouts.has(turnout.name)" class="fas" :class="getTurnoutIcon(turnout.state)"></i>
          <i v-else class="fas fa-spinner fa-spin"></i>
          <span class="ms-1">{{ turnout.userName || turnout.name }}</span>
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="isConnected" class="alert alert-info mt-3 small">
      <i class="fas fa-info-circle"></i>
      No turnouts configured. Add turnouts in JMRI to see them here.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri } from '@/composables/useJmri'
import { PowerState } from 'jmri-client'
import { TurnoutState } from '@/types/jmri'
import type { TurnoutData } from '@/types/jmri'

const { turnouts, isConnected, power, toggleTurnout } = useJmri()

const changingTurnouts = ref<Set<string>>(new Set())

// Disable controls when not connected or power is off
const controlsDisabled = computed(() => {
  return !isConnected.value || power.value !== PowerState.ON
})

// Sort turnouts by name (system name or user name)
const sortedTurnouts = computed(() => {
  return [...turnouts.value].sort((a, b) => {
    const aName = a.userName || a.name
    const bName = b.userName || b.name
    return aName.localeCompare(bName)
  })
})

function getTurnoutButtonClass(turnout: TurnoutData): string {
  switch (turnout.state) {
    case TurnoutState.CLOSED:
      return 'btn-primary'
    case TurnoutState.THROWN:
      return 'btn-info'
    case TurnoutState.INCONSISTENT:
      return 'btn-danger'
    case TurnoutState.UNKNOWN:
    default:
      return 'btn-warning'
  }
}

function getTurnoutIcon(state: TurnoutState): string {
  switch (state) {
    case TurnoutState.CLOSED:
      return 'fa-right-left'
    case TurnoutState.THROWN:
      return 'fa-shuffle'
    case TurnoutState.INCONSISTENT:
      return 'fa-triangle-exclamation'
    case TurnoutState.UNKNOWN:
    default:
      return 'fa-circle-question'
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
