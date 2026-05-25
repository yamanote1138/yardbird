import { describe, it, expect, beforeEach, vi } from 'vitest'

const STORAGE_KEY = 'yardbird:config'

async function freshConfig() {
  vi.resetModules()
  const { useConfig } = await import('@/core/useConfig')
  const cfg = useConfig()
  // init() is synchronous now — no YAML wait needed
  return cfg
}

describe('useConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('needsSetup', () => {
    it('is true when localStorage is empty', async () => {
      const { needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(true)
    })

    it('is false when valid config exists in localStorage', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(false)
    })

    it('is true when localStorage has wrong version', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, connections: {}, tabs: [] }))
      const { needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(true)
    })

    it('is true when localStorage has invalid JSON', async () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json')
      const { needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(true)
    })
  })

  describe('init — loads from localStorage', () => {
    it('loads tabs from localStorage', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [{ id: 'stored-tab', name: 'Stored Tab', icon: 'i-mdi-home', widgets: [] }],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { tabs } = await freshConfig()
      expect(tabs.value[0].id).toBe('stored-tab')
    })

  })

  describe('save', () => {
    it('merges top-level fields and persists to localStorage', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { save, tabs } = await freshConfig()
      save({ tabs: [{ id: 'new-tab', name: 'New', icon: 'i-mdi-train', widgets: [] }] })
      expect(tabs.value[0].id).toBe('new-tab')
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(persisted.tabs[0].id).toBe('new-tab')
    })
  })

  describe('saveTabs', () => {
    it('replaces tabs and persists', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { saveTabs, tabs } = await freshConfig()
      saveTabs([{ id: 'x', name: 'X', icon: 'i-mdi-home', widgets: [] }])
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].id).toBe('x')
    })
  })

  describe('saveConnections', () => {
    it('replaces connections and persists', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { saveConnections, connections } = await freshConfig()
      saveConnections({ jmri: { host: '192.168.1.1', port: 12080 } })
      expect(connections.value.jmri?.host).toBe('192.168.1.1')
    })

    it('works when needsSetup (no existing config) and clears needsSetup', async () => {
      const { saveConnections, needsSetup, jmri } = await freshConfig()
      expect(needsSetup.value).toBe(true)
      saveConnections({ jmri: { host: 'newhost', port: 12080 } })
      expect(needsSetup.value).toBe(false)
      expect(jmri.value?.host).toBe('newhost')
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(persisted.connections.jmri.host).toBe('newhost')
    })
  })

  describe('applyImport', () => {
    it('sets config, clears needsSetup, and persists', async () => {
      const { applyImport, needsSetup, jmri } = await freshConfig()
      expect(needsSetup.value).toBe(true)
      applyImport({
        version: 1,
        connections: { jmri: { host: 'imported', port: 12080 } },
        tabs: [],
      })
      expect(needsSetup.value).toBe(false)
      expect(jmri.value?.host).toBe('imported')
    })
  })

  describe('reset', () => {
    it('removes config from localStorage and sets needsSetup', async () => {
      const stored = {
        version: 1,
        connections: { jmri: { host: 'localhost', port: 12080 } },
        tabs: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { reset, needsSetup } = await freshConfig()
      expect(needsSetup.value).toBe(false)
      reset()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(needsSetup.value).toBe(true)
    })
  })
})
