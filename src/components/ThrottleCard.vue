<template>
  <div class="card bg-dark text-light mb-2 mb-sm-3">
    <div class="card-body py-2 py-sm-3">
      <div class="mb-2 mb-sm-3">
        <LocomotiveHeader
          :name="throttle.name"
          :road="throttle.road"
          :number="throttle.number"
          :thumbnail-url="throttle.thumbnailUrl"
          :disabled="!isConnected || isReleasing"
          @click="onRelease"
        >
          <template #status>
            <div v-if="isReleasing" class="text-danger small mt-1">
              <i class="fas fa-spinner fa-spin"></i> Releasing...
            </div>
          </template>
        </LocomotiveHeader>
      </div>

      <!-- Speed control -->
      <div class="mb-2 mb-sm-3">
        <label class="form-label small mb-1">Speed: {{ Math.round(throttle.speed * 100) }}%</label>
        <div class="btn-group w-100 gap-1" role="group" aria-label="Speed control">
          <button
            v-for="(level, index) in powerLevels"
            :key="level"
            class="btn"
            :class="getSpeedButtonClass(level, index)"
            @click="setPowerLevel(level, index)"
            :disabled="controlsDisabled"
          >
            &nbsp;
          </button>
        </div>
      </div>

      <!-- Direction and Stop buttons -->
      <div class="btn-group w-100 mb-2 mb-sm-3" role="group" aria-label="Direction and stop controls">
        <button
          type="button"
          class="btn col"
          :class="throttle.directionVerified ? 'btn-primary' : 'btn-warning'"
          @click="toggleDirection"
          :disabled="controlsDisabled"
        >
          <i v-if="!throttle.directionVerified" class="fas fa-shuffle"></i>
          <i v-else-if="throttle.direction" class="fas fa-arrow-right"></i>
          <i v-else class="fas fa-arrow-left"></i>
          <span v-if="!throttle.directionVerified" class="ms-1">Unknown</span>
          <span v-else class="ms-1">{{ throttle.direction ? 'Forward' : 'Reverse' }}</span>
        </button>
        <button
          type="button"
          class="btn btn-warning col"
          @click="brakeThrottle"
          :disabled="controlsDisabled"
        >
          <i class="fas fa-gauge"></i>
          <span class="ms-1">Brake</span>
        </button>
        <button
          type="button"
          class="btn btn-danger col"
          @click="emergencyStop"
          :disabled="controlsDisabled"
        >
          <i class="fas fa-circle-stop"></i>
          <span class="ms-1">E-Stop</span>
        </button>
      </div>

      <!-- Function buttons -->
      <div v-if="functionButtons.length > 0" class="btn-group w-100 flex-wrap" role="group">
        <button
          v-for="fn in functionButtons"
          :key="fn.key"
          class="btn"
          :class="fn.value ? 'btn-info' : 'btn-fn-off'"
          @click="toggleFunction(fn.key)"
          :disabled="controlsDisabled"
          :title="fn.label"
        >
          <i :class="getFunctionIcon(fn.key)"></i>
          <span class="d-none d-sm-inline ms-1">{{ fn.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri } from '@/composables/useJmri'
import { PowerState } from 'jmri-client'
import type { Throttle } from '@/types/jmri'
import { Direction } from '@/types/jmri'
import LocomotiveHeader from './LocomotiveHeader.vue'

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
 * - Speed >= segment target: bright (reached this segment)
 * - Speed between previous and current segment: dim (approaching this segment)
 * - Speed below previous segment: grey (not reached yet)
 *
 * Color zones:
 * - Segments 1-3 (10-30%): RED
 * - Segments 4-7 (40-70%): YELLOW
 * - Segments 8-10 (80-100%): GREEN
 */
function getSpeedButtonClass(level: number, index: number): string {
  const currentSpeed = props.throttle.speed

  // Determine color zone based on index
  let colorClass: string
  if (index <= 2) {
    // First 3 segments: RED
    colorClass = 'btn-danger'
  } else if (index <= 6) {
    // Middle 4 segments: YELLOW
    colorClass = 'btn-warning'
  } else {
    // Last 3 segments: GREEN
    colorClass = 'btn-success'
  }

  // Determine previous segment threshold (0 for first segment)
  const previousLevel = index > 0 ? powerLevels[index - 1] : 0

  // Reached or passed this segment: BRIGHT
  if (currentSpeed >= level) {
    return colorClass
  }

  // Between previous and this segment: DIM (approaching)
  if (currentSpeed > previousLevel) {
    return `${colorClass} opacity-50`
  }

  // Below previous segment: GREY (not reached yet)
  return 'btn-secondary'
}

// Compute function buttons list (sorted by function number)
const functionButtons = computed(() => {
  const buttons = Object.entries(props.throttle.functions)
    .map(([key, fn]) => {
      // Extract function number from key like "F0", "F1"
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

  // Sort by function number
  return buttons.sort((a, b) => a.number - b.number)
})

/**
 * Set power level with segment-based ramping
 * - Each segment = 2 seconds ramp time
 * - Clicking unlit: ramp from leftmost lit to clicked (sum of segments traversed)
 * - Clicking lit: ramp from rightmost lit to segment left of clicked
 * - Clicking first lit segment: ramp to 0%
 */
async function setPowerLevel(clickedLevel: number, clickedIndex: number) {
  if (isRamping.value) return

  const currentSpeed = props.throttle.speed

  // Find leftmost and rightmost lit segments
  let leftmostLitIndex = -1
  let rightmostLitIndex = -1

  for (let i = 0; i < powerLevels.length; i++) {
    if (currentSpeed >= powerLevels[i]) {
      if (leftmostLitIndex === -1) leftmostLitIndex = i
      rightmostLitIndex = i
    }
  }

  // Determine if clicking lit or unlit segment
  const isSegmentLit = currentSpeed >= clickedLevel

  let targetSpeedValue: number
  let segmentDistance: number

  if (isSegmentLit) {
    // Clicking a lit segment - ramp DOWN
    if (clickedIndex === 0) {
      // Special case: clicking first segment goes to 0
      targetSpeedValue = 0
      // Distance is all currently lit segments
      segmentDistance = rightmostLitIndex + 1
    } else {
      // Target is the segment to the left of clicked
      const targetIndex = clickedIndex - 1
      targetSpeedValue = powerLevels[targetIndex]
      // Distance from rightmost lit to target
      segmentDistance = rightmostLitIndex - targetIndex
    }
  } else {
    // Clicking an unlit segment - ramp UP
    targetSpeedValue = clickedLevel
    // Distance from leftmost lit (or 0 if none lit) to clicked
    const fromIndex = leftmostLitIndex === -1 ? -1 : leftmostLitIndex
    segmentDistance = clickedIndex - fromIndex
  }

  // If already at target, do nothing
  if (currentSpeed === targetSpeedValue) return

  stopFlag.value = false
  isRamping.value = true
  targetSpeed.value = clickedLevel // For visual feedback

  try {
    const duration = segmentDistance * RAMP_TIME_PER_SEGMENT
    const interval = 100 // ms between updates - smooth animation
    const steps = Math.max(5, Math.ceil(duration / interval))

    for (let i = 1; i <= steps; i++) {
      // Check for emergency stop
      if (stopFlag.value) {
        await setThrottleSpeed(props.throttle.address, 0)
        break
      }

      // Linear interpolation for consistent segment timing
      const t = i / steps
      const speed = currentSpeed + (targetSpeedValue - currentSpeed) * t
      await setThrottleSpeed(props.throttle.address, speed)

      // Don't wait after the last step
      if (i < steps) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    }

    // Ensure we hit the exact target (unless emergency stopped)
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
  // If direction is unknown, always set to Forward; otherwise toggle
  const newDirection = props.throttle.directionVerified && props.throttle.direction === Direction.FORWARD
    ? Direction.REVERSE
    : Direction.FORWARD

  // If moving, ramp down to 0, pause, switch direction, then ramp back up
  if (currentSpeed > 0) {
    // Find the index of the current speed level
    const currentIndex = powerLevels.findIndex(level => Math.abs(level - currentSpeed) < 0.01) || 0

    // Ramp down to 0 by clicking first segment
    await setPowerLevel(powerLevels[0], 0)

    // Pause after stopping (realistic momentum/settling time)
    await new Promise(resolve => setTimeout(resolve, 1800))

    // Switch direction
    await setThrottleDirection(props.throttle.address, newDirection)

    // Ramp back up to previous speed
    await setPowerLevel(currentSpeed, currentIndex)
  } else {
    // If stopped, just switch direction
    await setThrottleDirection(props.throttle.address, newDirection)
  }
}

async function brakeThrottle() {
  await setPowerLevel(powerLevels[0], 0)
}

function emergencyStop() {
  // Interrupt any ongoing ramp and set speed to 0 immediately
  stopFlag.value = true
  setThrottleSpeed(props.throttle.address, 0)
}

function toggleFunction(functionKey: string) {
  const fn = props.throttle.functions[functionKey]
  if (!fn) return

  // Extract function number from key like "F0", "F1"
  const match = functionKey.match(/^F(\d+)$/)
  if (!match) {
    console.error('Invalid function key format:', functionKey)
    return
  }

  const functionNumber = parseInt(match[1])
  setThrottleFunction(props.throttle.address, functionNumber, !fn.value)
}

function getFunctionIcon(functionKey: string): string {
  const fn = props.throttle.functions[functionKey]
  if (!fn || !fn.label || typeof fn.label !== 'string') return 'fas fa-circle'

  // Map common function labels to icons
  const label = fn.label.toLowerCase()
  if (label.includes('headlight') || label.includes('light')) return 'fas fa-lightbulb'
  if (label.includes('bell')) return 'fas fa-bell'
  if (label.includes('horn') || label.includes('whistle')) return 'fas fa-bullhorn'
  if (label.includes('steam')) return 'fas fa-cloud'
  if (label.includes('brake')) return 'fas fa-hand-paper'
  if (label.includes('coupler')) return 'fas fa-link'
  if (label.includes('mars')) return 'fas fa-star'

  return 'fas fa-circle'
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
.btn-fn-off {
  background-color: #495057;
  border-color: #495057;
  color: #fff;
}
.btn-fn-off:hover:not(:disabled) {
  background-color: #6c757d;
  border-color: #6c757d;
  color: #fff;
}
</style>
