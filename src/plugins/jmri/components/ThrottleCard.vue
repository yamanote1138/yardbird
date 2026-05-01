<template>
  <UCard class="mb-2 sm:mb-3" :ui="{ body: 'py-2 sm:py-3' }">
    <div class="mb-2 sm:mb-3">
      <LocomotiveHeader
        :name="throttle.name"
        :road="throttle.road"
        :number="throttle.number"
        :thumbnail-url="throttle.thumbnailUrl"
        :disabled="!isConnected || isReleasing"
        @click="onRelease"
      >
        <template #status>
          <div v-if="isReleasing" class="text-red-400 text-sm mt-1">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin" /> Releasing...
          </div>
        </template>
      </LocomotiveHeader>
    </div>

    <!-- Speed control -->
    <div class="mb-2 sm:mb-3">
      <label class="text-sm mb-1 block text-neutral-300">Speed: {{ Math.round(throttle.speed * 100) }}%</label>
      <div class="flex w-full gap-1 md:gap-1.5" role="group" aria-label="Speed control">
        <button
          v-for="(level, index) in powerLevels"
          :key="level"
          class="speed-segment flex-1 h-8 md:h-11 rounded transition-colors"
          :class="getSpeedButtonClass(level, index)"
          @click="setPowerLevel(level, index)"
          :disabled="controlsDisabled"
        >
          &nbsp;
        </button>
      </div>
    </div>

    <!-- Direction and Stop buttons -->
    <div class="flex w-full gap-1 md:gap-2 mb-2 sm:mb-3" role="group" aria-label="Direction and stop controls">
      <UButton
        class="flex-1"
        :color="throttle.directionVerified ? 'primary' : 'warning'"
        @click="toggleDirection"
        :disabled="controlsDisabled"
      >
        <template #leading>
          <UIcon v-if="!throttle.directionVerified" name="i-mdi-shuffle-variant" />
          <UIcon v-else-if="throttle.direction" name="i-heroicons-arrow-right" />
          <UIcon v-else name="i-heroicons-arrow-left" />
        </template>
        <span v-if="!throttle.directionVerified">Unknown</span>
        <span v-else>{{ throttle.direction ? 'Forward' : 'Reverse' }}</span>
      </UButton>
      <UButton
        class="flex-1"
        color="warning"
        @click="brakeThrottle"
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
        @click="emergencyStop"
        :disabled="controlsDisabled"
      >
        <template #leading>
          <UIcon name="i-heroicons-stop-circle" />
        </template>
        E-Stop
      </UButton>
    </div>

    <!-- Function buttons -->
    <div v-if="functionButtons.length > 0" class="flex flex-wrap gap-1 md:gap-2" role="group">
      <UButton
        v-for="fn in functionButtons"
        :key="fn.key"
        :color="fn.value ? 'info' : 'neutral'"
        :variant="fn.value ? 'solid' : 'soft'"
        @click="toggleFunction(fn.key)"
        :disabled="controlsDisabled"
        :title="fn.label"
      >
        <template #leading>
          <UIcon :name="getFunctionIcon(fn.key)" />
        </template>
        <span class="hidden sm:inline">{{ fn.label }}</span>
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri } from '@/plugins/jmri'
import { PowerState } from 'jmri-client'
import type { Throttle } from '@/types/jmri'
import { Direction } from '@/types/jmri'
import LocomotiveHeader from './LocomotiveHeader.vue'
import { logger } from '@/utils/logger'

const props = defineProps<{
  throttle: Throttle
}>()

const { isConnected, power, setThrottleSpeed, setThrottleDirection, setThrottleFunction, releaseThrottle } = useJmri()

const isReleasing = ref(false)
const isRamping = ref(false)
const stopFlag = ref(false)
const targetSpeed = ref<number | null>(null)

// Power level buttons: 10 segments at 10% each
const powerLevels = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
const RAMP_TIME_PER_SEGMENT = 2000 // 2 seconds per segment

// Disable controls when not connected or power is off
const controlsDisabled = computed(() => {
  return !isConnected.value || power.value !== PowerState.ON
})

/**
 * Determine speed button styling based on current speed position
 * Color zones: Red (1-3), Amber (4-7), Green (8-10)
 */
function getSpeedButtonClass(level: number, index: number): string {
  const currentSpeed = props.throttle.speed

  // Determine color zone
  let reached: string
  let approaching: string
  if (index <= 2) {
    reached = 'bg-red-600'
    approaching = 'bg-red-600/50'
  } else if (index <= 6) {
    reached = 'bg-amber-500'
    approaching = 'bg-amber-500/50'
  } else {
    reached = 'bg-success-600'
    approaching = 'bg-success-600/50'
  }

  const previousLevel = index > 0 ? powerLevels[index - 1] : 0

  // Reached or passed this segment: BRIGHT
  if (currentSpeed >= level) {
    return reached
  }

  // Between previous and this segment: DIM (approaching)
  if (currentSpeed > previousLevel) {
    return approaching
  }

  // Below previous segment: GREY (not reached yet)
  return 'bg-neutral-700'
}

// Compute function buttons list (sorted by function number)
const functionButtons = computed(() => {
  const buttons = Object.entries(props.throttle.functions)
    .map(([key, fn]) => {
      const match = key.match(/^F(\d+)$/)
      if (!match) return null

      return {
        key,
        label: typeof fn.label === 'string' ? fn.label : key,
        value: fn.value || false,
        number: parseInt(match[1])
      }
    })
    .filter((btn): btn is NonNullable<typeof btn> => btn !== null)

  return buttons.sort((a, b) => a.number - b.number)
})

/**
 * Set power level with segment-based ramping
 */
async function setPowerLevel(clickedLevel: number, clickedIndex: number) {
  if (isRamping.value) return

  const currentSpeed = props.throttle.speed

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

  stopFlag.value = false
  isRamping.value = true
  targetSpeed.value = clickedLevel

  try {
    const duration = segmentDistance * RAMP_TIME_PER_SEGMENT
    const interval = 100
    const steps = Math.max(5, Math.ceil(duration / interval))

    for (let i = 1; i <= steps; i++) {
      if (stopFlag.value) {
        await setThrottleSpeed(props.throttle.address, 0)
        break
      }

      const t = i / steps
      const speed = currentSpeed + (targetSpeedValue - currentSpeed) * t
      await setThrottleSpeed(props.throttle.address, speed)

      if (i < steps) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    }

    if (!stopFlag.value) {
      await setThrottleSpeed(props.throttle.address, targetSpeedValue)
    }
  } finally {
    isRamping.value = false
    targetSpeed.value = null
  }
}

async function toggleDirection() {
  const currentSpeed = props.throttle.speed
  const newDirection = props.throttle.directionVerified && props.throttle.direction === Direction.FORWARD
    ? Direction.REVERSE
    : Direction.FORWARD

  if (currentSpeed > 0) {
    const currentIndex = powerLevels.findIndex(level => Math.abs(level - currentSpeed) < 0.01) || 0
    await setPowerLevel(powerLevels[0], 0)
    await new Promise(resolve => setTimeout(resolve, 1800))
    await setThrottleDirection(props.throttle.address, newDirection)
    await setPowerLevel(currentSpeed, currentIndex)
  } else {
    await setThrottleDirection(props.throttle.address, newDirection)
  }
}

async function brakeThrottle() {
  await setPowerLevel(powerLevels[0], 0)
}

function emergencyStop() {
  stopFlag.value = true
  setThrottleSpeed(props.throttle.address, 0)
}

function toggleFunction(functionKey: string) {
  const fn = props.throttle.functions[functionKey]
  if (!fn) return

  const match = functionKey.match(/^F(\d+)$/)
  if (!match) {
    logger.error('Invalid function key format:', functionKey)
    return
  }

  const functionNumber = parseInt(match[1])
  setThrottleFunction(props.throttle.address, functionNumber, !fn.value)
}

function getFunctionIcon(functionKey: string): string {
  const fn = props.throttle.functions[functionKey]
  if (!fn || !fn.label || typeof fn.label !== 'string') return 'i-mdi-circle'

  const label = fn.label.toLowerCase()
  if (label.includes('headlight') || label.includes('light')) return 'i-heroicons-light-bulb'
  if (label.includes('bell')) return 'i-heroicons-bell'
  if (label.includes('horn') || label.includes('whistle')) return 'i-mdi-bullhorn'
  if (label.includes('steam')) return 'i-heroicons-cloud'
  if (label.includes('brake')) return 'i-mdi-hand-back-left'
  if (label.includes('coupler')) return 'i-heroicons-link'
  if (label.includes('mars')) return 'i-heroicons-star'

  return 'i-mdi-circle'
}

async function onRelease() {
  isReleasing.value = true
  try {
    await releaseThrottle(props.throttle.address)
  } finally {
    isReleasing.value = false
  }
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
