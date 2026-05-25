import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import ThrottleWidget from '@/plugins/jmri/components/ThrottleWidget.vue'
import { useJmri } from '@/plugins/jmri'
import type { RosterEntry, Throttle } from '@/types/jmri'
import { Direction } from '@/types/jmri'

const ROSTER_ENTRY: RosterEntry = {
  address: 3, name: 'Thomas', road: 'NWR', number: '1',
}

const MOCK_THROTTLE: Throttle = {
  address: 3, name: 'Thomas', road: 'NWR', number: '1',
  speed: 0, direction: Direction.FORWARD, directionVerified: true,
  functions: {}, acquiredAt: Date.now(),
}

describe('ThrottleWidget', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('shows alert when address is not in roster and no throttle', async () => {
    await connectMockJmri()
    const wrapper = mountWithUI(ThrottleWidget, {
      props: { address: 999 },
      global: {
        stubs: { ThrottleCard: true, RosterCard: true },
      },
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('999')
  })

  it('shows RosterCard when address is in roster but not acquired', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.roster.set(3, ROSTER_ENTRY)
    const wrapper = mountWithUI(ThrottleWidget, {
      props: { address: 3 },
      global: {
        stubs: {
          ThrottleCard: { template: '<div data-testid="throttle-card" />' },
          RosterCard: { template: '<div data-testid="roster-card" />' },
        },
      },
    })
    expect(wrapper.find('[data-testid="roster-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="throttle-card"]').exists()).toBe(false)
  })

  it('shows ThrottleCard when throttle is acquired', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.throttles.set(3, MOCK_THROTTLE)
    const wrapper = mountWithUI(ThrottleWidget, {
      props: { address: 3 },
      global: {
        stubs: {
          ThrottleCard: { template: '<div data-testid="throttle-card" />' },
          RosterCard: { template: '<div data-testid="roster-card" />' },
        },
      },
    })
    expect(wrapper.find('[data-testid="throttle-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="roster-card"]').exists()).toBe(false)
  })
})
