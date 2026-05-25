import { describe, it, expect, afterEach, vi } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import WidgetPalette from '@/widgets/WidgetPalette.vue'
import { useEditMode } from '@/composables/useEditMode'
import { useJmri } from '@/plugins/jmri'

vi.mock('gridstack', () => ({
  GridStack: { setupDragIn: vi.fn() },
}))

describe('WidgetPalette', () => {
  afterEach(async () => {
    useEditMode().exit()
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('is not rendered in run mode', () => {
    const wrapper = mountWithUI(WidgetPalette)
    expect(wrapper.find('.w-44').exists()).toBe(false)
  })

  it('is rendered in edit mode', async () => {
    useEditMode().toggle()
    const wrapper = mountWithUI(WidgetPalette)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.w-44').exists()).toBe(true)
  })

  it('shows no widgets when not connected in edit mode', async () => {
    useEditMode().toggle()
    const wrapper = mountWithUI(WidgetPalette)
    await wrapper.vm.$nextTick()
    // All widgets require a plugin connection — none shown without JMRI or HA
    expect(wrapper.text()).not.toContain('Turnout')
    expect(wrapper.text()).not.toContain('Command Station')
  })

  it('shows JMRI widgets only when JMRI is connected', async () => {
    useEditMode().toggle()
    await connectMockJmri()
    const wrapper = mountWithUI(WidgetPalette)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Turnout')
  })
})
