import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSpeedRamp } from '@/plugins/jmri/speedRamp'

function makeLoco(initial = 0) {
  const loco = { speed: initial, calls: [] as number[] }
  const ramp = createSpeedRamp({
    getSpeed: () => loco.speed,
    setSpeed: async (v: number) => { loco.speed = v; loco.calls.push(v) },
    msPerSegment: 2000,
  })
  return { loco, ramp }
}

describe('createSpeedRamp', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('ramps to the target and lands exactly on it', async () => {
    const { loco, ramp } = makeLoco(0)
    const done = ramp.rampTo(0.3)
    await vi.advanceTimersByTimeAsync(7000)
    await done
    expect(loco.speed).toBe(0.3)
    expect(loco.calls.length).toBeGreaterThan(5)
  })

  it('times the ramp from the actual current speed', async () => {
    const { loco, ramp } = makeLoco(0.4)
    ramp.rampTo(0.8)
    await vi.advanceTimersByTimeAsync(7000)
    expect(loco.speed).toBeLessThan(0.8)
    expect(ramp.isRamping.value).toBe(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(loco.speed).toBe(0.8)
    expect(ramp.isRamping.value).toBe(false)
  })

  it('re-targets from the current speed when called mid-ramp', async () => {
    const { loco, ramp } = makeLoco(0)
    const first = ramp.rampTo(1.0)
    await vi.advanceTimersByTimeAsync(4000)
    const peak = loco.speed
    expect(peak).toBeGreaterThan(0)
    ramp.rampTo(0)
    await vi.advanceTimersByTimeAsync(10000)
    await first
    expect(loco.speed).toBe(0)
    expect(Math.max(...loco.calls)).toBeLessThanOrEqual(peak + 0.02)
  })

  it('stop() cancels the ramp with no further speed changes', async () => {
    const { loco, ramp } = makeLoco(0)
    ramp.rampTo(1.0)
    await vi.advanceTimersByTimeAsync(1000)
    ramp.stop()
    const count = loco.calls.length
    await vi.advanceTimersByTimeAsync(20000)
    expect(loco.calls.length).toBe(count)
    expect(ramp.isRamping.value).toBe(false)
  })

  it('resolves true when the ramp completes and false when superseded', async () => {
    const { ramp } = makeLoco(0)
    const first = ramp.rampTo(1.0)
    await vi.advanceTimersByTimeAsync(1000)
    const second = ramp.rampTo(0)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await first).toBe(false)
    expect(await second).toBe(true)
  })

  it('does nothing when steady within rounding of the target', async () => {
    const { loco, ramp } = makeLoco(0.3968)
    await ramp.rampTo(0.4)
    expect(loco.calls).toEqual([])
  })

  it('pins the speed when re-targeted to where it is mid-ramp', async () => {
    const { loco, ramp } = makeLoco(0)
    ramp.rampTo(1.0)
    await vi.advanceTimersByTimeAsync(4000)
    const here = loco.speed
    ramp.rampTo(here)
    await vi.advanceTimersByTimeAsync(5000)
    expect(loco.speed).toBe(here)
    expect(ramp.isRamping.value).toBe(false)
  })

  it('rounds the ramp to whole segments', async () => {
    const { loco, ramp } = makeLoco(0.35)
    ramp.rampTo(0.8)
    await vi.advanceTimersByTimeAsync(9500)
    expect(loco.speed).toBeLessThan(0.8)
    await vi.advanceTimersByTimeAsync(600)
    expect(loco.speed).toBe(0.8)
  })

  it('does nothing when already at the target', async () => {
    const { loco, ramp } = makeLoco(0.5)
    await ramp.rampTo(0.5)
    expect(loco.calls).toEqual([])
  })
})
