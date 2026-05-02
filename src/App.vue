<template>
  <!-- Config loading -->
  <div v-if="configLoading" class="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
    <div class="text-center">
      <img src="/favicon.svg" class="w-16 h-16 mx-auto mb-4 opacity-60" alt="YardBird" />
      <p class="text-neutral-400 text-sm">Loading config...</p>
    </div>
  </div>

  <!-- Connection Setup Screen -->
  <ConnectionSetup
    v-else-if="!isInitialized"
    ref="setupRef"
    @connect="handleConnect"
  />

  <!-- Main Application -->
  <div v-else class="min-h-screen bg-neutral-950 text-white">
    <!-- Sticky Header Section -->
    <div class="sticky top-0 z-[1000] bg-neutral-950 header-shadow">
      <div class="px-4 md:px-6 py-2 sm:py-3 pb-2">
        <!-- Header row -->
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h1 class="text-lg md:text-xl font-semibold mb-1">{{ railroadName }}</h1>
            <p class="text-neutral-400 text-sm md:text-base mb-2 sm:mb-3">{{ connectionSubtitle }}</p>
          </div>
          <!-- Edit mode toggle -->
          <button
            :title="editMode ? 'Exit edit mode' : 'Edit layout'"
            class="flex-shrink-0 mt-0.5 p-1.5 rounded transition-colors"
            :class="editMode
              ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20'
              : 'text-white/30 hover:text-white/60 hover:bg-white/5'"
            @click="toggleEditMode"
          >
            <UIcon :name="editMode ? 'i-mdi-lock-open' : 'i-mdi-pencil'" class="w-5 h-5" />
          </button>
        </div>

        <!-- Power Control with integrated status -->
        <PowerControl @logout="handleExit" />
      </div>

      <!-- Tab Navigation -->
      <div class="border-b border-white/10">
        <div class="flex items-center">
          <ul class="flex flex-wrap -mb-px text-sm md:text-base font-medium text-center flex-1">
            <li v-for="tab in tabs" :key="tab.id" class="me-2">
              <button
                class="inline-flex items-center justify-center p-4 md:px-5 md:py-4 border-b-2 rounded-t transition-colors group"
                :class="activeTab === tab.id
                  ? 'text-blue-400 border-blue-400'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
                @click="activeTab = tab.id"
              >
                <UIcon :name="tab.icon" class="w-4 h-4 md:w-5 md:h-5 me-2" />
                {{ tab.name }}
              </button>
            </li>
          </ul>

          <!-- Edit mode indicator + add tab (Phase 7 adds full TabManager) -->
          <div v-if="editMode" class="flex items-center gap-2 px-3 pb-px flex-shrink-0">
            <span class="text-xs text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">
              Editing
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="px-4 md:px-6 pt-2 sm:pt-3 md:pt-4">
      <template v-for="tab in tabs" :key="tab.id">
        <component
          :is="tabComponents[tab.id]"
          v-if="tabComponents[tab.id]"
          v-show="activeTab === tab.id"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, type Component } from 'vue'
import { useJmri, type JmriConnectionSettings, ConnectionState } from '@/plugins/jmri'
import { useHomeAssistant } from '@/plugins/homeassistant'
import { useConfig } from '@/core/useConfig'
import { useEditMode } from '@/composables/useEditMode'
import { setDebugMode } from '@/utils/logger'
import { logger } from '@/utils/logger'
import { version as appVersion } from '../package.json'
import ConnectionSetup from '@/components/ConnectionSetup.vue'
import PowerControl from '@/components/PowerControl.vue'
import ThrottleList from '@/plugins/jmri/components/ThrottleList.vue'
import TurnoutList from '@/plugins/jmri/components/TurnoutList.vue'
import LightList from '@/plugins/jmri/components/LightList.vue'
import TramWidget from '@/plugins/jmri/components/TramWidget.vue'
import SceneWidget from '@/plugins/homeassistant/components/SceneWidget.vue'

const tabComponents: Record<string, Component> = {
  throttles: ThrottleList,
  turnouts:  TurnoutList,
  lights:    LightList,
  trams:     TramWidget,
  room:      SceneWidget,
}

const cfg = useConfig()
const { editMode, toggle: toggleEditMode, exit: exitEditMode } = useEditMode()
const { initialize, disconnect, fetchRoster, isConnected, connectionState, railroadName, jmriVersion } = useJmri()
const ha = useHomeAssistant()

const isInitialized = ref(false)
const activeTab = ref('')
const setupRef = ref<InstanceType<typeof ConnectionSetup>>()

const configLoading = computed(() => cfg.loading.value)
const tabs = computed(() => cfg.tabs.value)

// Set first tab as active once config loads
watch(tabs, (newTabs) => {
  if (newTabs.length && !activeTab.value) {
    activeTab.value = newTabs[0].id
  }
}, { immediate: true })

// Apply debug mode from config
watch(cfg.debug, (enabled) => setDebugMode(enabled), { immediate: true })

const connectionSubtitle = computed(() => {
  const jmri = cfg.jmri.value
  const parts = [
    jmri?.mock ? 'mock data' : jmri ? `${jmri.host}:${jmri.port}` : '',
    jmriVersion.value ? `JMRI ${jmriVersion.value}` : '',
    `YardBird v${appVersion}`
  ]
  return parts.filter(Boolean).join(' | ')
})

watch(railroadName, (newName) => {
  document.title = newName
}, { immediate: true })

const handleConnect = async () => {
  const jmri = cfg.jmri.value
  if (!jmri) {
    setupRef.value?.setError('No JMRI connection configured.')
    return
  }

  try {
    logger.info('Connecting with config:', cfg.connections.value)

    const jmriSettings: JmriConnectionSettings = {
      host: jmri.host,
      port: jmri.port,
      protocol: jmri.secure ? 'wss' : 'ws',
      mockEnabled: jmri.mock ?? false,
      mockDelay: 50,
      tramPrefix: jmri.tramPrefix,
      powerZonesConfig: jmri.powerZones,
    }

    let connectionTimeout: NodeJS.Timeout | null = null
    let hasHandledError = false

    const handleConnectionError = (message: string) => {
      if (hasHandledError) return
      hasHandledError = true
      if (connectionTimeout) clearTimeout(connectionTimeout)
      setupRef.value?.setError(message)
      disconnect()
    }

    initialize(jmriSettings)

    connectionTimeout = setTimeout(() => {
      if (!isConnected.value && !isInitialized.value) {
        logger.error('Connection timeout after 10 seconds')
        const protocol = jmri.secure ? 'wss' : 'ws'
        handleConnectionError(
          `Connection timeout. Unable to reach ${protocol}://${jmri.host}:${jmri.port}. ` +
          `Check that the JMRI server is running and accessible.`
        )
      }
    }, 10000)

    const stopWatching = watch(connectionState, async (newState, oldState) => {
      logger.debug(`Connection state changed: ${oldState} -> ${newState}`)

      if (newState === ConnectionState.CONNECTED) {
        if (connectionTimeout) clearTimeout(connectionTimeout)
        stopWatching()

        logger.info('Successfully connected to JMRI')

        try {
          await fetchRoster()
        } catch (error) {
          logger.error('Failed to fetch roster:', error)
        }

        const haCfg = cfg.homeassistant.value
        if (haCfg?.enabled && haCfg.url && haCfg.token && haCfg.area) {
          const haWsUrl = haCfg.url.replace(/^http/, 'ws').replace(/\/?$/, '/api/websocket')
          logger.info('Connecting to Home Assistant at', haWsUrl)
          ha.connect(haWsUrl, haCfg.token, haCfg.area)
        }

        isInitialized.value = true
      } else if (
        (newState === ConnectionState.DISCONNECTED || newState === ConnectionState.UNKNOWN) &&
        !isInitialized.value &&
        oldState !== undefined
      ) {
        const protocol = jmri.secure ? 'wss' : 'ws'
        const url = `${protocol}://${jmri.host}:${jmri.port}`
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
  exitEditMode()
  ha.disconnect()
  disconnect()
  isInitialized.value = false
  document.title = 'YardBird'
}
</script>

<style scoped>
.header-shadow {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
</style>
