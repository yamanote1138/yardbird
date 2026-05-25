import { describe, it, expect, afterEach, vi } from 'vitest'
import { mountWithUI } from '@/__tests__/test-utils'
import WidgetFrame from '@/widgets/WidgetFrame.vue'
import { useEditMode } from '@/composables/useEditMode'

// Stub the async component resolution so the inner widget doesn't actually load
vi.mock('@/widgets/registry', () => ({
  getWidgetDef: () => ({
    name: 'Test Widget',
    icon: 'i-mdi-test',
    hasConfig: true,
    component: () => Promise.resolve({ template: '<div>widget</div>' }),
  }),
}))

const FRAME_PROPS = {
  widgetId: 'w-1',
  widgetType: 'jmri-turnout' as const,
  widgetConfig: {},
}

describe('WidgetFrame', () => {
  afterEach(() => {
    useEditMode().exit()
  })

  it('does not show edit overlay in run mode', () => {
    const wrapper = mountWithUI(WidgetFrame, { props: FRAME_PROPS })
    expect(wrapper.find('.gs-drag-handle').exists()).toBe(false)
  })

  it('shows edit overlay in edit mode', async () => {
    useEditMode().toggle()
    const wrapper = mountWithUI(WidgetFrame, { props: FRAME_PROPS })
    expect(wrapper.find('.gs-drag-handle').exists()).toBe(true)
  })

  it('shows configure button when def.hasConfig is true', async () => {
    useEditMode().toggle()
    const wrapper = mountWithUI(WidgetFrame, { props: FRAME_PROPS })
    const configBtn = wrapper.find('button[title="Configure widget"]')
    expect(configBtn.exists()).toBe(true)
  })

  it('emits configure with widgetId when configure button clicked', async () => {
    useEditMode().toggle()
    const wrapper = mountWithUI(WidgetFrame, { props: FRAME_PROPS })
    await wrapper.find('button[title="Configure widget"]').trigger('click')
    expect(wrapper.emitted('configure')).toEqual([['w-1']])
  })

  it('emits remove with widgetId when delete button clicked', async () => {
    useEditMode().toggle()
    const wrapper = mountWithUI(WidgetFrame, { props: FRAME_PROPS })
    await wrapper.find('button[title="Remove widget"]').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['w-1']])
  })
})
