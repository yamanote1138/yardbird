import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import TurnoutConfig from '@/widgets/config/TurnoutConfig.vue'
import { useJmri } from '@/plugins/jmri'
import { TurnoutState } from '@/types/jmri'

describe('TurnoutConfig', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('shows text input when no turnouts are loaded', () => {
    const wrapper = mountWithUI(TurnoutConfig, { props: { config: {} } })
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.text()).toContain('No turnouts loaded yet')
  })

  it('shows turnout list when turnouts are available', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.turnouts.set('LT1', {
      name: 'LT1', userName: 'Main Crossover', state: TurnoutState.CLOSED,
    })
    const wrapper = mountWithUI(TurnoutConfig, { props: { config: {} } })
    expect(wrapper.text()).toContain('Main Crossover')
  })

  it('pre-populates from config.name', () => {
    const wrapper = mountWithUI(TurnoutConfig, { props: { config: { name: 'LT5' } } })
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('LT5')
  })

  it('emits update with the selected name', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.turnouts.set('LT1', {
      name: 'LT1', userName: 'Main', state: TurnoutState.CLOSED,
    })
    const wrapper = mountWithUI(TurnoutConfig, { props: { config: {} } })
    await wrapper.find('button').trigger('click')
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates.at(-1)?.[0]).toEqual({ name: 'LT1' })
  })

  it('emits update immediately with initial config value', () => {
    const wrapper = mountWithUI(TurnoutConfig, { props: { config: { name: 'LT3' } } })
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates?.[0]?.[0]).toEqual({ name: 'LT3' })
  })
})
