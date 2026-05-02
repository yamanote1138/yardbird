<template>
  <div class="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center">
    <div class="text-center max-w-sm w-full px-6">
      <img src="/favicon.svg" class="w-16 h-16 md:w-20 md:h-20 mx-auto mb-6" alt="YardBird" />
      <h1 class="text-3xl md:text-4xl font-bold mb-2">YardBird</h1>
      <p class="text-neutral-400 md:text-lg mb-8">Your customizable layout control panel</p>

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
                  {{ jmri?.mock ? 'Mock mode' : `${jmri?.host ?? '—'}:${jmri?.port ?? '—'}` }}
                  <span v-if="jmri?.secure" class="text-success-500"> (TLS)</span>
                </p>
              </div>
            </div>
            <UButton size="xs" color="neutral" variant="ghost" @click="openJmriEdit">Edit</UButton>
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
        :disabled="isConnecting"
        @click="handleBoard"
      >
        <template v-if="!isConnecting" #leading>
          <UIcon name="i-mdi-train-variant" />
        </template>
        {{ isConnecting ? 'Departing...' : 'All Aboard!' }}
      </UButton>

      <button
        class="mt-3 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
        title="Reset to YAML defaults and reload"
        @click="handleReset"
      >
        Reset to defaults
      </button>
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
        <div>
          <label class="text-xs text-neutral-400 block mb-1">Tram prefix (optional)</label>
          <UInput v-model="jmriForm.tramPrefix" placeholder="e.g. D" class="w-full" />
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
import { ref, computed, reactive } from 'vue'
import { useConfig } from '@/core/useConfig'
import type { JmriPluginConfig, HomeAssistantPluginConfig } from '@/core/types'

const emit = defineEmits<{
  connect: []
}>()

const cfg = useConfig()
const jmri = computed(() => cfg.jmri.value)
const ha   = computed(() => cfg.homeassistant.value)
const haEnabled = computed(() => !!(ha.value?.enabled && ha.value.url))

const isConnecting = ref(false)
const errorMessage = ref('')

// ── JMRI form ─────────────────────────────────────────────────────────────────

const showJmriModal = ref(false)
const jmriForm = reactive<Partial<JmriPluginConfig> & { port: string | number }>({
  host: '', port: 12080, secure: false, mock: false, tramPrefix: '',
})

function openJmriEdit() {
  const j = jmri.value
  jmriForm.host       = j?.host ?? 'raspi-jmri.local'
  jmriForm.port       = j?.port ?? 12080
  jmriForm.secure     = j?.secure ?? false
  jmriForm.mock       = j?.mock ?? false
  jmriForm.tramPrefix = j?.tramPrefix ?? ''
  showJmriModal.value = true
}

function saveJmri() {
  const updated: JmriPluginConfig = {
    host:        String(jmriForm.host ?? 'raspi-jmri.local'),
    port:        Number(jmriForm.port ?? 12080),
    secure:      !!jmriForm.secure,
    mock:        !!jmriForm.mock,
    tramPrefix:  jmriForm.tramPrefix || undefined,
    powerZones:  jmri.value?.powerZones,
    tramPwmFreq: jmri.value?.tramPwmFreq,
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
  haForm.url     = h?.url ?? ''
  haForm.token   = h?.token ?? ''
  haForm.area    = h?.area ?? ''
  showHaModal.value = true
}

function saveHa() {
  const updated: HomeAssistantPluginConfig = {
    enabled: haForm.enabled,
    url:     String(haForm.url ?? ''),
    token:   String(haForm.token ?? ''),
    area:    String(haForm.area ?? ''),
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
  if (confirm('Reset all settings to YAML defaults? This cannot be undone.')) {
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
  }
})
</script>
