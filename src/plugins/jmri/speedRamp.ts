import { ref } from 'vue'

export const POWER_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]

const SEGMENT_SIZE = 0.1
const RAMP_INTERVAL = 100
const MIN_DURATION = 200
const MIN_STEPS = 5

// Clicking a lit segment steps down one level; clicking an unlit one goes to it
export function targetForSegment(currentSpeed: number, index: number): number {
  if (currentSpeed >= POWER_LEVELS[index]) {
    return index === 0 ? 0 : POWER_LEVELS[index - 1]
  }
  return POWER_LEVELS[index]
}

interface SpeedRampOptions {
  getSpeed: () => number
  setSpeed: (speed: number) => Promise<void>
  msPerSegment: number
}

export function createSpeedRamp({ getSpeed, setSpeed, msPerSegment }: SpeedRampOptions) {
  const isRamping = ref(false)
  let currentRun = 0

  function stop() {
    currentRun++
    isRamping.value = false
  }

  // Resolves true if the ramp reached its target, false if superseded or stopped
  async function rampTo(targetSpeed: number): Promise<boolean> {
    const run = ++currentRun
    const startSpeed = getSpeed()
    if (startSpeed === targetSpeed) {
      stop()
      return true
    }

    isRamping.value = true

    const segments = Math.abs(targetSpeed - startSpeed) / SEGMENT_SIZE
    const duration = Math.max(segments * msPerSegment, MIN_DURATION)
    const steps = Math.max(Math.ceil(duration / RAMP_INTERVAL), MIN_STEPS)

    for (let i = 1; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, RAMP_INTERVAL))
      if (run !== currentRun) return false
      const speed = i === steps ? targetSpeed : startSpeed + (targetSpeed - startSpeed) * (i / steps)
      await setSpeed(Math.round(speed * 1000) / 1000)
      if (run !== currentRun) return false
    }

    isRamping.value = false
    return true
  }

  return { rampTo, stop, isRamping }
}
