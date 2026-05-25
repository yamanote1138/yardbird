<template>
  <div class="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center">
    <div class="text-center max-w-sm w-full px-6">
      <img src="/favicon.svg" class="w-16 h-16 md:w-20 md:h-20 mx-auto mb-6" alt="YardBird" />
      <h1 class="text-3xl md:text-4xl font-bold mb-1">YardBird</h1>
      <p class="text-xs text-neutral-500 mb-2">v{{ version }}</p>
      <p class="text-neutral-400 md:text-lg mb-8">Your customizable layout control panel</p>

      <!-- Docker / server config banner (only shown on first run when a real config is found) -->
      <div
        v-if="serverConfig"
        class="mb-4 p-3 bg-success-500/10 border border-success-500/30 rounded-lg text-left flex items-start justify-between gap-2"
      >
        <div class="min-w-0">
          <p class="text-sm text-success-400 font-medium">Server config found</p>
          <p class="text-xs text-neutral-400 truncate">{{ serverConfig.connections.jmri?.host }}:{{ serverConfig.connections.jmri?.port }}</p>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <UButton size="xs" color="success" variant="subtle" @click="applyServerConfig">Import</UButton>
          <UButton size="xs" color="neutral" variant="ghost" @click="serverConfig = null">Dismiss</UButton>
        </div>
      </div>

      <!-- Import warnings -->
      <div
        v-if="importWarnings.length > 0"
        class="mb-4 p-3 bg-warning-500/10 border border-warning-500/30 rounded-lg text-left"
      >
        <p class="text-xs text-warning-400 font-medium mb-1">Import warnings:</p>
        <ul class="text-xs text-neutral-400 space-y-0.5 list-disc list-inside">
          <li v-for="w in importWarnings" :key="w">{{ w }}</li>
        </ul>
      </div>

      <!-- Connection cards -->
      <div class="space-y-2 mb-6 text-left">
        <!-- JMRI -->
        <div class="bg-neutral-900 rounded-lg p-3 border border-white/10">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <UIcon name="i-mdi-train-variant" class="w-4 h-4 text-neutral-400 flex-shrink-0" />
              <div class="min-w-0">
                <p class="text-sm font-medium text-white">JMRI</p>
                <p class="text-xs text-neutral-500 truncate">
                  {{ jmri?.mock ? 'Mock mode' : jmri?.host ? `${jmri.host}:${jmri.port}` : 'Not configured' }}
                  <span v-if="jmri?.secure" class="text-success-500"> (TLS)</span>
                </p>
              </div>
            </div>
            <UButton size="xs" color="neutral" variant="ghost" @click="openJmriEdit">
              {{ jmri?.host ? 'Edit' : 'Configure' }}
            </UButton>
          </div>
        </div>

        <!-- Home Assistant -->
        <div
          class="rounded-lg p-3 border transition-colors"
          :class="haEnabled ? 'bg-neutral-900 border-white/10' : 'bg-neutral-900/40 border-white/5'"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <UIcon name="i-mdi-home" class="w-4 h-4 flex-shrink-0" :class="haEnabled ? 'text-neutral-400' : 'text-neutral-600'" />
              <div class="min-w-0">
                <p class="text-sm font-medium" :class="haEnabled ? 'text-white' : 'text-neutral-600'">
                  Home Assistant
                </p>
                <p class="text-xs text-neutral-500 truncate">
                  {{ haEnabled ? (ha?.url ?? '—') : 'Not configured' }}
                </p>
              </div>
            </div>
            <UButton size="xs" color="neutral" variant="ghost" @click="openHaEdit">
              {{ haEnabled ? 'Edit' : 'Add' }}
            </UButton>
          </div>
        </div>
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        icon="i-heroicons-exclamation-triangle"
        :title="errorMessage"
        class="mb-4 text-left"
      />

      <UButton
        size="xl"
        color="success"
        block
        :loading="isConnecting"
        :disabled="isConnecting || !jmri?.host"
        @click="handleBoard"
      >
        <template v-if="!isConnecting" #leading>
          <UIcon name="i-mdi-train-variant" />
        </template>
        {{ isConnecting ? 'Departing...' : 'All Aboard!' }}
      </UButton>

      <!-- Bottom links -->
      <div class="mt-3 flex items-center justify-center gap-4">
        <label class="text-xs text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer">
          Import config
          <input ref="fileInput" type="file" accept=".yaml,.yml" class="hidden" @change="handleFileImport" />
        </label>
        <button
          v-if="!cfg.needsSetup.value"
          class="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          @click="handleExport"
        >
          Export config
        </button>
        <button
          class="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          @click="handleReset"
        >
          Reset
        </button>
      </div>
    </div>
  </div>

  <!-- JMRI Edit Modal -->
  <UModal v-model:open="showJmriModal" title="JMRI Connection" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <label class="text-xs text-neutral-400 block mb-1">Host</label>
            <UInput v-model="jmriForm.host" placeholder="raspi-jmri.local" class="w-full" />
          </div>
          <div class="w-24">
            <label class="text-xs text-neutral-400 block mb-1">Port</label>
            <UInput v-model="jmriForm.port" type="number" placeholder="12080" class="w-full" />
          </div>
        </div>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
            <UCheckbox v-model="jmriForm.secure" />
            Secure (WSS)
          </label>
          <label class="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
            <UCheckbox v-model="jmriForm.mock" />
            Mock mode
          </label>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showJmriModal = false">Cancel</UButton>
        <UButton color="primary" @click="saveJmri">Save</UButton>
      </div>
    </template>
  </UModal>

  <!-- HA Edit Modal -->
  <UModal v-model:open="showHaModal" title="Home Assistant" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <div class="space-y-3">
        <label class="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
          <UCheckbox v-model="haForm.enabled" />
          Enable Home Assistant
        </label>
        <div v-if="haForm.enabled" class="space-y-3">
          <div>
            <label class="text-xs text-neutral-400 block mb-1">URL</label>
            <UInput v-model="haForm.url" placeholder="http://homeassistant.local:8123" class="w-full" />
          </div>
          <div>
            <label class="text-xs text-neutral-400 block mb-1">Long-lived access token</label>
            <UInput v-model="haForm.token" type="password" placeholder="eyJ..." class="w-full" />
          </div>
          <div>
            <label class="text-xs text-neutral-400 block mb-1">Area (filter entities)</label>
            <UInput v-model="haForm.area" placeholder="e.g. train_room" class="w-full" />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showHaModal = false">Cancel</UButton>
        <UButton color="primary" @click="saveHa">Save</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { useConfig } from '@/core/useConfig'
import { importYaml, exportYaml } from '@/core/useYamlConfig'
import type { JmriPluginConfig, HomeAssistantPluginConfig, StoredConfig } from '@/core/types'
import { version } from '../../package.json'

const emit = defineEmits<{ connect: [] }>()

const cfg = useConfig()
const jmri = computed(() => cfg.jmri.value)
const ha   = computed(() => cfg.homeassistant.value)
const haEnabled = computed(() => !!(ha.value?.enabled && ha.value.url))

const isConnecting   = ref(false)
const errorMessage   = ref('')
const importWarnings = ref<string[]>([])
const serverConfig   = ref<StoredConfig | null>(null)
const fileInput      = ref<HTMLInputElement | null>(null)

// ── Docker / server config banner ─────────────────────────────────────────────

onMounted(async () => {
  if (!cfg.needsSetup.value) return
  try {
    const res = await fetch('/yardbird.yaml')
    if (!res.ok) return
    const text = await res.text()
    const { config } = importYaml(text)
    // Only show banner if the YAML has a real host (not the blank template)
    if (config?.connections.jmri?.host) serverConfig.value = config
  } catch {
    // Silently ignore — server config is optional
  }
})

function applyServerConfig() {
  if (!serverConfig.value) return
  cfg.applyImport(serverConfig.value)
  serverConfig.value = null
}

// ── File import ───────────────────────────────────────────────────────────────

async function handleFileImport(event: Event) {
  importWarnings.value = []
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const text = await file.text()
  const { config, warnings } = importYaml(text)
  importWarnings.value = warnings
  if (config) cfg.applyImport(config)
  if (fileInput.value) fileInput.value.value = ''
}

// ── Export ────────────────────────────────────────────────────────────────────

function handleExport() {
  if (!cfg.config.value) return
  const yamlText = exportYaml(cfg.config.value)
  const blob = new Blob([yamlText], { type: 'text/yaml' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'yardbird.yaml'
  a.click()
  URL.revokeObjectURL(url)
}

// ── JMRI form ─────────────────────────────────────────────────────────────────

const showJmriModal = ref(false)
const jmriForm = reactive<Partial<JmriPluginConfig> & { port: string | number }>({
  host: '', port: 12080, secure: false, mock: false,
})

function openJmriEdit() {
  const j = jmri.value
  jmriForm.host   = j?.host   ?? ''
  jmriForm.port   = j?.port   ?? 12080
  jmriForm.secure = j?.secure ?? false
  jmriForm.mock   = j?.mock   ?? false
  showJmriModal.value = true
}

function saveJmri() {
  const updated: JmriPluginConfig = {
    host:            String(jmriForm.host ?? ''),
    port:            Number(jmriForm.port ?? 12080),
    secure:          !!jmriForm.secure,
    mock:            !!jmriForm.mock,
    commandStations: jmri.value?.commandStations,
    tramPwmFreq:     jmri.value?.tramPwmFreq,
    rosterGroups:    jmri.value?.rosterGroups,
  }
  cfg.saveConnections({ ...cfg.connections.value, jmri: updated })
  showJmriModal.value = false
}

// ── HA form ───────────────────────────────────────────────────────────────────

const showHaModal = ref(false)
const haForm = reactive<Partial<HomeAssistantPluginConfig> & { enabled: boolean }>({
  enabled: false, url: '', token: '', area: '',
})

function openHaEdit() {
  const h = ha.value
  haForm.enabled = h?.enabled ?? false
  haForm.url     = h?.url     ?? ''
  haForm.token   = h?.token   ?? ''
  haForm.area    = h?.area    ?? ''
  showHaModal.value = true
}

function saveHa() {
  const updated: HomeAssistantPluginConfig = {
    enabled: haForm.enabled,
    url:     String(haForm.url   ?? ''),
    token:   String(haForm.token ?? ''),
    area:    String(haForm.area  ?? ''),
  }
  cfg.saveConnections({ ...cfg.connections.value, homeassistant: updated })
  showHaModal.value = false
}

// ── Connect / reset ───────────────────────────────────────────────────────────

const handleBoard = () => {
  errorMessage.value = ''
  isConnecting.value = true
  emit('connect')
}

function handleReset() {
  if (confirm('Reset all settings? This cannot be undone.')) {
    cfg.reset()
  }
}

defineExpose({
  setError: (message: string) => {
    errorMessage.value = message
    isConnecting.value = false
  },
  setConnecting: (connecting: boolean) => {
    isConnecting.value = connecting
  },
})
</script>
