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

vi.mock('@/plugins/jmri/useRecentLocos', async () => {
  const { ref } = await import('vue')
  const recentLocos = ref<Array<{ address: number; name: string; commandStation?: string }>>([])
  return { useRecentLocos: () => ({ recentLocos, recordLoco: vi.fn() }), __recent: recentLocos }
})

vi.mock('@/core/useConfig', async () => {
  const { ref } = await import('vue')
  const tabs = ref<unknown[]>([])
  return { useConfig: () => ({ tabs }), __tabs: tabs }
})

// @ts-expect-error test-only export from the mock factory
import { __recent } from '@/plugins/jmri/useRecentLocos'
// @ts-expect-error test-only export from the mock factory
import { __tabs } from '@/core/useConfig'
import { useWidgetConfig } from '@/composables/useWidgetConfig'

function otherWidgetHas(address: number) {
  __tabs.value = [{ id: 't', name: 'T', widgets: [
    { id: 'w1', type: 'jmri-throttle', grid: { x: 0, y: 0, w: 4, h: 5 }, config: { address: 3 } },
    { id: 'w2', type: 'jmri-throttle', grid: { x: 4, y: 0, w: 4, h: 5 }, config: { address } },
  ] }]
  useWidgetConfig().openForEdit('w1', 'jmri-throttle', { address: 3 }, () => {})
}

describe('ThrottleConfig', () => {
  afterEach(async () => {
    __recent.value = []
    __tabs.value = []
    useWidgetConfig().cancel()
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

  describe('recent locos', () => {
    it('lists recent locos', () => {
      __recent.value = [{ address: 11, name: 'E235' }, { address: 1, name: 'Thomas' }]
      const wrapper = mountWithUI(ThrottleConfig, { props: { config: {} } })
      expect(wrapper.text()).toContain('Recent')
      expect(wrapper.text()).toContain('E235 (11)')
      expect(wrapper.text()).toContain('Thomas (1)')
    })

    it('hides the recent section when there are none', () => {
      const wrapper = mountWithUI(ThrottleConfig, { props: { config: {} } })
      expect(wrapper.text()).not.toContain('Recent')
    })

    it('picking a recent loco sets its address and command station', async () => {
      __recent.value = [{ address: 1, name: 'Thomas', commandStation: 'E' }]
      const wrapper = mountWithUI(ThrottleConfig, { props: { config: { address: 11, commandStation: 'D' } } })
      await wrapper.findAll('button').find(b => b.text() === 'Thomas (1)')!.trigger('click')
      const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
      expect(updates.at(-1)![0]).toEqual({ address: 1, commandStation: 'E' })
    })
  })

  describe('locos on other throttles', () => {
    it('disables a recent loco that another throttle widget is using', () => {
      otherWidgetHas(11)
      __recent.value = [{ address: 11, name: 'E235' }]
      const wrapper = mountWithUI(ThrottleConfig, { props: { config: { address: 3 } } })
      const btn = wrapper.findAll('button').find(b => b.text() === 'E235 (11)')!
      expect(btn.attributes('disabled')).toBeDefined()
    })

    it('disables a roster loco that another throttle widget is using', async () => {
      await connectMockJmri()
      useJmri().jmriState.value.roster.set(11, { address: 11, name: 'E235', road: '', number: '' })
      otherWidgetHas(11)
      const wrapper = mountWithUI(ThrottleConfig, { props: { config: { address: 3 } } })
      const btn = wrapper.findAll('button').find(b => b.text() === 'E235 (11)')!
      expect(btn.attributes('disabled')).toBeDefined()
    })

    it('does not disable the loco this widget already has', () => {
      otherWidgetHas(11)
      __recent.value = [{ address: 3, name: 'Mine' }]
      const wrapper = mountWithUI(ThrottleConfig, { props: { config: { address: 3 } } })
      const btn = wrapper.findAll('button').find(b => b.text() === 'Mine (3)')!
      expect(btn.attributes('disabled')).toBeUndefined()
    })

    it('warns when the typed address is on another throttle', async () => {
      otherWidgetHas(11)
      const wrapper = mountWithUI(ThrottleConfig, { props: { config: { address: 3 } } })
      await wrapper.find('input[type="number"]').setValue('11')
      expect(wrapper.text()).toContain('already on another throttle')
    })
  })
})
