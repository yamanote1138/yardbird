import { ref, computed } from 'vue'
import yaml from 'js-yaml'
import type { LayoutConfig } from './types'

const config = ref<LayoutConfig | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const DEFAULT_CONFIG: LayoutConfig = {
  debug: false,
  plugins: {
    jmri: { host: 'raspi-jmri.local', port: 12080, secure: false, mock: false },
  },
  tabs: [
    { id: 'throttles', name: 'Locomotives', icon: 'i-mdi-train' },
    { id: 'turnouts',  name: 'Turnouts',    icon: 'i-mdi-source-branch' },
    { id: 'lights',    name: 'Lights',      icon: 'i-mdi-lightbulb-outline' },
  ],
}

async function load() {
  try {
    const res = await fetch('/yardbird.yaml')
    if (!res.ok) throw new Error(`HTTP ${res.status} loading yardbird.yaml`)
    const text = await res.text()
    config.value = yaml.load(text) as LayoutConfig
  } catch (e: any) {
    error.value = e.message
    config.value = DEFAULT_CONFIG
  } finally {
    loading.value = false
  }
}

load()

export function useLayout() {
  return {
    config:   computed(() => config.value),
    loading:  computed(() => loading.value),
    error:    computed(() => error.value),
    tabs:     computed(() => config.value?.tabs ?? []),
    plugins:  computed(() => config.value?.plugins ?? DEFAULT_CONFIG.plugins),
    debug:    computed(() => config.value?.debug ?? false),
  }
}
