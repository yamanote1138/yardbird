<template>
  <div class="min-h-screen bg-neutral-950 text-white">
    <!-- Sticky Header Section -->
    <div class="sticky top-0 z-[1000] bg-neutral-950 shadow-md">
      <div class="px-4 py-2 sm:py-3 pb-2">
        <!-- Header -->
        <h1 class="text-lg font-semibold mb-1">Trains on the Interwebs</h1>
        <p class="text-neutral-400 text-sm mb-2 sm:mb-3">control your JMRI-based layout</p>
      </div>
      <hr class="border-white/10 m-0">
    </div>

    <!-- Setup Form Content -->
    <div class="px-4 pt-3">
      <div class="flex justify-center">
        <div class="w-full md:max-w-2xl lg:max-w-xl">
          <form @submit.prevent="handleConnect">
            <!-- JMRI Server Settings -->
            <div class="p-4 bg-white/5 rounded-md mb-4">
              <div class="mb-4">
                <label for="server" class="block text-sm font-medium mb-1">JMRI Server</label>
                <UInput
                  id="server"
                  v-model="serverAddress"
                  placeholder="raspi-jmri.local:12080"
                  :required="!settings.mockEnabled"
                  :disabled="settings.mockEnabled"
                  size="lg"
                />
                <small class="text-neutral-400 text-xs mt-1 block">
                  Host and port (e.g., raspi-jmri.local:12080 or 192.168.1.100:12080)
                </small>
              </div>
            </div>

            <!-- Secure (WSS) -->
            <div class="mb-4">
              <UCheckbox
                id="secure"
                v-model="settings.secure"
                :disabled="settings.mockEnabled"
              >
                <template #label>
                  <span class="flex items-center gap-1">
                    <UIcon name="i-heroicons-shield-check" />
                    Secure Connection (WSS)
                  </span>
                </template>
              </UCheckbox>
              <small class="text-neutral-400 text-xs block ml-6 mt-1">
                Use encrypted WebSocket connection
              </small>
            </div>

            <!-- Demo Mode -->
            <div class="mb-4">
              <UCheckbox
                id="demo"
                v-model="settings.mockEnabled"
              >
                <template #label>
                  <span class="flex items-center gap-1">
                    <UIcon name="i-mdi-test-tube" />
                    Demo Mode
                  </span>
                </template>
              </UCheckbox>
              <small class="text-neutral-400 text-xs block ml-6 mt-1">
                No hardware required - uses simulated data
              </small>
            </div>

            <!-- Debug Logging -->
            <div class="mb-4">
              <UCheckbox
                id="debug"
                v-model="settings.debugEnabled"
              >
                <template #label>
                  <span class="flex items-center gap-1">
                    <UIcon name="i-mdi-bug" />
                    Enable Debug Logging
                  </span>
                </template>
              </UCheckbox>
              <small class="text-neutral-400 text-xs block ml-6 mt-1">
                Show detailed logs in console
              </small>
            </div>

            <!-- Remember Settings -->
            <div class="mb-6">
              <UCheckbox
                id="remember"
                v-model="rememberSettings"
              >
                <template #label>
                  <span class="flex items-center gap-1">
                    <UIcon name="i-mdi-floppy" />
                    Remember these settings
                  </span>
                </template>
              </UCheckbox>
              <small class="text-neutral-400 text-xs block ml-6 mt-1">
                Save settings in browser for next time
              </small>
            </div>

            <!-- Error Message -->
            <UAlert
              v-if="errorMessage"
              color="error"
              icon="i-heroicons-exclamation-triangle"
              :title="errorMessage"
              class="mb-4"
            />

            <!-- Connect Button -->
            <UButton
              type="submit"
              color="success"
              size="xl"
              block
              :loading="isConnecting"
              :disabled="isConnecting"
            >
              <template v-if="!isConnecting" #leading>
                <UIcon name="i-mdi-power-plug" />
              </template>
              {{ isConnecting ? 'Connecting...' : 'Connect' }}
            </UButton>
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
    settings.value.port = 12080
  }

  // Save settings to localStorage if remember checkbox is checked
  if (rememberSettings.value) {
    localStorage.setItem('jmri-connection-settings', JSON.stringify(settings.value))
  } else {
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
