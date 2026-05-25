import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import TurnoutWidget from '@/plugins/jmri/components/TurnoutWidget.vue'
import { useJmri } from '@/plugins/jmri'
import { TurnoutState } from '@/types/jmri'

describe('TurnoutWidget', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('shows "not found" message when turnout is absent', () => {
    const wrapper = mountWithUI(TurnoutWidget, { props: { name: 'LT99' } })
    expect(wrapper.text()).toContain('Turnout not found: LT99')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('renders a button when the turnout exists', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.turnouts.set('LT1', {
      name: 'LT1', userName: 'Track 1', state: TurnoutState.CLOSED,
    })
    const wrapper = mountWithUI(TurnoutWidget, { props: { name: 'LT1' } })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('Track 1')
  })

  it('button is disabled when not connected', () => {
    useJmri().jmriState.value.turnouts.set('LT1', {
      name: 'LT1', state: TurnoutState.CLOSED,
    })
    const wrapper = mountWithUI(TurnoutWidget, { props: { name: 'LT1' } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('button is enabled when connected', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.turnouts.set('LT1', {
      name: 'LT1', state: TurnoutState.CLOSED,
    })
    const wrapper = mountWithUI(TurnoutWidget, { props: { name: 'LT1' } })
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('shows THROWN icon when state is THROWN', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.turnouts.set('LT1', {
      name: 'LT1', state: TurnoutState.THROWN,
    })
    const wrapper = mountWithUI(TurnoutWidget, { props: { name: 'LT1' } })
    expect(wrapper.find('[data-icon="i-mdi-shuffle-variant"]').exists()).toBe(true)
  })
})
