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
    <UButton
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

const emit = defineEmits<{
  logout: []
}>()

const { power, connectionState, isServerOnline, isConnected, setPower, stopAllThrottles, throttles } = useJmri()
const isBusy = ref(false)
const isStopping = ref(false)

// Combined connection status
const statusColor = computed(() => {
  if (!isServerOnline.value) return 'warning'
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:
      return 'success'
    case ConnectionState.DISCONNECTED:
    case ConnectionState.UNKNOWN:
      return 'warning'
  }
})

const statusText = computed(() => {
  if (!isServerOnline.value) return 'Web Server Offline'
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:
      return 'Connected'
    case ConnectionState.DISCONNECTED:
      return 'Disconnected'
    case ConnectionState.UNKNOWN:
      return 'Connection Unknown'
  }
})

const statusIcon = computed(() => {
  if (!isServerOnline.value) return 'i-heroicons-face-frown'
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:
      return 'i-mdi-power-plug'
    case ConnectionState.DISCONNECTED:
      return 'i-mdi-power-plug-off'
    case ConnectionState.UNKNOWN:
    default:
      return 'i-heroicons-question-mark-circle'
  }
})

const buttonColor = computed(() => {
  if (power.value === PowerState.ON) return 'primary'
  if (power.value === PowerState.OFF) return 'neutral'
  return 'warning'
})

const buttonText = computed(() => {
  return powerStateToString(power.value)
})

const buttonIcon = computed(() => {
  if (power.value === PowerState.ON) return 'i-heroicons-bolt'
  if (power.value === PowerState.OFF) return 'i-mdi-power'
  return 'i-heroicons-question-mark-circle'
})

async function togglePower() {
  console.log('=== POWER BUTTON CLICKED ===')
  console.log('Current power state:', power.value, `(${powerStateToString(power.value)})`)
  console.log('Is connected:', isConnected.value)
  console.log('Is busy:', isBusy.value)

  isBusy.value = true
  try {
    const newState = power.value === PowerState.ON ? 'off' : 'on'
    console.log('Setting power to:', newState)
    await setPower(newState)
    console.log('Power set successfully')
  } catch (error) {
    console.error('Error setting power:', error)
  } finally {
    isBusy.value = false
    console.log('=== POWER BUTTON DONE ===')
  }
}

async function stopAll() {
  isStopping.value = true
  try {
    await stopAllThrottles()
  } catch (error) {
    console.error('Error stopping all throttles:', error)
  } finally {
    isStopping.value = false
  }
}

function handleLogout() {
  emit('logout')
}
</script>
