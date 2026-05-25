import { describe, it, expect, vi } from 'vitest'
import { mountWithUI } from '@/__tests__/test-utils'
import TabManager from '@/components/TabManager.vue'

vi.mock('@/core/useConfig', () => ({
  useConfig: () => ({
    tabs: {
      value: [
        { id: 'tab-1', name: 'Locos', icon: 'i-mdi-train', widgets: [] },
        { id: 'tab-2', name: 'Yard', icon: 'i-mdi-map', widgets: [] },
      ],
    },
    saveTabs: vi.fn(),
    config: { value: {} },
    loading: { value: false },
    needsSetup: { value: false },
    save: vi.fn(),
    reset: vi.fn(),
  }),
}))

const VueDraggableStub = {
  props: ['modelValue'],
  emits: ['update:modelValue', 'end'],
  template: '<ul><slot /></ul>',
}

describe('TabManager', () => {
  it('renders tab names', () => {
    const wrapper = mountWithUI(TabManager, {
      props: { activeTab: 'tab-1' },
      global: { stubs: { VueDraggable: VueDraggableStub } },
    })
    expect(wrapper.text()).toContain('Locos')
    expect(wrapper.text()).toContain('Yard')
  })

  it('emits select with tab id when a tab is clicked', async () => {
    const wrapper = mountWithUI(TabManager, {
      props: { activeTab: 'tab-1' },
      global: { stubs: { VueDraggable: VueDraggableStub } },
    })
    const buttons = wrapper.findAll('button')
    const yardButton = buttons.find(b => b.text().includes('Yard'))
    await yardButton!.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['tab-2'])
  })

  it('renders the add-tab button', () => {
    const wrapper = mountWithUI(TabManager, {
      props: { activeTab: 'tab-1' },
      global: { stubs: { VueDraggable: VueDraggableStub } },
    })
    expect(wrapper.find('[data-icon="i-heroicons-plus"]').exists()).toBe(true)
  })
})
