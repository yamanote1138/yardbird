<template>
  <div class="flex w-full gap-1 md:gap-2 mb-2 sm:mb-3" role="group">
    <!-- Connection status indicator -->
    <UButton
      size="sm"
      :color="statusColor"
      disabled
      :title="statusText"
    >
      <UIcon :name="statusIcon" />
    </UButton>

    <!-- Combined power button -->
    <UButton
      :color="combinedPowerColor"
      @click="handleCombinedPower"
      :disabled="!isConnected || isBusy"
      :title="combinedPowerTitle"
    >
      <template #leading>
        <UIcon :name="combinedPowerIcon" />
      </template>
      <span class="hidden sm:inline">{{ combinedPowerLabel }}</span>
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
      :color="editMode ? 'primary' : 'neutral'"
      :variant="editMode ? 'subtle' : 'outline'"
      @click="toggleEditMode"
      :title="editMode ? 'Save layout' : 'Edit layout'"
    >
      <UIcon :name="editMode ? 'i-mdi-content-save' : 'i-mdi-pencil'" class="w-5 h-5" />
    </UButton>

    <UButton
      color="neutral"
      variant="outline"
      @click="showInfoModal = true"
      title="About"
    >
      <UIcon name="i-heroicons-information-circle" class="w-5 h-5" />
    </UButton>

    <UButton
      color="neutral"
      class="ml-auto"
      @click="handleLogout"
      title="Return to Welcome Screen"
    >
      <template #leading>
        <UIcon name="i-heroicons-arrow-right-on-rectangle" />
      </template>
      <span class="hidden sm:inline">Exit</span>
    </UButton>
  </div>

  <!-- About modal -->
  <UModal v-model:open="showInfoModal" title="About" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <dl class="space-y-2 text-sm">
        <div class="flex justify-between gap-4">
          <dt class="text-neutral-500">YardBird</dt>
          <dd class="text-neutral-200 font-mono">v{{ appVersion }}</dd>
        </div>
        <div v-if="railroadName" class="flex justify-between gap-4">
          <dt class="text-neutral-500">Railroad</dt>
          <dd class="text-neutral-200">{{ railroadName }}</dd>
        </div>
        <template v-if="jmriConfig">
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">JMRI</dt>
            <dd class="text-neutral-200 font-mono">
              {{ jmriVersion || '—' }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">JMRI host</dt>
            <dd class="text-neutral-200 font-mono">
              {{ jmriConfig.mock ? 'mock' : `${jmriConfig.host}:${jmriConfig.port}` }}
            </dd>
          </div>
        </template>
        <template v-if="haConfig">
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">Home Assistant</dt>
            <dd class="text-neutral-200 font-mono truncate max-w-[180px]">{{ haConfig.url }}</dd>
          </div>
        </template>
      </dl>
    </template>
    <template #footer>
      <div class="flex justify-end">
        <UButton color="neutral" variant="ghost" @click="showInfoModal = false">Close</UButton>
      </div>
    </template>
  </UModal>

  <!-- Power-on exit warning -->
  <UModal v-model:open="showExitWarning" title="Power is still on" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <p class="text-neutral-300 text-sm">
        {{ activeZoneCount }} power zone{{ activeZoneCount !== 1 ? 's are' : ' is' }} still on.
        Turn off power before exiting?
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 flex-wrap">
        <UButton color="neutral" variant="ghost" @click="showExitWarning = false">Cancel</UButton>
        <UButton color="neutral" variant="outline" @click="emit('logout')">Exit anyway</UButton>
        <UButton color="primary" :loading="isBusy" @click="turnOffAndExit">Turn off and exit</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri, ConnectionState } from '@/plugins/jmri'
import { useConfig } from '@/core/useConfig'
import { useEditMode } from '@/composables/useEditMode'
import { PowerState } from 'jmri-client'
import { logger } from '@/utils/logger'
import { version as appVersion } from '../../package.json'

const emit = defineEmits<{
  logout: []
}>()

const {
  power, connectionState, isServerOnline, isConnected,
  setPower, stopAllThrottles, throttles,
  commandStations, powerByPrefix,
  railroadName, jmriVersion,
} = useJmri()

const cfg = useConfig()
const jmriConfig = computed(() => cfg.jmri.value)
const haConfig = computed(() => cfg.homeassistant.value)

const { editMode, toggle: toggleEditMode } = useEditMode()

const isBusy = ref(false)
const isStopping = ref(false)
const showExitWarning = ref(false)
const showInfoModal = ref(false)

// ── Connection status ─────────────────────────────────────────────────────────

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

// ── Combined power button ─────────────────────────────────────────────────────

function zoneState(prefix: string): PowerState {
  return powerByPrefix.value.get(prefix) ?? PowerState.UNKNOWN
}

const activeZoneCount = computed(() => {
  if (commandStations.value.length > 0) {
    return commandStations.value.filter(z => zoneState(z.prefix) === PowerState.ON).length
  }
  return power.value === PowerState.ON ? 1 : 0
})

const combinedPowerLabel = computed(() =>
  activeZoneCount.value > 0 ? `${activeZoneCount.value} on` : 'Power'
)

const combinedPowerColor = computed(() =>
  activeZoneCount.value > 0 ? 'primary' : 'neutral'
)

const combinedPowerIcon = computed(() =>
  activeZoneCount.value > 0 ? 'i-heroicons-bolt' : 'i-mdi-power'
)

const combinedPowerTitle = computed(() => {
  const n = activeZoneCount.value
  const total = commandStations.value.length
  if (total > 0) {
    return n > 0
      ? `${n} of ${total} command station(s) on — click to turn all off`
      : 'All command stations off — click to turn all on'
  }
  return n > 0 ? 'Power on — click to turn off' : 'Power off — click to turn on'
})

async function setPowerAll(state: 'on' | 'off') {
  if (commandStations.value.length > 0) {
    await Promise.all(commandStations.value.map(z => setPower(state, z.prefix)))
  } else {
    await setPower(state)
  }
}

async function handleCombinedPower() {
  isBusy.value = true
  try {
    await setPowerAll(activeZoneCount.value > 0 ? 'off' : 'on')
  } catch (error) {
    logger.error('Error setting power:', error)
  } finally {
    isBusy.value = false
  }
}

// ── Exit ──────────────────────────────────────────────────────────────────────

function handleLogout() {
  if (activeZoneCount.value > 0) {
    showExitWarning.value = true
  } else {
    emit('logout')
  }
}

async function turnOffAndExit() {
  isBusy.value = true
  try {
    await setPowerAll('off')
  } catch (error) {
    logger.error('Error turning off power before exit:', error)
  } finally {
    isBusy.value = false
  }
  showExitWarning.value = false
  emit('logout')
}

// ── Stop All ──────────────────────────────────────────────────────────────────

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
</script>
