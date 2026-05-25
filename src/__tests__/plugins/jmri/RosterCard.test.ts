import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import RosterCard from '@/plugins/jmri/components/RosterCard.vue'
import { useJmri } from '@/plugins/jmri'
import { PowerState } from 'jmri-client'
import type { RosterEntry } from '@/types/jmri'

const ENTRY: RosterEntry = {
  address: 5972,
  name: 'Hogwarts Express',
  road: 'BR',
  number: '5972',
}

describe('RosterCard', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('renders the locomotive name', () => {
    const wrapper = mountWithUI(RosterCard, { props: { entry: ENTRY } })
    expect(wrapper.text()).toContain('Hogwarts Express')
  })

  it('renders road and number', () => {
    const wrapper = mountWithUI(RosterCard, { props: { entry: ENTRY } })
    expect(wrapper.text()).toContain('BR')
    expect(wrapper.text()).toContain('5972')
  })

  it('acquire is disabled when not connected', () => {
    const wrapper = mountWithUI(RosterCard, { props: { entry: ENTRY } })
    const header = wrapper.find('.loco-header')
    expect(header.classes()).toContain('disabled')
  })

  it('acquire is disabled when power is off', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.OFF
    const wrapper = mountWithUI(RosterCard, { props: { entry: ENTRY } })
    const header = wrapper.find('.loco-header')
    expect(header.classes()).toContain('disabled')
  })

  it('acquire is enabled when connected and power is ON', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.ON
    const wrapper = mountWithUI(RosterCard, { props: { entry: ENTRY } })
    const header = wrapper.find('.loco-header')
    expect(header.classes()).not.toContain('disabled')
  })
})
