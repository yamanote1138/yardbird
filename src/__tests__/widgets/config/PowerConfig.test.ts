import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import PowerConfig from '@/widgets/config/PowerConfig.vue'
import { useJmri } from '@/plugins/jmri'

describe('PowerConfig', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('shows label input', () => {
    const wrapper = mountWithUI(PowerConfig, { props: { config: {} } })
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('pre-populates label from config', () => {
    const wrapper = mountWithUI(PowerConfig, { props: { config: { label: 'DCC', prefix: '' } } })
    const inputs = wrapper.findAll('input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('DCC')
  })

  it('emits update immediately with initial config values', () => {
    const wrapper = mountWithUI(PowerConfig, {
      props: { config: { label: 'Track', prefix: 'DCC' } },
    })
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates?.[0]?.[0]).toEqual({ label: 'Track', prefix: 'DCC' })
  })

  it('shows zone buttons when command stations are available', async () => {
    await connectMockJmri()
    useJmri().commandStations.value = [{ name: 'DCC-EX', prefix: 'DCC' }]
    const wrapper = mountWithUI(PowerConfig, { props: { config: {} } })
    expect(wrapper.text()).toContain('DCC-EX')
  })
})
