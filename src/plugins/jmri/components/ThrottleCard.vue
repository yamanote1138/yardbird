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

    <!-- Speed control + direction/stop -->
    <div class="mb-2 sm:mb-3">
      <label class="text-sm mb-1 block text-neutral-300">Speed: {{ Math.round(throttle.speed * 100) }}%</label>

      <div class="flex flex-col gap-2">

        <!-- Speed bar: horizontal row of segments -->
        <div
          class="flex flex-row gap-1 h-11"
          role="group"
          aria-label="Speed control"
        >
          <button
            v-for="(level, index) in powerLevels"
            :key="level"
            class="speed-segment flex-1 rounded transition-colors"
            :class="getSpeedButtonClass(level, index)"
            @click="setPowerLevel(index)"
            :disabled="controlsDisabled"
          >&nbsp;</button>
        </div>

        <!-- Direction / brake / stop: icon-only row -->
        <div
          class="flex flex-row gap-1"
          role="group"
          aria-label="Direction and stop controls"
        >
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
            <span class="hidden">{{ !throttle.directionVerified ? 'Unknown' : throttle.direction ? 'Forward' : 'Reverse' }}</span>
          </UButton>
          <UButton
            class="flex-1"
            color="warning"
            @click="brakeThrottle"
            :disabled="controlsDisabled"
          >
            <template #leading><UIcon name="i-heroicons-pause" /></template>
            <span class="hidden">Brake</span>
          </UButton>
          <UButton
            class="flex-1"
            color="error"
            @click="emergencyStop"
            :disabled="controlsDisabled"
          >
            <template #leading><UIcon name="i-heroicons-stop-circle" /></template>
            <span class="hidden">E-Stop</span>
          </UButton>
        </div>

      </div>
    </div>

    <!-- DC loco PWM frequency buttons -->
    <div v-if="isDcLoco" class="mt-2 sm:mt-3">
      <label class="text-sm mb-1 block text-neutral-300">PWM Frequency</label>
      <div class="flex gap-1 md:gap-2" role="group" aria-label="PWM frequency">
        <UButton
          v-for="pwm in PWM_BUTTONS"
          :key="pwm.fn"
          class="flex-1"
          :color="activePwmFn === pwm.fn ? 'info' : 'neutral'"
          :variant="activePwmFn === pwm.fn ? 'solid' : 'soft'"
          @click="selectPwmFreq(pwm.fn)"
          :disabled="controlsDisabled"
          :title="pwm.label"
        >
          <template #leading><UIcon :name="pwm.icon" /></template>
          <span class="hidden sm:inline">{{ pwm.label }}</span>
        </UButton>
      </div>
    </div>

    <!-- Standard function buttons -->
    <div v-else-if="functionButtons.length > 0" class="flex flex-wrap gap-1 md:gap-2" role="group">
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
import { createSpeedRamp, targetForSegment, POWER_LEVELS } from '@/plugins/jmri/speedRamp'
import { logger } from '@/utils/logger'

const props = defineProps<{
  throttle: Throttle
}>()

const DC_LOCO_ADDRESSES = [30, 31, 32]

const PWM_BUTTONS = [
  { fn: 29, label: 'Default', icon: 'i-heroicons-signal' },
  { fn: 30, label: 'High Freq', icon: 'i-heroicons-bolt' },
  { fn: 31, label: 'Supersonic', icon: 'i-mdi-rocket-launch' },
] as const

const { isConnected, power, setThrottleSpeed, setThrottleDirection, setThrottleFunction, releaseThrottle } = useJmri()

const isReleasing = ref(false)
const powerLevels = POWER_LEVELS
const RAMP_TIME_PER_SEGMENT = 2000
const DIRECTION_PAUSE = 500

const ramp = createSpeedRamp({
  getSpeed: () => props.throttle.speed,
  setSpeed: speed => setThrottleSpeed(props.throttle.address, speed),
  msPerSegment: RAMP_TIME_PER_SEGMENT,
})

// Disable controls when not connected or power is off
const controlsDisabled = computed(() => {
  return !isConnected.value || power.value !== PowerState.ON
})

const isDcLoco = computed(() => DC_LOCO_ADDRESSES.includes(props.throttle.address))

const activePwmFn = computed(() => {
  for (const { fn } of PWM_BUTTONS) {
    if (props.throttle.functions[`F${fn}`]?.value) return fn
  }
  return null
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

// Bumped by any user speed action so an in-flight direction change knows to abort
let speedActions = 0

function setPowerLevel(index: number) {
  speedActions++
  ramp.rampTo(targetForSegment(props.throttle.speed, index))
}

async function toggleDirection() {
  const previousSpeed = props.throttle.speed
  const newDirection = props.throttle.directionVerified && props.throttle.direction === Direction.FORWARD
    ? Direction.REVERSE
    : Direction.FORWARD

  if (previousSpeed > 0) {
    const token = ++speedActions
    if (!await ramp.rampTo(0)) return
    await new Promise(resolve => setTimeout(resolve, DIRECTION_PAUSE))
    if (token !== speedActions) return
    await setThrottleDirection(props.throttle.address, newDirection)
    ramp.rampTo(previousSpeed)
  } else {
    await setThrottleDirection(props.throttle.address, newDirection)
  }
}

function brakeThrottle() {
  speedActions++
  ramp.rampTo(0)
}

function emergencyStop() {
  speedActions++
  ramp.stop()
  setThrottleSpeed(props.throttle.address, 0)
}

async function selectPwmFreq(fn: number) {
  if (activePwmFn.value === fn) return
  for (const { fn: f } of PWM_BUTTONS) {
    if (props.throttle.functions[`F${f}`]?.value) {
      await setThrottleFunction(props.throttle.address, f, false)
    }
  }
  await setThrottleFunction(props.throttle.address, fn, true)
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
