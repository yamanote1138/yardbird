import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import LightConfig from '@/widgets/config/LightConfig.vue'
import { useJmri } from '@/plugins/jmri'
import { LightState } from '@/types/jmri'

describe('LightConfig', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('shows text input when no lights are loaded', () => {
    const wrapper = mountWithUI(LightConfig, { props: { config: {} } })
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.text()).toContain('No lights loaded yet')
  })

  it('shows light list when lights are available', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.lights.set('LL1', {
      name: 'LL1', userName: 'Station Lamps', state: LightState.OFF,
    })
    const wrapper = mountWithUI(LightConfig, { props: { config: {} } })
    expect(wrapper.text()).toContain('Station Lamps')
  })

  it('pre-populates from config.name', () => {
    const wrapper = mountWithUI(LightConfig, { props: { config: { name: 'LL5' } } })
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('LL5')
  })

  it('emits update with selected light name when button clicked', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.lights.set('LL1', {
      name: 'LL1', userName: 'Station', state: LightState.OFF,
    })
    const wrapper = mountWithUI(LightConfig, { props: { config: {} } })
    await wrapper.find('button').trigger('click')
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates.at(-1)?.[0]).toEqual({ name: 'LL1' })
  })

  it('emits update immediately with initial config value', () => {
    const wrapper = mountWithUI(LightConfig, { props: { config: { name: 'LL3' } } })
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates?.[0]?.[0]).toEqual({ name: 'LL3' })
  })
})
