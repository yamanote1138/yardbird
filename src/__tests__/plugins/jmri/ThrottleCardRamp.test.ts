import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { mountWithUI } from '@/__tests__/test-utils'
import type { Throttle } from '@/types/jmri'
import { Direction } from '@/types/jmri'
import { PowerState } from 'jmri-client'

const throttle = reactive<Throttle>({
  address: 3, name: 'Test', road: '', number: '', speed: 0,
  direction: Direction.FORWARD, directionVerified: true, functions: {}, acquiredAt: 0,
})

const setThrottleSpeed = vi.fn(async (_a: number, s: number) => { throttle.speed = s })
const setThrottleDirection = vi.fn(async (_a: number, d: Direction) => { throttle.direction = d })

vi.mock('@/plugins/jmri', () => ({
  useJmri: () => ({
    isConnected: ref(true),
    power: ref(PowerState.ON),
    setThrottleSpeed,
    setThrottleDirection,
    setThrottleFunction: vi.fn(),
    releaseThrottle: vi.fn(),
  }),
}))

const { default: ThrottleCard } = await import('@/plugins/jmri/components/ThrottleCard.vue')

function mountCard() {
  return mountWithUI(ThrottleCard, {
    props: { throttle },
    global: { stubs: { LocomotiveHeader: { template: '<div />' } } },
  })
}

const segment = (w: ReturnType<typeof mountCard>, i: number) => w.findAll('.speed-segment')[i]
const controlButton = (w: ReturnType<typeof mountCard>, label: string) =>
  w.find('[aria-label="Direction and stop controls"]').findAll('button').find(b => b.text().includes(label))!

describe('ThrottleCard ramping', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    throttle.speed = 0
    throttle.direction = Direction.FORWARD
    setThrottleSpeed.mockClear()
    setThrottleDirection.mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('re-targets to a new segment clicked mid-ramp', async () => {
    const w = mountCard()
    await segment(w, 4).trigger('click')
    await vi.advanceTimersByTimeAsync(3000)
    expect(throttle.speed).toBeGreaterThan(0)
    expect(throttle.speed).toBeLessThan(0.2)
    await segment(w, 1).trigger('click')
    await vi.advanceTimersByTimeAsync(10000)
    expect(throttle.speed).toBe(0.2)
  })

  it('clicking a lit segment ramps down to that segment', async () => {
    throttle.speed = 0.8
    const w = mountCard()
    await segment(w, 2).trigger('click')
    await vi.advanceTimersByTimeAsync(15000)
    expect(throttle.speed).toBe(0.3)
  })

  it('clicking the first segment ramps to its speed, not to zero', async () => {
    throttle.speed = 0.5
    const w = mountCard()
    await segment(w, 0).trigger('click')
    await vi.advanceTimersByTimeAsync(15000)
    expect(throttle.speed).toBe(0.1)
  })

  it('clicking the current segment does nothing', async () => {
    throttle.speed = 0.4
    const w = mountCard()
    await segment(w, 3).trigger('click')
    await vi.advanceTimersByTimeAsync(5000)
    expect(setThrottleSpeed).not.toHaveBeenCalled()
  })

  it('brake interrupts a ramp and brings the loco to zero', async () => {
    const w = mountCard()
    await segment(w, 9).trigger('click')
    await vi.advanceTimersByTimeAsync(4000)
    await controlButton(w, 'Brake').trigger('click')
    await vi.advanceTimersByTimeAsync(10000)
    expect(throttle.speed).toBe(0)
  })

  it('direction change while moving ramps down, flips, and returns to the same speed', async () => {
    throttle.speed = 0.35
    const w = mountCard()
    await controlButton(w, 'Forward').trigger('click')
    await vi.advanceTimersByTimeAsync(20000)
    expect(setThrottleDirection).toHaveBeenCalledWith(3, Direction.REVERSE)
    expect(throttle.speed).toBe(0.35)
  })

  it('does not flip direction if a speed click interrupts the ramp-down', async () => {
    throttle.speed = 0.5
    const w = mountCard()
    await controlButton(w, 'Forward').trigger('click')
    await vi.advanceTimersByTimeAsync(2000)
    await segment(w, 7).trigger('click')
    await vi.advanceTimersByTimeAsync(20000)
    expect(setThrottleDirection).not.toHaveBeenCalled()
    expect(throttle.speed).toBe(0.8)
  })

  it('does not resume after E-stop during the direction-change pause', async () => {
    throttle.speed = 0.1
    const w = mountCard()
    await controlButton(w, 'Forward').trigger('click')
    await vi.advanceTimersByTimeAsync(2100)
    expect(throttle.speed).toBe(0)
    await controlButton(w, 'E-Stop').trigger('click')
    await vi.advanceTimersByTimeAsync(20000)
    expect(setThrottleDirection).not.toHaveBeenCalled()
    expect(throttle.speed).toBe(0)
  })

  it('waits after flipping direction before ramping back up', async () => {
    throttle.speed = 0.2
    let flippedAt = 0
    const speedTimes: number[] = []
    setThrottleDirection.mockImplementationOnce(async (_a, d) => { throttle.direction = d; flippedAt = Date.now() })
    setThrottleSpeed.mockImplementation(async (_a, s) => { throttle.speed = s; speedTimes.push(Date.now()) })
    const w = mountCard()
    await controlButton(w, 'Forward').trigger('click')
    await vi.advanceTimersByTimeAsync(20000)
    const firstAfterFlip = speedTimes.find(t => t > flippedAt)!
    expect(firstAfterFlip - flippedAt).toBeGreaterThanOrEqual(200)
    expect(throttle.speed).toBe(0.2)
    setThrottleSpeed.mockImplementation(async (_a, s) => { throttle.speed = s })
  })

  it('disables brake when the loco is stopped', async () => {
    const w = mountCard()
    expect(controlButton(w, 'Brake').attributes('disabled')).toBeDefined()
    throttle.speed = 0.3
    await w.vm.$nextTick()
    expect(controlButton(w, 'Brake').attributes('disabled')).toBeUndefined()
  })

  it('E-stop cancels the ramp and sets zero immediately', async () => {
    const w = mountCard()
    await segment(w, 9).trigger('click')
    await vi.advanceTimersByTimeAsync(3000)
    await controlButton(w, 'E-Stop').trigger('click')
    expect(throttle.speed).toBe(0)
    const count = setThrottleSpeed.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(setThrottleSpeed.mock.calls.length).toBe(count)
  })
})
