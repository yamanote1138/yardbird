import { describe, it, expect } from 'vitest'
import { mountWithUI } from '@/__tests__/test-utils'
import LocomotiveHeader from '@/plugins/jmri/components/LocomotiveHeader.vue'

describe('LocomotiveHeader', () => {
  it('renders the locomotive name', () => {
    const wrapper = mountWithUI(LocomotiveHeader, {
      props: { name: 'Hogwarts Express' },
    })
    expect(wrapper.text()).toContain('Hogwarts Express')
  })

  it('renders road and number when provided', () => {
    const wrapper = mountWithUI(LocomotiveHeader, {
      props: { name: 'Black Five', road: 'LMS', number: '45000' },
    })
    expect(wrapper.text()).toContain('LMS')
    expect(wrapper.text()).toContain('#45000')
  })

  it('does not render road/number section when both are absent', () => {
    const wrapper = mountWithUI(LocomotiveHeader, {
      props: { name: 'Unknown Loco' },
    })
    expect(wrapper.find('small').exists()).toBe(false)
  })

  it('emits click when not disabled', async () => {
    const wrapper = mountWithUI(LocomotiveHeader, {
      props: { name: 'Loco', disabled: false },
    })
    await wrapper.find('.loco-header').trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })

  it('does not emit click when disabled', async () => {
    const wrapper = mountWithUI(LocomotiveHeader, {
      props: { name: 'Loco', disabled: true },
    })
    await wrapper.find('.loco-header').trigger('click')
    expect(wrapper.emitted('click')).toBeFalsy()
  })
})
