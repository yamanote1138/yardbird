<template>
  <!-- Connection Setup Screen -->
  <ConnectionSetup
    v-if="!isInitialized"
    ref="setupRef"
    @connect="handleConnect"
  />

  <!-- Main Application -->
  <div v-else class="min-h-screen bg-neutral-950 text-white">
    <!-- Sticky Header Section -->
    <div class="sticky top-0 z-[1000] bg-neutral-950 header-shadow">
      <div class="px-4 py-2 sm:py-3 pb-2">
        <!-- Header -->
        <h1 class="text-lg font-semibold mb-1">{{ railroadName }}</h1>
        <p class="text-neutral-400 text-sm mb-2 sm:mb-3">{{ connectionSubtitle }}</p>

        <!-- Power Control with integrated status -->
        <PowerControl @logout="handleLogout" />
      </div>

      <!-- Tab Navigation -->
      <div class="border-b border-white/10">
        <ul class="flex flex-wrap -mb-px text-sm font-medium text-center">
          <li class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 border-b-2 rounded-t transition-colors group"
              :class="activeTab === 'locos'
                ? 'text-blue-400 border-blue-400'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
              @click="activeTab = 'locos'"
            >
              <UIcon name="i-mdi-train" class="w-4 h-4 me-2" />
              Locomotives
            </button>
          </li>
          <li class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 border-b-2 rounded-t transition-colors group"
              :class="activeTab === 'turnouts'
                ? 'text-blue-400 border-blue-400'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
              @click="activeTab = 'turnouts'"
            >
              <UIcon name="i-mdi-source-branch" class="w-4 h-4 me-2" />
              Turnouts
            </button>
          </li>
          <li class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 border-b-2 rounded-t transition-colors group"
              :class="activeTab === 'lights'
                ? 'text-blue-400 border-blue-400'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
              @click="activeTab = 'lights'"
            >
              <UIcon name="i-mdi-lightbulb-outline" class="w-4 h-4 me-2" />
              Lights
            </button>
          </li>
          <li class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 border-b-2 rounded-t transition-colors group"
              :class="activeTab === 'trams'
                ? 'text-blue-400 border-blue-400'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
              @click="activeTab = 'trams'"
            >
              <UIcon name="i-mdi-tram" class="w-4 h-4 me-2" />
              Trams
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="px-4 pt-2 sm:pt-3">
      <ThrottleList v-show="activeTab === 'locos'" />
      <TurnoutList v-show="activeTab === 'turnouts'" />
      <LightList v-show="activeTab === 'lights'" />
      <TramControl v-show="activeTab === 'trams'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useJmri, type JmriConnectionSettings, ConnectionState } from '@/composables/useJmri'
import { useDccEx } from '@/composables/useDccEx'
import { version as appVersion } from '../package.json'
import { logger } from '@/utils/logger'
import ConnectionSetup from '@/components/ConnectionSetup.vue'
import PowerControl from '@/components/PowerControl.vue'
import ThrottleList from '@/components/ThrottleList.vue'
import TurnoutList from '@/components/TurnoutList.vue'
import LightList from '@/components/LightList.vue'
import TramControl from '@/components/TramControl.vue'
import type { ConnectionSettings } from '@/components/ConnectionSetup.vue'

const { initialize, disconnect, fetchRoster, isConnected, connectionState, railroadName, jmriVersion } = useJmri()
const dccex = useDccEx()

const isInitialized = ref(false)
const activeTab = ref<'locos' | 'turnouts' | 'lights' | 'trams'>('locos')
const setupRef = ref<InstanceType<typeof ConnectionSetup>>()
const connectionHost = ref('')
const connectionMock = ref(false)

const connectionSubtitle = computed(() => {
  const parts = [
    connectionMock.value ? 'mock data' : connectionHost.value,
    jmriVersion.value ? `JMRI ${jmriVersion.value}` : '',
    `TOTI v${appVersion}`
  ]
  return parts.filter(Boolean).join(' | ')
})

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

        // Connect to DCC-EX if configured
        if (settings.dccexEnabled) {
          const dccexUrl = `ws://${settings.dccexHost}:${settings.dccexPort}`
          logger.info('Connecting to DCC-EX proxy at', dccexUrl)
          dccex.connect(dccexUrl)
        }

        // Show main app
        isInitialized.value = true
      } else if ((newState === ConnectionState.DISCONNECTED || newState === ConnectionState.UNKNOWN) &&
                 !isInitialized.value &&
                 oldState !== undefined) {
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
  dccex.disconnect()
  disconnect()
  isInitialized.value = false
  document.title = 'TOTI'
}
</script>

<style scoped>
.header-shadow {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
</style>
