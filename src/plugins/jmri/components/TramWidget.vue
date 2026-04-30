<template>
  <div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
      <UCard
        v-for="config in TRAM_CONFIGS"
        :key="config.address"
        class="mb-0"
        :ui="{ body: 'py-2 sm:py-3' }"
      >
        <!-- Track Header -->
        <div class="mb-2 sm:mb-3 flex items-start justify-between gap-2">
          <div class="min-w-0">
            <LocomotiveHeader
              v-if="jmriState.value.roster.has(config.address)"
              :name="jmriState.value.roster.get(config.address)!.name"
              :road="jmriState.value.roster.get(config.address)!.road"
              :number="jmriState.value.roster.get(config.address)!.number"
              :thumbnail-url="jmriState.value.roster.get(config.address)!.thumbnailUrl"
              :disabled="true"
            />
            <div v-else>
              <h3 class="text-base font-semibold">{{ config.label }}</h3>
              <p class="text-sm text-neutral-400">{{ config.sublabel }} ({{ pwmFreqLabel(config.address) }})</p>
            </div>
          </div>
          <UButton
            v-if="isAcquired(config.address)"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="handleRelease(config.address)"
            class="shrink-0 mt-0.5"
          >
            Release
          </UButton>
        </div>

        <!-- Acquire button (when not yet acquired) -->
        <div v-if="!isAcquired(config.address)">
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
            <div class="flex w-full gap-1 md:gap-1.5" role="group" aria-label="Speed control">
              <button
                v-for="(level, index) in powerLevels"
                :key="level"
                class="speed-segment flex-1 h-8 md:h-11 rounded transition-colors"
                :class="getSpeedButtonClass(config.address, level, index)"
                @click="handleSetPowerLevel(config.address, level, index)"
                :disabled="controlsDisabled || isRamping[config.address]"
              >
                &nbsp;
              </button>
            </div>
          </div>

          <!-- Direction and Stop buttons -->
          <div class="flex w-full gap-1 md:gap-2" role="group" aria-label="Direction and stop controls">
            <UButton
              class="flex-1"
              color="primary"
              @click="handleToggleDirection(config.address)"
              :disabled="controlsDisabled || isRamping[config.address]"
            >
              <template #leading>
                <UIcon :name="getThrottle(config.address).direction ? 'i-heroicons-arrow-right' : 'i-heroicons-arrow-left'" />
              </template>
              {{ getThrottle(config.address).direction ? 'Forward' : 'Reverse' }}
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
import { ref, reactive, computed } from 'vue'
import { useJmri } from '@/plugins/jmri'
import { useLayout } from '@/core/useLayout'
import { PowerState } from 'jmri-client'
import { logger } from '@/utils/logger'
import LocomotiveHeader from '@/plugins/jmri/components/LocomotiveHeader.vue'
import type { Throttle } from '@/types/jmri'

const TRAM_CONFIGS = [
  { address: 30, label: 'Track 1', sublabel: 'Inner Loop' },
  { address: 31, label: 'Track 2', sublabel: 'Outer Loop' }
] as const

const { jmriState, power, isConnected, acquireThrottle, releaseThrottle, setThrottleSpeed, setThrottleDirection, setThrottleFunction } = useJmri()
const { plugins } = useLayout()

// JMRI speed scale: 0.0–1.0 mapped to 10 segments
const powerLevels = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
const RAMP_TIME_PER_SEGMENT = 2000

const PWM_FREQ_LABELS = ['131 Hz', '490 Hz', '3.4 kHz', 'Supersonic']

// F29/F30/F31 function states for each frequency index
const PWM_FREQ_FUNCTIONS = [
  { F29: false, F30: false, F31: false }, // 0: 131 Hz (default)
  { F29: true,  F30: false, F31: false }, // 1: ~490 Hz
  { F29: false, F30: true,  F31: false }, // 2: ~3.4 kHz
  { F29: false, F30: false, F31: true  }, // 3: Supersonic
] as const

const defaultPwmFreq = computed(() => plugins.value.jmri.tramPwmFreq ?? 3)
const pwmFreqByAddress = reactive<Record<number, number>>({})

function pwmFreqLabel(address: number): string {
  const idx = pwmFreqByAddress[address] ?? defaultPwmFreq.value
  return PWM_FREQ_LABELS[idx] ?? 'Unknown'
}

async function applyPwmFrequency(address: number, freqIndex: number): Promise<void> {
  const fns = PWM_FREQ_FUNCTIONS[freqIndex]
  if (!fns) return
  await setThrottleFunction(address, 29, fns.F29)
  await setThrottleFunction(address, 30, fns.F30)
  await setThrottleFunction(address, 31, fns.F31)
  logger.info(`[Tram] Set PWM frequency for address ${address}: ${PWM_FREQ_LABELS[freqIndex]}`)
}

const isRamping = reactive<Record<number, boolean>>({})
const stopFlags = reactive<Record<number, boolean>>({})

const controlsDisabled = computed(() => {
  return !isConnected.value || power.value !== PowerState.ON
})

function isAcquired(address: number): boolean {
  return jmriState.value.throttles.has(address)
}

function getThrottle(address: number): Throttle {
  return jmriState.value.throttles.get(address)!
}

function getSpeedPercent(address: number): number {
  const throttle = jmriState.value.throttles.get(address)
  return throttle ? Math.round(throttle.speed * 100) : 0
}

async function handleAcquire(address: number) {
  const freq = defaultPwmFreq.value
  pwmFreqByAddress[address] = freq
  await acquireThrottle(address)
  // Apply PWM frequency after a short delay to ensure the throttle is ready
  setTimeout(() => applyPwmFrequency(address, freq), 500)
}

async function handleRelease(address: number) {
  stopFlags[address] = true
  delete pwmFreqByAddress[address]
  await releaseThrottle(address)
}

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
    reached = 'bg-success-600'
    approaching = 'bg-success-600/50'
  }

  const previousLevel = index > 0 ? powerLevels[index - 1] : 0

  if (currentSpeed >= level) return reached
  if (currentSpeed > previousLevel) return approaching
  return 'bg-neutral-700'
}

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
      if (stopFlags[address]) break

      const t = i / steps
      const speed = currentSpeed + (targetSpeedValue - currentSpeed) * t
      await setThrottleSpeed(address, speed)

      if (i < steps) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    }

    if (!stopFlags[address]) {
      await setThrottleSpeed(address, targetSpeedValue)
    }
  } finally {
    isRamping[address] = false
  }
}

async function handleToggleDirection(address: number) {
  const throttle = getThrottle(address)
  const currentSpeed = throttle.speed
  const newForward = !throttle.direction

  if (currentSpeed > 0) {
    const currentIndex = powerLevels.findIndex(level => Math.abs(level - currentSpeed) < 0.05)
    await handleSetPowerLevel(address, powerLevels[0], 0)
    await new Promise(resolve => setTimeout(resolve, 1800))
    await setThrottleDirection(address, newForward)
    if (currentIndex >= 0) {
      await handleSetPowerLevel(address, currentSpeed, currentIndex)
    }
  } else {
    await setThrottleDirection(address, newForward)
  }
}

async function handleBrake(address: number) {
  stopFlags[address] = true
  while (isRamping[address]) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  await handleSetPowerLevel(address, powerLevels[0], 0)
}

async function handleEmergencyStop(address: number) {
  stopFlags[address] = true
  logger.info(`[Tram] Emergency stop: address ${address}`)
  await setThrottleSpeed(address, 0)
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
