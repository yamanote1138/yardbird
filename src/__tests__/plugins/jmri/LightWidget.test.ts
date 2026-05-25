import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import LightWidget from '@/plugins/jmri/components/LightWidget.vue'
import { useJmri } from '@/plugins/jmri'
import { LightState } from '@/types/jmri'

describe('LightWidget', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('shows "not found" message when light is absent', () => {
    const wrapper = mountWithUI(LightWidget, { props: { name: 'LL99' } })
    expect(wrapper.text()).toContain('Light not found: LL99')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('renders a button when the light exists', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.lights.set('LL1', {
      name: 'LL1', userName: 'Layout Light', state: LightState.OFF,
    })
    const wrapper = mountWithUI(LightWidget, { props: { name: 'LL1' } })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('Layout Light')
  })

  it('button is disabled when not connected', () => {
    useJmri().jmriState.value.lights.set('LL1', {
      name: 'LL1', state: LightState.OFF,
    })
    const wrapper = mountWithUI(LightWidget, { props: { name: 'LL1' } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('shows ON icon when light state is ON', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.lights.set('LL1', {
      name: 'LL1', state: LightState.ON,
    })
    const wrapper = mountWithUI(LightWidget, { props: { name: 'LL1' } })
    expect(wrapper.find('[data-icon="i-mdi-lightbulb-on"]').exists()).toBe(true)
  })

  it('shows OFF icon when light state is OFF', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.lights.set('LL1', {
      name: 'LL1', state: LightState.OFF,
    })
    const wrapper = mountWithUI(LightWidget, { props: { name: 'LL1' } })
    expect(wrapper.find('[data-icon="i-mdi-lightbulb-off-outline"]').exists()).toBe(true)
  })
})
