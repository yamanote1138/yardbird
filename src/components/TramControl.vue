<template>
  <div>
    <!-- DCC-EX Connection Status -->
    <UAlert
      v-if="dccex.connectionState.value === 'connecting'"
      color="info"
      icon="i-heroicons-arrow-path"
      title="Connecting to DCC-EX..."
      class="mb-3"
    />
    <div v-else-if="!dccex.isConnected.value" class="flex items-center gap-2 mb-3">
      <UAlert
        color="warning"
        icon="i-heroicons-exclamation-triangle"
        title="DCC-EX not connected"
        class="flex-1"
      />
      <UButton size="sm" color="warning" variant="outline" @click="dccex.retry()">
        <template #leading>
          <UIcon name="i-heroicons-arrow-path" />
        </template>
        Retry
      </UButton>
    </div>

    <!-- DCC-EX Power Control -->
    <div class="flex items-center gap-2 mb-3">
      <UButton
        :color="powerButtonColor"
        @click="togglePower"
        :disabled="!dccex.isConnected.value || isPowerBusy"
      >
        <template #leading>
          <UIcon :name="powerButtonIcon" />
        </template>
        DCC-EX: {{ powerButtonText }}
      </UButton>
    </div>

    <!-- Track Controls -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
      <UCard
        v-for="config in TRAM_CONFIGS"
        :key="config.address"
        class="mb-0"
        :ui="{ body: 'py-2 sm:py-3' }"
      >
        <!-- Track Header -->
        <div class="mb-2 sm:mb-3">
          <LocomotiveHeader
            v-if="jmriState.roster.has(config.address)"
            :name="jmriState.roster.get(config.address)!.name"
            :road="jmriState.roster.get(config.address)!.road"
            :number="jmriState.roster.get(config.address)!.number"
            :thumbnail-url="jmriState.roster.get(config.address)!.thumbnailUrl"
            :disabled="true"
          />
          <div v-else>
            <h3 class="text-base font-semibold">{{ getDccexLabel(config.address) || config.label }}</h3>
            <p class="text-sm text-neutral-400">{{ config.sublabel }}</p>
          </div>
        </div>

        <!-- Acquire button (when not yet acquired) -->
        <div v-if="!dccex.throttles.value.has(config.address)">
          <UButton
            color="primary"
            class="w-full"
            @click="handleAcquire(config.address)"
            :disabled="controlsDisabled"
          >
            <template #leading>
              <UIcon name="i-heroicons-play" />
            </template>
            Acquire
          </UButton>
        </div>

        <!-- Throttle controls (when acquired) -->
        <div v-else>
          <!-- Speed control -->
          <div class="mb-2 sm:mb-3">
            <label class="text-sm mb-1 block text-neutral-300">
              Speed: {{ getSpeedPercent(config.address) }}%
            </label>
            <div class="flex w-full gap-1" role="group" aria-label="Speed control">
              <button
                v-for="(level, index) in powerLevels"
                :key="level"
                class="speed-segment flex-1 h-8 rounded transition-colors"
                :class="getSpeedButtonClass(config.address, level, index)"
                @click="handleSetPowerLevel(config.address, level, index)"
                :disabled="controlsDisabled || isRamping[config.address]"
              >
                &nbsp;
              </button>
            </div>
          </div>

          <!-- Direction and Stop buttons -->
          <div class="flex w-full gap-1" role="group" aria-label="Direction and stop controls">
            <UButton
              class="flex-1"
              color="primary"
              @click="handleToggleDirection(config.address)"
              :disabled="controlsDisabled || isRamping[config.address]"
            >
              <template #leading>
                <UIcon :name="getThrottle(config.address).forward ? 'i-heroicons-arrow-right' : 'i-heroicons-arrow-left'" />
              </template>
              {{ getThrottle(config.address).forward ? 'Forward' : 'Reverse' }}
            </UButton>
            <UButton
              class="flex-1"
              color="warning"
              @click="handleBrake(config.address)"
              :disabled="controlsDisabled"
            >
              <template #leading>
                <UIcon name="i-mdi-gauge" />
              </template>
              Brake
            </UButton>
            <UButton
              class="flex-1"
              color="error"
              @click="handleEmergencyStop(config.address)"
              :disabled="controlsDisabled"
            >
              <template #leading>
                <UIcon name="i-heroicons-stop-circle" />
              </template>
              E-Stop
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useJmri } from '@/composables/useJmri'
import { useDccEx } from '@/composables/useDccEx'
import type { DccExThrottle } from '@/composables/useDccEx'
import { logger } from '@/utils/logger'
import LocomotiveHeader from './LocomotiveHeader.vue'

const TRAM_CONFIGS = [
  { address: 30, label: 'Track 1', sublabel: 'Inner Loop' },
  { address: 31, label: 'Track 2', sublabel: 'Outer Loop' }
] as const

// JMRI for roster images only
const { jmriState } = useJmri()

// DCC-EX for power and throttle control
const dccex = useDccEx()

const isPowerBusy = ref(false)
watch(() => dccex.powerState.value, () => { isPowerBusy.value = false })
const isRamping = reactive<Record<number, boolean>>({})
const stopFlags = reactive<Record<number, boolean>>({})

// WiThrottle speed levels: 0-126 mapped to 10 segments
const powerLevels = [13, 25, 38, 50, 63, 76, 88, 101, 113, 126]
const RAMP_TIME_PER_SEGMENT = 2000

const controlsDisabled = computed(() => {
  return !dccex.isConnected.value || dccex.powerState.value !== 'on'
})

// Power button state
const powerButtonColor = computed(() => {
  if (dccex.powerState.value === 'on') return 'primary'
  if (dccex.powerState.value === 'off') return 'neutral'
  return 'warning'
})

const powerButtonText = computed(() => {
  if (dccex.powerState.value === 'on') return 'ON'
  if (dccex.powerState.value === 'off') return 'OFF'
  return 'UNKNOWN'
})

const powerButtonIcon = computed(() => {
  if (dccex.powerState.value === 'on') return 'i-heroicons-bolt'
  if (dccex.powerState.value === 'off') return 'i-mdi-power'
  return 'i-heroicons-question-mark-circle'
})

function getDccexLabel(address: number): string | undefined {
  return dccex.roster.value.find(e => e.address === address)?.name
}

function togglePower() {
  isPowerBusy.value = true
  dccex.setPower(dccex.powerState.value !== 'on')
}

function getThrottle(address: number): DccExThrottle {
  return dccex.throttles.value.get(address)!
}

function getSpeedPercent(address: number): number {
  const throttle = dccex.throttles.value.get(address)
  return throttle ? Math.round((throttle.speed / 126) * 100) : 0
}

function handleAcquire(address: number) {
  dccex.acquireThrottle(address, false) // short address
}

/**
 * Speed button styling — same zone logic as ThrottleCard
 */
function getSpeedButtonClass(address: number, level: number, index: number): string {
  const currentSpeed = getThrottle(address).speed

  let reached: string
  let approaching: string
  if (index <= 2) {
    reached = 'bg-red-600'
    approaching = 'bg-red-600/50'
  } else if (index <= 6) {
    reached = 'bg-amber-500'
    approaching = 'bg-amber-500/50'
  } else {
    reached = 'bg-green-600'
    approaching = 'bg-green-600/50'
  }

  const previousLevel = index > 0 ? powerLevels[index - 1] : 0

  if (currentSpeed >= level) return reached
  if (currentSpeed > previousLevel) return approaching
  return 'bg-neutral-700'
}

/**
 * Set power level with segment-based ramping
 */
async function handleSetPowerLevel(address: number, clickedLevel: number, clickedIndex: number) {
  if (isRamping[address]) return

  const throttle = getThrottle(address)
  const currentSpeed = throttle.speed

  let leftmostLitIndex = -1
  let rightmostLitIndex = -1

  for (let i = 0; i < powerLevels.length; i++) {
    if (currentSpeed >= powerLevels[i]) {
      if (leftmostLitIndex === -1) leftmostLitIndex = i
      rightmostLitIndex = i
    }
  }

  const isSegmentLit = currentSpeed >= clickedLevel

  let targetSpeedValue: number
  let segmentDistance: number

  if (isSegmentLit) {
    if (clickedIndex === 0) {
      targetSpeedValue = 0
      segmentDistance = rightmostLitIndex + 1
    } else {
      const targetIndex = clickedIndex - 1
      targetSpeedValue = powerLevels[targetIndex]
      segmentDistance = rightmostLitIndex - targetIndex
    }
  } else {
    targetSpeedValue = clickedLevel
    const fromIndex = leftmostLitIndex === -1 ? -1 : leftmostLitIndex
    segmentDistance = clickedIndex - fromIndex
  }

  if (currentSpeed === targetSpeedValue) return

  stopFlags[address] = false
  isRamping[address] = true

  try {
    const duration = segmentDistance * RAMP_TIME_PER_SEGMENT
    const interval = 100
    const steps = Math.max(5, Math.ceil(duration / interval))

    for (let i = 1; i <= steps; i++) {
      if (stopFlags[address]) {
        break
      }

      const t = i / steps
      const speed = Math.round(currentSpeed + (targetSpeedValue - currentSpeed) * t)
      dccex.setSpeed(address, speed)

      if (i < steps) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    }

    if (!stopFlags[address]) {
      dccex.setSpeed(address, targetSpeedValue)
    }
  } finally {
    isRamping[address] = false
  }
}

async function handleToggleDirection(address: number) {
  const throttle = getThrottle(address)
  const currentSpeed = throttle.speed
  const newForward = !throttle.forward

  if (currentSpeed > 0) {
    // Ramp down, pause, flip, ramp back up
    const currentIndex = powerLevels.findIndex(level => Math.abs(level - currentSpeed) < 2) || 0
    await handleSetPowerLevel(address, powerLevels[0], 0)
    await new Promise(resolve => setTimeout(resolve, 1800))
    dccex.setDirection(address, newForward)
    await handleSetPowerLevel(address, currentSpeed, currentIndex)
  } else {
    dccex.setDirection(address, newForward)
  }
}

async function handleBrake(address: number) {
  // Interrupt any in-progress ramp, then ramp down to zero
  stopFlags[address] = true
  // Wait for current ramp to finish
  while (isRamping[address]) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  await handleSetPowerLevel(address, powerLevels[0], 0)
}

function handleEmergencyStop(address: number) {
  stopFlags[address] = true
  dccex.eStop(address)
}
</script>

<style scoped>
.speed-segment:hover:not(:disabled) {
  filter: brightness(1.2);
}

.speed-segment:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
