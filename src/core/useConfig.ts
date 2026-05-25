import { ref, computed } from 'vue'
import { useLayout } from './useLayout'
import { logger } from '@/utils/logger'
import type { StoredConfig, TabConfig, JmriPluginConfig, HomeAssistantPluginConfig } from './types'

const STORAGE_KEY = 'yardbird:config'

const config = ref<StoredConfig | null>(null)
const loading = ref(true)

const layout = useLayout()

function migrateFromLayout(layoutConfig: ReturnType<typeof useLayout>): StoredConfig {
  const plugins = layoutConfig.plugins.value
  const tabs = layoutConfig.tabs.value

  return {
    version: 1,
    debug: layoutConfig.debug.value,
    connections: {
      jmri: plugins.jmri,
      homeassistant: plugins.homeassistant,
    },
    tabs: tabs.map(t => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      widgets: [],
    })),
  }
}

// Merge YAML connection settings as defaults under stored values.
// New YAML fields appear automatically; user-saved values are preserved.
// Does NOT save back to localStorage — backfill is a read-time operation.
function backfillConnections(
  stored: StoredConfig['connections'],
  yamlPlugins: ReturnType<typeof useLayout>['plugins']['value']
): StoredConfig['connections'] {
  const jmri = { ...yamlPlugins.jmri, ...stored.jmri } as JmriPluginConfig
  const haBase = yamlPlugins.homeassistant
  const haStored = stored.homeassistant
  const homeassistant =
    haBase !== undefined || haStored !== undefined
      ? ({ ...haBase, ...haStored } as HomeAssistantPluginConfig)
      : undefined
  return { jmri, homeassistant }
}

function loadFromStorage(): StoredConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredConfig
    if (parsed.version !== 1) {
      logger.warn('[Config] Unknown config version in localStorage, ignoring')
      return null
    }
    return parsed
  } catch (e) {
    logger.warn('[Config] Failed to parse localStorage config, ignoring:', e)
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

async function waitForLayout(): Promise<void> {
  await new Promise<void>(resolve => {
    if (!layout.loading.value) { resolve(); return }
    const interval = setInterval(() => {
      if (!layout.loading.value) { clearInterval(interval); resolve() }
    }, 20)
  })
}

async function init(): Promise<void> {
  // Always wait for YAML — needed for backfill even when localStorage has a config
  await waitForLayout()

  const stored = loadFromStorage()
  if (stored) {
    stored.connections = backfillConnections(stored.connections, layout.plugins.value)
    logger.info('[Config] Loaded from localStorage with YAML backfill')
    config.value = stored
    loading.value = false
    return
  }

  const migrated = migrateFromLayout(layout)
  logger.info('[Config] Migrated config from yardbird.yaml, saving to localStorage')
  saveToStorage(migrated)
  config.value = migrated
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

  function saveConnections(connections: StoredConfig['connections']): void {
    if (!config.value) return
    config.value = { ...config.value, connections }
    saveToStorage(config.value)
  }

  function reset(): void {
    localStorage.removeItem(STORAGE_KEY)
    config.value = null
    loading.value = true
    init()
    logger.info('[Config] Reset to YAML defaults')
  }

  return {
    config:        computed(() => config.value),
    loading:       computed(() => loading.value),
    tabs:          computed(() => config.value?.tabs ?? []),
    connections:   computed(() => config.value?.connections ?? {}),
    jmri:          computed(() => config.value?.connections.jmri),
    homeassistant: computed(() => config.value?.connections.homeassistant),
    debug:         computed(() => config.value?.debug ?? false),
    save,
    saveTabs,
    saveConnections,
    reset,
  }
}
