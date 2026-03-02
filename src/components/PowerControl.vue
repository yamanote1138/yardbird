<template>
  <div class="btn-group w-100 mb-2 mb-sm-3" role="group">
    <!-- Combined Connection Status Indicator -->
    <button
      class="btn btn-sm status-indicator"
      :class="statusClass"
      disabled
      :title="statusText"
    >
      <i class="fas" :class="statusIcon"></i>
    </button>
    <button
      class="btn"
      :class="buttonClass"
      @click="togglePower"
      :disabled="!isConnected || isBusy"
      :title="buttonText"
    >
      <i class="fas" :class="buttonIcon"></i>
      <span class="d-none d-sm-inline ms-1">{{ buttonText }}</span>
    </button>
    <button
      class="btn btn-danger"
      @click="stopAll"
      :disabled="!isConnected || isStopping || throttles.length === 0"
      :title="isStopping ? 'Stopping...' : 'Emergency Stop All'"
    >
      <i class="fas fa-hand"></i>
      <span class="d-none d-sm-inline ms-1">{{ isStopping ? 'Stopping...' : 'Stop All' }}</span>
    </button>
    <button
      class="btn btn-secondary"
      @click="handleLogout"
      :title="'Disconnect and Return to Setup'"
    >
      <i class="fas fa-right-from-bracket"></i>
      <span class="d-none d-sm-inline ms-1">Logout</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri, ConnectionState } from '@/composables/useJmri'
import { PowerState, powerStateToString } from 'jmri-client'

const emit = defineEmits<{
  logout: []
}>()

const { power, connectionState, isServerOnline, isConnected, setPower, stopAllThrottles, throttles } = useJmri()
const isBusy = ref(false)
const isStopping = ref(false)

// Combined connection status
const statusClass = computed(() => {
  // If server is down, we can't know JMRI state
  if (!isServerOnline.value) {
    return 'btn-warning'
  }

  // Server is up, show JMRI connection state
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:
      return 'btn-success'
    case ConnectionState.DISCONNECTED:
    case ConnectionState.UNKNOWN:
      return 'btn-warning'
  }
})

const statusText = computed(() => {
  // If server is down, that's the primary issue
  if (!isServerOnline.value) {
    return 'Web Server Offline'
  }

  // Server is up, show JMRI connection state
  let text = ''
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:
      text = 'Connected'
      break
    case ConnectionState.DISCONNECTED:
      text = 'Disconnected'
      break
    case ConnectionState.UNKNOWN:
      text = 'Connection Unknown'
      break
  }
  return text
})

const statusIcon = computed(() => {
  // Server is down - show sad face
  if (!isServerOnline.value) {
    return 'fa-face-frown'
  }

  // Server is up - show JMRI connection state
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:
      return 'fa-plug-circle-bolt'
    case ConnectionState.DISCONNECTED:
      // Disconnected: show X
      return 'fa-plug-circle-xmark'
    case ConnectionState.UNKNOWN:
      // Unknown JMRI state (reconnecting, etc)
      return 'fa-circle-question'
    default:
      return 'fa-circle-question'
  }
})

const buttonClass = computed(() => {
  if (power.value === PowerState.ON) return 'btn-primary'
  if (power.value === PowerState.OFF) return 'btn-secondary'
  return 'btn-warning'  // UNKNOWN state
})

const buttonText = computed(() => {
  return powerStateToString(power.value)
})

const buttonIcon = computed(() => {
  if (power.value === PowerState.ON) return 'fa-bolt'
  if (power.value === PowerState.OFF) return 'fa-power-off'
  return 'fa-circle-question'  // UNKNOWN state
})

async function togglePower() {
  console.log('=== POWER BUTTON CLICKED ===')
  console.log('Current power state:', power.value, `(${powerStateToString(power.value)})`)
  console.log('Is connected:', isConnected.value)
  console.log('Is busy:', isBusy.value)

  isBusy.value = true
  try {
    // Toggle: ON → OFF, OFF → ON, UNKNOWN → ON
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

<style scoped>
/* Status indicator with bright, clear colors */
.status-indicator.btn-success {
  background-color: #28a745;
  border-color: #28a745;
  color: #ffffff;
}


.status-indicator.btn-warning {
  background-color: #ffc107;
  border-color: #ffc107;
  color: #212529;
}

/* Smaller buttons on mobile for vertical space savings */
@media (max-width: 575px) {
  .btn-group .btn {
    padding: 0.375rem 0.5rem;
    font-size: 0.875rem;
  }
}
</style>
