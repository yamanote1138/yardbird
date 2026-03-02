<template>
  <div class="min-vh-100 bg-dark text-light">
    <!-- Sticky Header Section -->
    <div class="sticky-header bg-dark">
      <div class="container-fluid py-2 py-sm-3 pb-2">
        <!-- Header -->
        <h1 class="h5 h5-sm-4 mb-1">Trains on the Interwebs</h1>
        <p class="text-muted small mb-2 mb-sm-3">control your JMRI-based layout</p>
      </div>
      <hr class="divider m-0">
    </div>

    <!-- Setup Form Content -->
    <div class="container-fluid px-3 pt-3">
      <div class="row justify-content-center">
        <div class="col-12 col-md-8 col-lg-6">
          <form @submit.prevent="handleConnect">
            <!-- JMRI Server Settings -->
            <div class="settings-panel">
              <div class="mb-3">
                <label for="server" class="form-label">JMRI Server</label>
                <input
                  type="text"
                  class="form-control form-control-dark"
                  id="server"
                  v-model="serverAddress"
                  placeholder="raspi-jmri.local:12080"
                  :required="!settings.mockEnabled"
                  :disabled="settings.mockEnabled"
                >
                <small class="form-text text-muted">
                  Host and port (e.g., raspi-jmri.local:12080 or 192.168.1.100:12080)
                </small>
              </div>
            </div>

            <!-- Secure (WSS) -->
            <div class="mb-3">
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="secure"
                  v-model="settings.secure"
                  :disabled="settings.mockEnabled"
                >
                <label class="form-check-label" for="secure">
                  <i class="fas fa-shield-halved me-1"></i>
                  Secure Connection (WSS)
                </label>
                <small class="form-text text-muted d-block ms-4">
                  Use encrypted WebSocket connection
                </small>
              </div>
            </div>

            <!-- Demo Mode -->
            <div class="mb-3">
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="demo"
                  v-model="settings.mockEnabled"
                >
                <label class="form-check-label" for="demo">
                  <i class="fas fa-vial me-1"></i>
                  Demo Mode
                </label>
                <small class="form-text text-muted d-block ms-4">
                  No hardware required - uses simulated data
                </small>
              </div>
            </div>

            <!-- Debug Logging -->
            <div class="mb-3">
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="debug"
                  v-model="settings.debugEnabled"
                >
                <label class="form-check-label" for="debug">
                  <i class="fas fa-bug me-1"></i>
                  Enable Debug Logging
                </label>
                <small class="form-text text-muted d-block ms-4">
                  Show detailed logs in console
                </small>
              </div>
            </div>

            <!-- Remember Settings -->
            <div class="mb-4">
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="remember"
                  v-model="rememberSettings"
                >
                <label class="form-check-label" for="remember">
                  <i class="fas fa-floppy-disk me-1"></i>
                  Remember these settings
                </label>
                <small class="form-text text-muted d-block ms-4">
                  Save settings in browser for next time
                </small>
              </div>
            </div>

            <!-- Error Message -->
            <div v-if="errorMessage" class="alert alert-danger mb-3">
              <i class="fas fa-triangle-exclamation me-2"></i>
              {{ errorMessage }}
            </div>

            <!-- Connect Button -->
            <button
              type="submit"
              class="btn btn-success btn-lg w-100"
              :disabled="isConnecting"
            >
              <span v-if="isConnecting" class="spinner-border spinner-border-sm me-2"></span>
              <i v-else class="fas fa-plug-circle-bolt me-2"></i>
              {{ isConnecting ? 'Connecting...' : 'Connect' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

export interface ConnectionSettings {
  host: string
  port: number
  secure: boolean
  mockEnabled: boolean
  debugEnabled: boolean
}

const emit = defineEmits<{
  connect: [settings: ConnectionSettings]
}>()

const settings = ref<ConnectionSettings>({
  host: 'raspi-jmri.local',
  port: 12080,
  secure: false,
  mockEnabled: false,
  debugEnabled: false
})

const isConnecting = ref(false)
const errorMessage = ref('')
const rememberSettings = ref(false)

// Combined server address (host:port)
const serverAddress = computed({
  get: () => `${settings.value.host}:${settings.value.port}`,
  set: (value: string) => {
    const parts = value.split(':')
    if (parts.length >= 1) {
      settings.value.host = parts[0].trim()
    }
    if (parts.length >= 2) {
      const port = parseInt(parts[1].trim())
      if (!isNaN(port) && port > 0 && port <= 65535) {
        settings.value.port = port
      }
    }
  }
})

// Load saved settings from localStorage
onMounted(() => {
  const saved = localStorage.getItem('jmri-connection-settings')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      settings.value = { ...settings.value, ...parsed }
      rememberSettings.value = true
    } catch (error) {
      console.error('Failed to parse saved settings:', error)
    }
  }
})

const handleConnect = () => {
  errorMessage.value = ''
  isConnecting.value = true

  // Parse server address to ensure host and port are set
  const parts = serverAddress.value.split(':')
  if (parts.length < 2) {
    // If no port specified, use default
    settings.value.port = 12080
  }

  // Save settings to localStorage if remember checkbox is checked
  if (rememberSettings.value) {
    localStorage.setItem('jmri-connection-settings', JSON.stringify(settings.value))
  } else {
    // Clear saved settings if remember is unchecked
    localStorage.removeItem('jmri-connection-settings')
  }

  // Always save debug setting separately for logger
  localStorage.setItem('jmri-debug-enabled', settings.value.debugEnabled ? 'true' : 'false')

  // Emit connection event with settings
  emit('connect', settings.value)
}

// Expose method to reset connecting state (in case of error)
defineExpose({
  setError: (message: string) => {
    console.error('Connection error:', message)
    errorMessage.value = message
    isConnecting.value = false
  },
  setConnecting: (connecting: boolean) => {
    isConnecting.value = connecting
  }
})
</script>

<style scoped>
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.divider {
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  opacity: 0.5;
}

.form-control-dark {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.form-control-dark:focus {
  background-color: rgba(255, 255, 255, 0.08);
  border-color: var(--bs-primary);
  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
  color: #fff;
}

.form-control-dark::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.form-control-dark:disabled {
  background-color: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
  cursor: not-allowed;
}

.settings-panel {
  padding: 1rem;
  background-color: rgba(255, 255, 255, 0.03);
  border-radius: 0.375rem;
  margin-bottom: 1rem;
}

/* Smaller buttons on mobile for vertical space savings */
@media (max-width: 575px) {
  .btn-group .btn {
    padding: 0.375rem 0.5rem;
    font-size: 0.875rem;
  }
}
</style>
