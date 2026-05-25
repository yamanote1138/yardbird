import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI } from '@/__tests__/test-utils'
import HaEntityWidget from '@/plugins/homeassistant/components/HaEntityWidget.vue'
import { useHomeAssistant } from '@/plugins/homeassistant'

describe('HaEntityWidget', () => {
  afterEach(() => {
    useHomeAssistant().disconnect()
  })

  it('shows entity not found when entityId is unknown', () => {
    const wrapper = mountWithUI(HaEntityWidget, {
      props: { entityId: 'light.does_not_exist' },
    })
    expect(wrapper.text()).toContain('Entity not found')
    expect(wrapper.text()).toContain('light.does_not_exist')
  })

  it('shows entity friendly name when found', () => {
    useHomeAssistant().connectMock()
    const wrapper = mountWithUI(HaEntityWidget, {
      props: { entityId: 'light.layout_lighting' },
    })
    expect(wrapper.text()).toContain('Layout Lighting')
  })

  it('shows lightbulb-on icon when light entity is on', () => {
    useHomeAssistant().connectMock()
    const wrapper = mountWithUI(HaEntityWidget, {
      props: { entityId: 'light.layout_lighting' },
    })
    expect(wrapper.find('[data-icon="i-mdi-lightbulb-on"]').exists()).toBe(true)
  })

  it('shows lightbulb-off icon when light entity is off', () => {
    useHomeAssistant().connectMock()
    const wrapper = mountWithUI(HaEntityWidget, {
      props: { entityId: 'light.train_room_overhead' },
    })
    expect(wrapper.find('[data-icon="i-mdi-lightbulb-off-outline"]').exists()).toBe(true)
  })

  it('button is disabled when HA is not connected', () => {
    const wrapper = mountWithUI(HaEntityWidget, {
      props: { entityId: 'light.layout_lighting' },
    })
    // entity not found → shows p tag, no button
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
