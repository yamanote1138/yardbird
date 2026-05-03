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
      <div class="px-4 md:px-6 py-2 sm:py-3 pb-2 flex items-center gap-3 md:gap-4">
        <!-- YardBird icon -->
        <img src="/favicon.svg" class="w-14 h-14 md:w-16 md:h-16 flex-shrink-0 opacity-80" alt="YardBird" />

        <!-- Railroad name + controls -->
        <div class="flex-1 min-w-0">
          <h1 class="text-lg md:text-xl font-semibold mb-1">{{ railroadName }}</h1>
          <!-- Power Control with integrated status -->
          <HeaderButtons @logout="handleExit" />
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="border-b border-white/10">
        <!-- Edit mode: full tab manager (add/rename/reorder/delete) -->
        <TabManager
          v-if="editMode"
          :active-tab="activeTab"
          @select="activeTab = $event"
          @tabs-changed="onTabsChanged"
        />

        <!-- Run mode: simple tab bar -->
        <ul v-else class="flex flex-wrap -mb-px text-sm md:text-base font-medium text-center">
          <li v-for="tab in tabs" :key="tab.id" class="me-2">
            <button
              class="inline-flex items-center justify-center p-4 md:px-5 md:py-4 border-b-2 rounded-t transition-colors"
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
      </div>
    </div>

    <!-- Widget config modal (global, rendered once) -->
    <WidgetConfigModal />

    <!-- Content area: palette sidebar + tab canvas -->
    <div class="flex min-h-0 overflow-hidden">
      <WidgetPalette />

      <div class="flex-1 overflow-auto px-4 md:px-6 pt-2 sm:pt-3 md:pt-4 min-w-0">
        <!-- No tabs yet: first-run welcome -->
        <div v-if="tabs.length === 0 && !editMode" class="flex flex-col items-center justify-center py-24 text-center px-4">
          <img src="/favicon.svg" class="w-16 h-16 mb-6 opacity-40" alt="YardBird" />
          <h2 class="text-white text-xl font-semibold mb-2">Welcome to YardBird</h2>
          <p class="text-neutral-500 text-sm mb-8 max-w-sm">
            Your dashboard is empty. Switch to edit mode to create tabs and drag widgets onto the canvas.
          </p>
          <UButton color="primary" size="lg" @click="toggleEditMode">
            <template #leading><UIcon name="i-mdi-pencil" /></template>
            Let's go
          </UButton>
        </div>

        <template v-for="tab in tabs" :key="tab.id">
          <div v-show="activeTab === tab.id">
            <TabCanvas
              v-if="tab.widgets.length > 0 || editMode"
              :ref="(el) => { if (el) canvasRefs[tab.id] = el as InstanceType<typeof TabCanvas> }"
              :tab="tab"
              @configure="openWidgetConfig"
              @configure-new="openNewWidgetConfig"
            />
            <!-- Empty tab in run mode: prompt to start editing -->
            <div v-else class="flex flex-col items-center justify-center py-20 text-center">
              <UIcon name="i-mdi-view-grid-plus-outline" class="w-14 h-14 text-neutral-700 mb-4" />
              <h3 class="text-neutral-400 text-base font-medium mb-2">This tab has no widgets</h3>
              <p class="text-neutral-600 text-sm mb-6 max-w-xs">
                Switch to edit mode and drag widgets from the palette to build your dashboard.
              </p>
              <UButton color="primary" @click="toggleEditMode">
                <template #leading><UIcon name="i-mdi-pencil" /></template>
                Let's go
              </UButton>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useJmri, type JmriConnectionSettings, ConnectionState } from '@/plugins/jmri'
import { useHomeAssistant } from '@/plugins/homeassistant'
import { useConfig } from '@/core/useConfig'
import { useEditMode } from '@/composables/useEditMode'
import { setDebugMode } from '@/utils/logger'
import { logger } from '@/utils/logger'
import ConnectionSetup from '@/components/ConnectionSetup.vue'
import HeaderButtons from '@/components/HeaderButtons.vue'
import TabCanvas from '@/components/TabCanvas.vue'
import WidgetPalette from '@/widgets/WidgetPalette.vue'
import WidgetConfigModal from '@/widgets/WidgetConfigModal.vue'
import TabManager from '@/components/TabManager.vue'

import type { WidgetInstance } from '@/core/types'
import { useWidgetConfig } from '@/composables/useWidgetConfig'

const cfg = useConfig()
const { editMode, toggle: toggleEditMode, exit: exitEditMode } = useEditMode()
const wc = useWidgetConfig()
const { initialize, disconnect, fetchRoster, isConnected, connectionState, railroadName, applyCommandStationsConfig } = useJmri()
const ha = useHomeAssistant()

const isInitialized = ref(false)
const activeTab = ref('')
const setupRef = ref<InstanceType<typeof ConnectionSetup>>()

// Map of tab id → canvas ref (populated by template)
const canvasRefs = ref<Record<string, InstanceType<typeof TabCanvas>>>({})

function openWidgetConfig(widgetId: string) {
  const tab = cfg.tabs.value.find(t => t.widgets.some(w => w.id === widgetId))
  if (!tab) return
  const widget = tab.widgets.find(w => w.id === widgetId)!
  wc.openForEdit(widgetId, widget.type, widget.config, (newConfig) => {
    cfg.saveTabs(cfg.tabs.value.map(t => ({
      ...t,
      widgets: t.widgets.map(w => w.id === widgetId ? { ...w, config: newConfig } : w),
    })))
  })
}

function onTabsChanged() {
  // Ensure the active tab still exists after add/delete/reorder
  const current = cfg.tabs.value
  if (!current.find(t => t.id === activeTab.value) && current.length) {
    activeTab.value = current[0].id
  }
}

function openNewWidgetConfig(widget: WidgetInstance) {
  const canvas = canvasRefs.value[activeTab.value]
  wc.openForNew(
    widget,
    (configured) => canvas?.commitWidget(configured),
    () => {},
  )
}

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

watch(railroadName, (newName) => {
  document.title = newName
}, { immediate: true })

// Re-apply command stations when config changes while connected (e.g. after import)
watch(
  () => cfg.jmri.value?.commandStations,
  async (newConfig) => {
    if (isConnected.value) {
      await applyCommandStationsConfig(newConfig)
    }
  },
  { deep: true }
)

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
      commandStationsConfig: jmri.commandStations,
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
