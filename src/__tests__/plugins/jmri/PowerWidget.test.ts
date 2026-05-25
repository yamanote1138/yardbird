import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import PowerWidget from '@/plugins/jmri/components/PowerWidget.vue'
import { useJmri } from '@/plugins/jmri'
import { PowerState } from 'jmri-client'

describe('PowerWidget', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('button is disabled when not connected', () => {
    const wrapper = mountWithUI(PowerWidget, { props: { prefix: '' } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('button is enabled when connected', async () => {
    await connectMockJmri()
    const wrapper = mountWithUI(PowerWidget, { props: { prefix: '' } })
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('shows bolt icon when power is ON', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.ON
    const wrapper = mountWithUI(PowerWidget, { props: { prefix: '' } })
    expect(wrapper.find('[data-icon="i-heroicons-bolt"]').exists()).toBe(true)
  })

  it('shows power icon when power is OFF', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.OFF
    const wrapper = mountWithUI(PowerWidget, { props: { prefix: '' } })
    expect(wrapper.find('[data-icon="i-mdi-power"]').exists()).toBe(true)
  })

  it('renders custom label', async () => {
    await connectMockJmri()
    const wrapper = mountWithUI(PowerWidget, { props: { prefix: '', label: 'DCC Track' } })
    expect(wrapper.text()).toContain('DCC Track')
  })

  it('falls back to "Power" when no label given', async () => {
    await connectMockJmri()
    const wrapper = mountWithUI(PowerWidget, { props: { prefix: '' } })
    expect(wrapper.text()).toContain('Power')
  })
})
