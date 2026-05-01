<template>
  <div class="flex w-full gap-1 md:gap-2 mb-2 sm:mb-3" role="group">
    <!-- Combined Connection Status Indicator -->
    <UButton
      size="sm"
      :color="statusColor"
      disabled
      :title="statusText"
    >
      <UIcon :name="statusIcon" />
    </UButton>

    <!-- Per-zone power buttons (when powerZones configured) -->
    <template v-if="resolvedZones.length > 0">
      <UButton
        v-for="zone in resolvedZones"
        :key="zone.prefix"
        :color="zonePowerColor(zone.prefix)"
        @click="toggleZonePower(zone.prefix)"
        :disabled="!isConnected || busyZones.has(zone.prefix)"
        :title="`${zone.name}: ${zonePowerText(zone.prefix)}`"
      >
        <template #leading>
          <UIcon :name="zonePowerIcon(zone.prefix)" />
        </template>
        <span class="hidden sm:inline">{{ zone.name }}</span>
      </UButton>
    </template>

    <!-- Single power button fallback -->
    <UButton
      v-else
      :color="buttonColor"
      @click="togglePower"
      :disabled="!isConnected || isBusy"
      :title="buttonText"
    >
      <template #leading>
        <UIcon :name="buttonIcon" />
      </template>
      <span class="hidden sm:inline">{{ buttonText }}</span>
    </UButton>

    <UButton
      color="error"
      @click="stopAll"
      :disabled="!isConnected || isStopping || throttles.length === 0"
      :title="isStopping ? 'Stopping...' : 'Emergency Stop All'"
    >
      <template #leading>
        <UIcon name="i-mdi-hand-back-left" />
      </template>
      <span class="hidden sm:inline">{{ isStopping ? 'Stopping...' : 'Stop All' }}</span>
    </UButton>
    <UButton
      color="neutral"
      @click="handleLogout"
      title="Return to Welcome Screen"
    >
      <template #leading>
        <UIcon name="i-heroicons-arrow-right-on-rectangle" />
      </template>
      <span class="hidden sm:inline">Exit</span>
    </UButton>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri, ConnectionState } from '@/plugins/jmri'
import { PowerState, powerStateToString } from 'jmri-client'
import { logger } from '@/utils/logger'

const emit = defineEmits<{
  logout: []
}>()

const {
  power, connectionState, isServerOnline, isConnected,
  setPower, stopAllThrottles, throttles,
  resolvedZones, powerByPrefix,
} = useJmri()

const isBusy = ref(false)
const isStopping = ref(false)
const busyZones = ref<Set<string>>(new Set())

// ── Connection status indicator ───────────────────────────────────────────────

const statusColor = computed(() => {
  if (!isServerOnline.value) return 'warning'
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:    return 'success'
    case ConnectionState.DISCONNECTED:
    case ConnectionState.UNKNOWN:      return 'warning'
  }
})

const statusText = computed(() => {
  if (!isServerOnline.value) return 'Web Server Offline'
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:    return 'Connected'
    case ConnectionState.DISCONNECTED: return 'Disconnected'
    case ConnectionState.UNKNOWN:      return 'Connection Unknown'
  }
})

const statusIcon = computed(() => {
  if (!isServerOnline.value) return 'i-heroicons-face-frown'
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:    return 'i-mdi-power-plug'
    case ConnectionState.DISCONNECTED: return 'i-mdi-power-plug-off'
    case ConnectionState.UNKNOWN:
    default:                           return 'i-heroicons-question-mark-circle'
  }
})

// ── Single-zone fallback helpers ──────────────────────────────────────────────

const buttonColor = computed(() => {
  if (power.value === PowerState.ON)  return 'primary'
  if (power.value === PowerState.OFF) return 'neutral'
  return 'warning'
})

const buttonText = computed(() => powerStateToString(power.value))

const buttonIcon = computed(() => {
  if (power.value === PowerState.ON)  return 'i-heroicons-bolt'
  if (power.value === PowerState.OFF) return 'i-mdi-power'
  return 'i-heroicons-question-mark-circle'
})

async function togglePower() {
  isBusy.value = true
  try {
    await setPower(power.value === PowerState.ON ? 'off' : 'on')
  } catch (error) {
    logger.error('Error setting power:', error)
  } finally {
    isBusy.value = false
  }
}

// ── Per-zone helpers ──────────────────────────────────────────────────────────

function zoneState(prefix: string): PowerState {
  return powerByPrefix.value.get(prefix) ?? PowerState.UNKNOWN
}

function zonePowerColor(prefix: string): string {
  const s = zoneState(prefix)
  if (s === PowerState.ON)  return 'primary'
  if (s === PowerState.OFF) return 'neutral'
  return 'warning'
}

function zonePowerText(prefix: string): string {
  return powerStateToString(zoneState(prefix))
}

function zonePowerIcon(prefix: string): string {
  const s = zoneState(prefix)
  if (s === PowerState.ON)  return 'i-heroicons-bolt'
  if (s === PowerState.OFF) return 'i-mdi-power'
  return 'i-heroicons-question-mark-circle'
}

async function toggleZonePower(prefix: string) {
  if (busyZones.value.has(prefix)) return
  busyZones.value = new Set(busyZones.value).add(prefix)
  try {
    const current = zoneState(prefix)
    await setPower(current === PowerState.ON ? 'off' : 'on', prefix)
  } catch (error) {
    logger.error(`Error setting power for zone "${prefix}":`, error)
  } finally {
    const next = new Set(busyZones.value)
    next.delete(prefix)
    busyZones.value = next
  }
}

// ── Shared actions ────────────────────────────────────────────────────────────

async function stopAll() {
  isStopping.value = true
  try {
    await stopAllThrottles()
  } catch (error) {
    logger.error('Error stopping all throttles:', error)
  } finally {
    isStopping.value = false
  }
}

function handleLogout() {
  emit('logout')
}
</script>
