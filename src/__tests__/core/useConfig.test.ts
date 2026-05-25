import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

const STORAGE_KEY = 'yardbird:config'

const MOCK_LAYOUT = {
  loading: ref(false),
  debug: ref(false),
  tabs: ref([{ id: 'yaml-tab', name: 'YAML Tab', icon: 'i-mdi-train' }]),
  plugins: ref({ jmri: { host: 'localhost', port: 12080 } }),
}

async function freshConfig() {
  vi.resetModules()
  vi.doMock('@/core/useLayout', () => ({ useLayout: () => MOCK_LAYOUT }))
  const { useConfig } = await import('@/core/useConfig')
  const cfg = useConfig()
  await vi.waitFor(() => expect(cfg.loading.value).toBe(false), { timeout: 3000 })
  return cfg
}

describe('useConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('init — priority order', () => {
    it('loads from localStorage when valid config exists', async () => {
      const stored = {
        version: 1,
        connections: {},
        tabs: [{ id: 'stored-tab', name: 'Stored Tab', icon: 'i-mdi-home', widgets: [] }],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { tabs } = await freshConfig()
      expect(tabs.value[0].id).toBe('stored-tab')
    })

    it('falls back to YAML layout when localStorage is empty', async () => {
      const { tabs } = await freshConfig()
      expect(tabs.value[0].id).toBe('yaml-tab')
    })

    it('ignores localStorage entry with wrong version', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, connections: {}, tabs: [] }))
      const { tabs } = await freshConfig()
      expect(tabs.value[0].id).toBe('yaml-tab')
    })

    it('ignores invalid JSON in localStorage', async () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json')
      const { tabs } = await freshConfig()
      expect(tabs.value[0].id).toBe('yaml-tab')
    })

    it('migrates YAML layout tabs with empty widgets arrays', async () => {
      const { tabs } = await freshConfig()
      expect(tabs.value[0].widgets).toEqual([])
    })

    it('persists migrated config to localStorage after YAML fallback', async () => {
      await freshConfig()
      const raw = localStorage.getItem(STORAGE_KEY)
      expect(raw).not.toBeNull()
      const stored = JSON.parse(raw!)
      expect(stored.version).toBe(1)
      expect(stored.tabs[0].id).toBe('yaml-tab')
    })
  })

  describe('save', () => {
    it('merges top-level fields and persists to localStorage', async () => {
      const { save, tabs } = await freshConfig()
      save({ tabs: [{ id: 'new-tab', name: 'New', icon: 'i-mdi-train', widgets: [] }] })
      expect(tabs.value[0].id).toBe('new-tab')
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.tabs[0].id).toBe('new-tab')
    })

    it('preserves unmodified top-level fields', async () => {
      const { save, debug } = await freshConfig()
      save({ debug: true })
      expect(debug.value).toBe(true)
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.tabs[0].id).toBe('yaml-tab')
    })
  })

  describe('saveTabs', () => {
    it('replaces tabs and persists', async () => {
      const { saveTabs, tabs } = await freshConfig()
      saveTabs([{ id: 'x', name: 'X', icon: 'i-mdi-home', widgets: [] }])
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].id).toBe('x')
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.tabs[0].id).toBe('x')
    })
  })

  describe('saveConnections', () => {
    it('replaces connections and persists', async () => {
      const { saveConnections, connections } = await freshConfig()
      saveConnections({ jmri: { host: '192.168.1.1', port: 12080 } })
      expect(connections.value.jmri?.host).toBe('192.168.1.1')
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored.connections.jmri.host).toBe('192.168.1.1')
    })
  })

  describe('reset', () => {
    it('removes yardbird:config from localStorage', async () => {
      const { reset } = await freshConfig()
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
      reset()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })
})
