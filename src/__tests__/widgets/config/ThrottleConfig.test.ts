import { describe, it, expect, afterEach, vi } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import ThrottleConfig from '@/widgets/config/ThrottleConfig.vue'
import { useJmri } from '@/plugins/jmri'

// fetchRosterGroups re-throws on mock client errors; stub it to a no-op so tests
// that mount while connected don't produce unhandled promise rejections.
vi.mock('@/plugins/jmri', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/plugins/jmri')>()
  const origUseJmri = mod.useJmri
  return {
    ...mod,
    useJmri: () => ({ ...origUseJmri(), fetchRosterGroups: vi.fn().mockResolvedValue(undefined) }),
  }
})

describe('ThrottleConfig', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('renders the address input', () => {
    const wrapper = mountWithUI(ThrottleConfig, { props: { config: {} } })
    expect(wrapper.find('input[type="number"]').exists()).toBe(true)
  })

  it('pre-populates address from config', () => {
    const wrapper = mountWithUI(ThrottleConfig, { props: { config: { address: 42 } } })
    const input = wrapper.find('input[type="number"]')
    expect((input.element as HTMLInputElement).value).toBe('42')
  })

  it('emits update immediately with initial address', () => {
    const wrapper = mountWithUI(ThrottleConfig, {
      props: { config: { address: 7, commandStation: '' } },
    })
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates?.[0]?.[0]).toMatchObject({ address: 7 })
  })

  it('shows roster entries when they are available', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.roster.set(3, {
      address: 3, name: 'Flying Scotsman', road: 'LNER', number: '4472',
    })
    const wrapper = mountWithUI(ThrottleConfig, { props: { config: {} } })
    expect(wrapper.text()).toContain('Flying Scotsman')
  })

  it('shows command station buttons when available', async () => {
    await connectMockJmri()
    useJmri().commandStations.value = [{ name: 'DCC-EX', prefix: 'DCC' }]
    const wrapper = mountWithUI(ThrottleConfig, { props: { config: {} } })
    expect(wrapper.text()).toContain('DCC-EX')
  })
})
