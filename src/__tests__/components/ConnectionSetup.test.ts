import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountWithUI } from '@/__tests__/test-utils'
import ConnectionSetup from '@/components/ConnectionSetup.vue'

// Prevent onMounted fetch from hitting network
global.fetch = vi.fn().mockResolvedValue({ ok: false })

vi.mock('@/core/useYamlConfig', () => ({
  importYaml: vi.fn(() => ({ config: null, warnings: [] })),
  exportYaml: vi.fn(() => ''),
}))

const mockConfig = (overrides?: object) => ({
  jmri: { value: null },
  homeassistant: { value: null },
  config: { value: null },
  connections: { value: {} },
  tabs: { value: [] },
  loading: { value: false },
  needsSetup: { value: true },
  save: vi.fn(),
  saveTabs: vi.fn(),
  saveConnections: vi.fn(),
  applyImport: vi.fn(),
  reset: vi.fn(),
  ...overrides,
})

vi.mock('@/core/useConfig', () => ({
  useConfig: vi.fn(),
}))

describe('ConnectionSetup', () => {
  beforeEach(async () => {
    const { useConfig } = await import('@/core/useConfig')
    vi.mocked(useConfig).mockReturnValue(mockConfig() as ReturnType<typeof useConfig>)
  })

  it('renders the YardBird heading', () => {
    const wrapper = mountWithUI(ConnectionSetup)
    expect(wrapper.text()).toContain('YardBird')
  })

  it('shows Not configured when JMRI has no host', () => {
    const wrapper = mountWithUI(ConnectionSetup)
    expect(wrapper.text()).toContain('Not configured')
  })

  it('disables the All Aboard button when JMRI is not configured', () => {
    const wrapper = mountWithUI(ConnectionSetup)
    const boardBtn = wrapper.findAll('button').find(b => b.text().includes('All Aboard'))
    expect(boardBtn?.attributes('disabled')).toBeDefined()
  })

  it('shows JMRI host when configured', async () => {
    const { useConfig } = await import('@/core/useConfig')
    vi.mocked(useConfig).mockReturnValue(
      mockConfig({
        jmri: { value: { host: 'raspi-jmri.local', port: 12080, mock: false, secure: false } },
        needsSetup: { value: false },
      }) as ReturnType<typeof useConfig>
    )
    const wrapper = mountWithUI(ConnectionSetup)
    expect(wrapper.text()).toContain('raspi-jmri.local')
  })
})
