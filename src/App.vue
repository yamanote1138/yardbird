<template>
  <!-- Connection Setup Screen -->
  <ConnectionSetup
    v-if="!isInitialized"
    ref="setupRef"
    @connect="handleConnect"
  />

  <!-- Main Application -->
  <div v-else class="min-vh-100 bg-dark text-light">
    <!-- Sticky Header Section -->
    <div class="sticky-header bg-dark">
      <div class="container-fluid py-2 py-sm-3 pb-2">
        <!-- Header -->
        <h1 class="h5 h5-sm-4 mb-1">{{ railroadName }}</h1>
        <p class="text-muted small mb-2 mb-sm-3">{{ connectionSubtitle }}</p>

        <!-- Power Control with integrated status -->
        <PowerControl @logout="handleLogout" />
      </div>
      <hr class="divider m-0">
    </div>

    <!-- Scrollable Content -->
    <div class="container-fluid px-3 pt-2 pt-sm-3">
      <!-- Throttle List -->
      <ThrottleList />

      <!-- Turnout List -->
      <TurnoutList />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useJmri, type JmriConnectionSettings, ConnectionState } from '@/composables/useJmri'
import { logger } from '@/utils/logger'
import ConnectionSetup from '@/components/ConnectionSetup.vue'
import PowerControl from '@/components/PowerControl.vue'
import ThrottleList from '@/components/ThrottleList.vue'
import TurnoutList from '@/components/TurnoutList.vue'
import type { ConnectionSettings } from '@/components/ConnectionSetup.vue'

const { initialize, disconnect, fetchRoster, isConnected, connectionState, railroadName } = useJmri()

const isInitialized = ref(false)
const setupRef = ref<InstanceType<typeof ConnectionSetup>>()
const connectionHost = ref('')
const connectionMock = ref(false)

const connectionSubtitle = computed(() =>
  connectionMock.value ? 'using mock data' : connectionHost.value
)

// Update page title when railroad name changes
watch(railroadName, (newName) => {
  document.title = newName
}, { immediate: true })

const handleConnect = async (settings: ConnectionSettings) => {
  try {
    logger.info('Connecting with settings:', settings)

    // Convert UI settings to JMRI settings
    const jmriSettings: JmriConnectionSettings = {
      host: settings.host,
      port: settings.port,
      protocol: settings.secure ? 'wss' : 'ws',
      mockEnabled: settings.mockEnabled,
      mockDelay: 50
    }

    let connectionTimeout: NodeJS.Timeout | null = null
    let hasHandledError = false

    const handleConnectionError = (message: string) => {
      if (hasHandledError) return
      hasHandledError = true

      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
      }
      setupRef.value?.setError(message)
      disconnect()
    }

    // Store connection info for display
    connectionHost.value = `${settings.host}:${settings.port}`
    connectionMock.value = settings.mockEnabled

    // Initialize JMRI client
    initialize(jmriSettings)

    // Wait for connection to succeed or fail
    connectionTimeout = setTimeout(() => {
      if (!isConnected.value && !isInitialized.value) {
        logger.error('Connection timeout after 10 seconds')
        const protocol = settings.secure ? 'wss' : 'ws'
        handleConnectionError(
          `Connection timeout. Unable to reach ${protocol}://${settings.host}:${settings.port}. ` +
          `Check that the JMRI server is running and accessible.`
        )
      }
    }, 10000)

    // Watch for connection state changes
    const stopWatching = watch(connectionState, async (newState, oldState) => {
      logger.debug(`Connection state changed: ${oldState} -> ${newState}`)

      if (newState === ConnectionState.CONNECTED) {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout)
        }
        stopWatching()

        logger.info('Successfully connected to JMRI')

        // Fetch roster data
        try {
          await fetchRoster()
        } catch (error) {
          logger.error('Failed to fetch roster:', error)
        }

        // Show main app
        isInitialized.value = true
      } else if ((newState === ConnectionState.DISCONNECTED || newState === ConnectionState.UNKNOWN) &&
                 !isInitialized.value &&
                 oldState !== undefined) {
        // Connection failed during initial connection attempt
        // Only trigger if we had a previous state (not the initial state)
        const protocol = settings.secure ? 'wss' : 'ws'
        const url = `${protocol}://${settings.host}:${settings.port}`

        logger.error('Connection failed to:', url)
        stopWatching()
        handleConnectionError(
          `Failed to connect to ${url}. ` +
          `Possible issues: hostname not found, port unreachable, or JMRI server not running.`
        )
      }
    })

  } catch (error: any) {
    logger.error('Failed to initialize connection:', error)

    // Provide detailed error message
    let errorMsg = 'Failed to connect: '
    if (error.message) {
      errorMsg += error.message
    } else {
      errorMsg += 'Unknown error occurred'
    }

    setupRef.value?.setError(errorMsg)
  }
}

const handleLogout = () => {
  logger.info('Logging out')
  disconnect()
  isInitialized.value = false
  document.title = 'Trains Over the Interwebs'
}
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
</style>
