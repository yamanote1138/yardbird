import { describe, it, expect, afterEach, vi } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import HeaderButtons from '@/components/HeaderButtons.vue'
import { useJmri } from '@/plugins/jmri'
import { useEditMode } from '@/composables/useEditMode'
import { PowerState } from 'jmri-client'

// useConfig reads localStorage on import — provide minimal stub
vi.mock('@/core/useConfig', () => ({
  useConfig: () => ({
    jmri: { value: { host: 'localhost', port: 12080, mock: true } },
    homeassistant: { value: null },
    loading: { value: false },
  }),
}))

describe('HeaderButtons', () => {
  afterEach(async () => {
    useJmri().disconnect()
    useEditMode().exit()
    await new Promise(r => setTimeout(r, 50))
  })

  it('renders without crashing', () => {
    const wrapper = mountWithUI(HeaderButtons)
    expect(wrapper.find('[role="group"]').exists()).toBe(true)
  })

  it('edit mode button shows pencil icon in run mode', () => {
    const wrapper = mountWithUI(HeaderButtons)
    expect(wrapper.find('[data-icon="i-mdi-pencil"]').exists()).toBe(true)
  })

  it('edit mode button shows save icon in edit mode', async () => {
    useEditMode().toggle()
    const wrapper = mountWithUI(HeaderButtons)
    expect(wrapper.find('[data-icon="i-mdi-content-save"]').exists()).toBe(true)
  })

  it('power button shows bolt icon when power is ON', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.ON
    const wrapper = mountWithUI(HeaderButtons)
    expect(wrapper.find('[data-icon="i-heroicons-bolt"]').exists()).toBe(true)
  })

  it('stop-all button is disabled when no throttles are active', async () => {
    await connectMockJmri()
    const wrapper = mountWithUI(HeaderButtons)
    const stopBtn = wrapper.findAll('button').find(b =>
      b.text().includes('Stop All') || b.attributes('title')?.includes('Emergency Stop')
    )
    expect(stopBtn?.attributes('disabled')).toBeDefined()
  })
})
