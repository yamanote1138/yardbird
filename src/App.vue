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
      <div class="px-4 md:px-6 py-2 sm:py-3 pb-2">
        <!-- Header -->
        <h1 class="text-lg md:text-xl font-semibold mb-1">{{ railroadName }}</h1>
        <p class="text-neutral-400 text-sm md:text-base mb-2 sm:mb-3">{{ connectionSubtitle }}</p>

        <!-- Power Control with integrated status -->
        <PowerControl @logout="handleExit" />
      </div>

      <!-- Tab Navigation -->
      <div class="border-b border-white/10">
        <ul class="flex flex-wrap -mb-px text-sm md:text-base font-medium text-center">
          <li class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 md:px-5 md:py-4 border-b-2 rounded-t transition-colors group"
              :class="activeTab === 'locos'
                ? 'text-blue-400 border-blue-400'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
              @click="activeTab = 'locos'"
            >
              <UIcon name="i-mdi-train" class="w-4 h-4 md:w-5 md:h-5 me-2" />
              Locomotives
            </button>
          </li>
          <li class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 md:px-5 md:py-4 border-b-2 rounded-t transition-colors group"
              :class="activeTab === 'turnouts'
                ? 'text-blue-400 border-blue-400'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
              @click="activeTab = 'turnouts'"
            >
              <UIcon name="i-mdi-source-branch" class="w-4 h-4 md:w-5 md:h-5 me-2" />
              Turnouts
            </button>
          </li>
          <li class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 md:px-5 md:py-4 border-b-2 rounded-t transition-colors group"
              :class="activeTab === 'lights'
                ? 'text-blue-400 border-blue-400'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
              @click="activeTab = 'lights'"
            >
              <UIcon name="i-mdi-lightbulb-outline" class="w-4 h-4 md:w-5 md:h-5 me-2" />
              Lights
            </button>
          </li>
          <li class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 md:px-5 md:py-4 border-b-2 rounded-t transition-colors group"
              :class="activeTab === 'trams'
                ? 'text-blue-400 border-blue-400'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
              @click="activeTab = 'trams'"
            >
              <UIcon name="i-mdi-tram" class="w-4 h-4 md:w-5 md:h-5 me-2" />
              Trams
            </button>
          </li>
          <li v-if="haEnabled" class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 md:px-5 md:py-4 border-b-2 rounded-t transition-colors group"
              :class="activeTab === 'room'
                ? 'text-blue-400 border-blue-400'
                : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
              @click="activeTab = 'room'"
            >
              <UIcon name="i-mdi-home-assistant" class="w-4 h-4 md:w-5 md:h-5 me-2" />
              Room
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="px-4 md:px-6 pt-2 sm:pt-3 md:pt-4">
      <ThrottleList v-show="activeTab === 'locos'" />
      <TurnoutList v-show="activeTab === 'turnouts'" />
      <LightList v-show="activeTab === 'lights'" />
      <TramControl v-show="activeTab === 'trams'" />
      <RoomControl v-show="activeTab === 'room'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useJmri, type JmriConnectionSettings, ConnectionState } from '@/composables/useJmri'
import { useDccEx } from '@/composables/useDccEx'
import { useHomeAssistant } from '@/composables/useHomeAssistant'
import { getConfig } from '@/utils/config'
import { version as appVersion } from '../package.json'
import { logger } from '@/utils/logger'
import ConnectionSetup from '@/components/ConnectionSetup.vue'
import PowerControl from '@/components/PowerControl.vue'
import ThrottleList from '@/components/ThrottleList.vue'
import TurnoutList from '@/components/TurnoutList.vue'
import LightList from '@/components/LightList.vue'
import TramControl from '@/components/TramControl.vue'
import RoomControl from '@/components/RoomControl.vue'

const { initialize, disconnect, fetchRoster, isConnected, connectionState, railroadName, jmriVersion } = useJmri()
const dccex = useDccEx()
const ha = useHomeAssistant()

const isInitialized = ref(false)
const activeTab = ref<'locos' | 'turnouts' | 'lights' | 'trams' | 'room'>('locos')
const haEnabled = ref(false)
const setupRef = ref<InstanceType<typeof ConnectionSetup>>()

const connectionSubtitle = computed(() => {
  const cfg = getConfig()
  const parts = [
    cfg.mock ? 'mock data' : `${cfg.jmriHost}:${cfg.jmriPort}`,
    jmriVersion.value ? `JMRI ${jmriVersion.value}` : '',
    `YardBird v${appVersion}`
  ]
  return parts.filter(Boolean).join(' | ')
})

watch(railroadName, (newName) => {
  document.title = newName
}, { immediate: true })

const handleConnect = async () => {
  const cfg = getConfig()

  try {
    logger.info('Connecting with config:', cfg)

    const jmriSettings: JmriConnectionSettings = {
      host: cfg.jmriHost,
      port: cfg.jmriPort,
      protocol: cfg.jmriSecure ? 'wss' : 'ws',
      mockEnabled: cfg.mock,
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

    initialize(jmriSettings)

    connectionTimeout = setTimeout(() => {
      if (!isConnected.value && !isInitialized.value) {
        logger.error('Connection timeout after 10 seconds')
        const protocol = cfg.jmriSecure ? 'wss' : 'ws'
        handleConnectionError(
          `Connection timeout. Unable to reach ${protocol}://${cfg.jmriHost}:${cfg.jmriPort}. ` +
          `Check that the JMRI server is running and accessible.`
        )
      }
    }, 10000)

    const stopWatching = watch(connectionState, async (newState, oldState) => {
      logger.debug(`Connection state changed: ${oldState} -> ${newState}`)

      if (newState === ConnectionState.CONNECTED) {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout)
        }
        stopWatching()

        logger.info('Successfully connected to JMRI')

        try {
          await fetchRoster()
        } catch (error) {
          logger.error('Failed to fetch roster:', error)
        }

        if (cfg.dccexEnabled) {
          const dccexUrl = `ws://${cfg.dccexHost}:${cfg.dccexPort}`
          logger.info('Connecting to DCC-EX proxy at', dccexUrl)
          dccex.setDefaultPwmFrequency(cfg.dccexPwmFreq)
          dccex.connect(dccexUrl)
        }

        if (cfg.haEnabled && cfg.haUrl && cfg.haToken && cfg.haArea) {
          const haWsUrl = cfg.haUrl.replace(/^http/, 'ws').replace(/\/?$/, '/api/websocket')
          logger.info('Connecting to Home Assistant at', haWsUrl)
          ha.connect(haWsUrl, cfg.haToken, cfg.haArea)
        }
        haEnabled.value = cfg.haEnabled && !!cfg.haUrl

        isInitialized.value = true
      } else if ((newState === ConnectionState.DISCONNECTED || newState === ConnectionState.UNKNOWN) &&
                 !isInitialized.value &&
                 oldState !== undefined) {
        const protocol = cfg.jmriSecure ? 'wss' : 'ws'
        const url = `${protocol}://${cfg.jmriHost}:${cfg.jmriPort}`

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
    setupRef.value?.setError('Failed to connect: ' + (error.message ?? 'Unknown error occurred'))
  }
}

const handleExit = () => {
  logger.info('Exiting to welcome screen')
  ha.disconnect()
  dccex.disconnect()
  disconnect()
  isInitialized.value = false
  haEnabled.value = false
  document.title = 'YardBird'
}
</script>

<style scoped>
.header-shadow {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
</style>
