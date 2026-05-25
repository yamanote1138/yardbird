import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI } from '@/__tests__/test-utils'
import WidgetConfigModal from '@/widgets/WidgetConfigModal.vue'
import { useWidgetConfig } from '@/composables/useWidgetConfig'

describe('WidgetConfigModal', () => {
  afterEach(() => {
    useWidgetConfig().cancel()
  })

  it('renders nothing when no pending config', () => {
    const wrapper = mountWithUI(WidgetConfigModal)
    // UModal stub renders nothing when open=false
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Cancel')
  })

  it('renders modal when a config is pending', async () => {
    useWidgetConfig().openForNew(
      { id: 'w1', type: 'jmri-turnout', grid: { x: 0, y: 0, w: 2, h: 2 }, config: {} },
      () => {},
      () => {},
    )
    await new Promise(r => setTimeout(r, 0)) // flush reactive updates
    const wrapper = mountWithUI(WidgetConfigModal)
    expect(wrapper.find('div').exists()).toBe(true)
    expect(wrapper.text()).toContain('Cancel')
  })

  it('cancel button calls wc.cancel', async () => {
    useWidgetConfig().openForNew(
      { id: 'w1', type: 'jmri-power', grid: { x: 0, y: 0, w: 2, h: 2 }, config: {} },
      () => {},
      () => {},
    )
    await new Promise(r => setTimeout(r, 0))
    const wrapper = mountWithUI(WidgetConfigModal)
    await wrapper.find('button[color="neutral"]').trigger('click')
    expect(useWidgetConfig().pending.value).toBeNull()
  })
})
