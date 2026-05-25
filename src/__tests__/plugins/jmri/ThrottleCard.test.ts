import { describe, it, expect, afterEach } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import ThrottleCard from '@/plugins/jmri/components/ThrottleCard.vue'
import { useJmri } from '@/plugins/jmri'
import type { Throttle } from '@/types/jmri'
import { Direction } from '@/types/jmri'
import { PowerState } from 'jmri-client'

const LOCO_STUB = { template: '<div data-testid="loco-header" />' }

const makeThrottle = (overrides: Partial<Throttle> = {}): Throttle => ({
  address: 3,
  name: 'Flying Scotsman',
  road: 'LNER',
  number: '4472',
  speed: 0,
  direction: Direction.FORWARD,
  directionVerified: true,
  functions: {},
  acquiredAt: Date.now(),
  ...overrides,
})

describe('ThrottleCard', () => {
  afterEach(async () => {
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('renders speed as percentage', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.ON
    const wrapper = mountWithUI(ThrottleCard, {
      props: { throttle: makeThrottle({ speed: 0.5 }) },
      global: { stubs: { LocomotiveHeader: LOCO_STUB } },
    })
    expect(wrapper.text()).toContain('50%')
  })

  it('shows Forward when direction is FORWARD and verified', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.ON
    const wrapper = mountWithUI(ThrottleCard, {
      props: { throttle: makeThrottle({ direction: Direction.FORWARD, directionVerified: true }) },
      global: { stubs: { LocomotiveHeader: LOCO_STUB } },
    })
    expect(wrapper.text()).toContain('Forward')
  })

  it('shows Reverse when direction is REVERSE and verified', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.ON
    const wrapper = mountWithUI(ThrottleCard, {
      props: { throttle: makeThrottle({ direction: Direction.REVERSE, directionVerified: true }) },
      global: { stubs: { LocomotiveHeader: LOCO_STUB } },
    })
    expect(wrapper.text()).toContain('Reverse')
  })

  it('shows Unknown when direction is not verified', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.ON
    const wrapper = mountWithUI(ThrottleCard, {
      props: { throttle: makeThrottle({ directionVerified: false }) },
      global: { stubs: { LocomotiveHeader: LOCO_STUB } },
    })
    expect(wrapper.text()).toContain('Unknown')
  })

  it('E-Stop button exists', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.power = PowerState.ON
    const wrapper = mountWithUI(ThrottleCard, {
      props: { throttle: makeThrottle() },
      global: { stubs: { LocomotiveHeader: LOCO_STUB } },
    })
    expect(wrapper.text()).toContain('E-Stop')
  })

  it('controls are disabled when not connected', () => {
    const wrapper = mountWithUI(ThrottleCard, {
      props: { throttle: makeThrottle() },
      global: { stubs: { LocomotiveHeader: LOCO_STUB } },
    })
    const buttons = wrapper.findAll('button')
    const disabledButtons = buttons.filter(b => b.attributes('disabled') !== undefined)
    expect(disabledButtons.length).toBeGreaterThan(0)
  })
})
