import { ref, computed } from 'vue'
import { sanitize } from './useYamlConfig'
import { logger } from '@/utils/logger'
import type { StoredConfig, TabConfig } from './types'

const STORAGE_KEY = 'yardbird:config'

const config = ref<StoredConfig | null>(null)
const loading = ref(true)
const needsSetup = ref(false)

function loadFromStorage(): StoredConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return sanitize(JSON.parse(raw))
  } catch (e) {
    logger.warn('[Config] Failed to parse localStorage config:', e)
    return null
  }
}

function saveToStorage(cfg: StoredConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  } catch (e) {
    logger.error('[Config] Failed to save config to localStorage:', e)
  }
}

function init(): void {
  const stored = loadFromStorage()
  if (!stored) {
    logger.info('[Config] No valid config in localStorage — needs setup')
    needsSetup.value = true
    loading.value = false
    return
  }
  logger.info('[Config] Loaded from localStorage')
  needsSetup.value = false
  config.value = stored
  loading.value = false
}

init()

export function useConfig() {
  function save(patch: Partial<StoredConfig>): void {
    if (!config.value) return
    config.value = { ...config.value, ...patch }
    saveToStorage(config.value)
  }

  function saveTabs(tabs: TabConfig[]): void {
    if (!config.value) return
    config.value = { ...config.value, tabs }
    saveToStorage(config.value)
  }

  // Works even when needsSetup (config is null) — creates a new minimal StoredConfig.
  function saveConnections(connections: StoredConfig['connections']): void {
    const base = config.value ?? { version: 1 as const, connections: {}, tabs: [] }
    config.value = { ...base, connections }
    needsSetup.value = false
    saveToStorage(config.value)
  }

  // Apply a config imported from YAML — replaces current config and clears needsSetup.
  function applyImport(imported: StoredConfig): void {
    config.value = imported
    needsSetup.value = false
    saveToStorage(imported)
    logger.info('[Config] Applied imported config')
  }

  function reset(): void {
    localStorage.removeItem(STORAGE_KEY)
    config.value = null
    needsSetup.value = true
    logger.info('[Config] Config reset')
  }

  return {
    config:        computed(() => config.value),
    loading:       computed(() => loading.value),
    needsSetup:    computed(() => needsSetup.value),
    tabs:          computed(() => config.value?.tabs ?? []),
    connections:   computed(() => config.value?.connections ?? {}),
    jmri:          computed(() => config.value?.connections.jmri),
    homeassistant: computed(() => config.value?.connections.homeassistant),
    debug:         computed(() => config.value?.debug ?? false),
    save,
    saveTabs,
    saveConnections,
    applyImport,
    reset,
  }
}
