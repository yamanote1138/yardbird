import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI } from '@/__tests__/test-utils'
import HaEntityConfig from '@/widgets/config/HaEntityConfig.vue'
import { useHomeAssistant } from '@/plugins/homeassistant'

describe('HaEntityConfig', () => {
  afterEach(() => {
    useHomeAssistant().disconnect()
  })

  it('shows text input when HA has no entities', () => {
    const wrapper = mountWithUI(HaEntityConfig, { props: { config: {} } })
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.text()).toContain('Home Assistant not connected')
  })

  it('pre-populates entityId from config', () => {
    const wrapper = mountWithUI(HaEntityConfig, {
      props: { config: { entityId: 'light.desk' } },
    })
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('light.desk')
  })

  it('emits update immediately with initial entityId', () => {
    const wrapper = mountWithUI(HaEntityConfig, {
      props: { config: { entityId: 'switch.fan' } },
    })
    const updates = wrapper.emitted('update') as Array<[Record<string, unknown>]>
    expect(updates?.[0]?.[0]).toEqual({ entityId: 'switch.fan' })
  })

  it('shows entity list when HA is connected via mock', () => {
    useHomeAssistant().connectMock()
    const wrapper = mountWithUI(HaEntityConfig, { props: { config: {} } })
    // connectMock seeds 'Layout Lighting' and others
    expect(wrapper.text()).toContain('Layout Lighting')
  })
})
