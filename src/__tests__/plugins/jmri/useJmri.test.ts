import { describe, it, expect, afterEach, vi } from 'vitest'
import { useJmri, ConnectionState } from '@/plugins/jmri'
import { PowerState, LightState } from 'jmri-client'

const MOCK_SETTINGS = {
  host: 'localhost',
  port: 12080,
  protocol: 'ws' as const,
  mockEnabled: true,
  mockDelay: 0,
}

async function connectMock(settings = MOCK_SETTINGS) {
  const jmri = useJmri()
  jmri.initialize(settings)
  await vi.waitFor(() => {
    expect(jmri.connectionState.value).toBe(ConnectionState.CONNECTED)
  }, { timeout: 3000 })
  return jmri
}

describe('useJmri', () => {
  afterEach(async () => {
    useJmri().disconnect()
    // Let the mock client's pending async callbacks settle before the next test
    await new Promise(resolve => setTimeout(resolve, 50))
  })

  describe('connection', () => {
    it('starts as DISCONNECTED', () => {
      const { connectionState } = useJmri()
      expect(connectionState.value).toBe(ConnectionState.DISCONNECTED)
    })

    it('transitions to CONNECTED after initialize with mock', async () => {
      const { connectionState } = await connectMock()
      expect(connectionState.value).toBe(ConnectionState.CONNECTED)
    })

    it('populates railroadName from hello response', async () => {
      const { railroadName } = await connectMock()
      expect(railroadName.value).toBe('Demo Railroad')
    })

    it('populates jmriVersion from hello response', async () => {
      const { jmriVersion } = await connectMock()
      expect(jmriVersion.value).toBe('5.9.2')
    })

    it('transitions to DISCONNECTED after disconnect', async () => {
      const { connectionState, disconnect } = await connectMock()
      disconnect()
      expect(connectionState.value).toBe(ConnectionState.DISCONNECTED)
    })

    it('clears all state on disconnect', async () => {
      const { disconnect, jmriState, acquireThrottle } = await connectMock()
      await acquireThrottle(3)
      disconnect()
      expect(jmriState.value.throttles.size).toBe(0)
      expect(jmriState.value.lights.size).toBe(0)
      expect(jmriState.value.turnouts.size).toBe(0)
    })
  })

  describe('power', () => {
    it('sets power to ON', async () => {
      const { setPower, jmriState } = await connectMock()
      await setPower('on')
      expect(jmriState.value.power).toBe(PowerState.ON)
    })

    it('sets power to OFF', async () => {
      const { setPower, jmriState } = await connectMock()
      await setPower('on')
      await setPower('off')
      expect(jmriState.value.power).toBe(PowerState.OFF)
    })
  })

  describe('lights', () => {
    it('populates lights automatically on connect', async () => {
      const { lights } = await connectMock()
      await vi.waitFor(() => {
        expect(lights.value.length).toBeGreaterThan(0)
      }, { timeout: 3000 })
    })

    it('toggles a light from OFF to ON', async () => {
      const { lights, toggleLight, jmriState } = await connectMock()
      await vi.waitFor(() => expect(lights.value.length).toBeGreaterThan(0), { timeout: 3000 })
      expect(jmriState.value.lights.get('IL1')?.state).toBe(LightState.OFF)
      await toggleLight('IL1')
      await vi.waitFor(() => {
        expect(jmriState.value.lights.get('IL1')?.state).toBe(LightState.ON)
      }, { timeout: 3000 })
    })
  })

  describe('turnouts', () => {
    it('populates turnouts automatically on connect', async () => {
      const { turnouts } = await connectMock()
      await vi.waitFor(() => {
        expect(turnouts.value.length).toBeGreaterThan(0)
      }, { timeout: 3000 })
    })

    it('throws a turnout', async () => {
      const { turnouts, throwTurnout, jmriState } = await connectMock()
      await vi.waitFor(() => expect(turnouts.value.length).toBeGreaterThan(0), { timeout: 3000 })
      await throwTurnout('LT1')
      await vi.waitFor(() => {
        expect(jmriState.value.turnouts.get('LT1')?.state).toBe(4) // TurnoutState.THROWN
      }, { timeout: 3000 })
    })
  })

  describe('throttles', () => {
    it('adds a throttle to state on acquire', async () => {
      const { acquireThrottle, throttles } = await connectMock()
      await acquireThrottle(3)
      expect(throttles.value).toHaveLength(1)
      expect(throttles.value[0].address).toBe(3)
    })

    it('removes throttle from state on release', async () => {
      const { acquireThrottle, releaseThrottle, throttles } = await connectMock()
      await acquireThrottle(3)
      expect(throttles.value).toHaveLength(1)
      await releaseThrottle(3)
      expect(throttles.value).toHaveLength(0)
    })

    it('creates a synthetic roster entry for unknown addresses', async () => {
      const { acquireThrottle, jmriState } = await connectMock()
      await acquireThrottle(99)
      expect(jmriState.value.roster.has(99)).toBe(true)
      expect(jmriState.value.roster.get(99)?.name).toBe('Address 99')
    })

    it('sets F31 on acquire for DC loco addresses', async () => {
      const { acquireThrottle, jmriState } = await connectMock()
      await acquireThrottle(32)
      await vi.waitFor(() => {
        expect(jmriState.value.throttles.get(32)?.functions['F31']?.value).toBe(true)
      }, { timeout: 1000 })
    })

    it('does not set F31 on acquire for standard addresses', async () => {
      const { acquireThrottle, jmriState } = await connectMock()
      await acquireThrottle(3)
      expect(jmriState.value.throttles.get(3)?.functions['F31']?.value).not.toBe(true)
    })

    it('setThrottleFunction accepts F29+ without throwing', async () => {
      const { acquireThrottle, setThrottleFunction } = await connectMock()
      await acquireThrottle(32)
      await expect(setThrottleFunction(32, 29, true)).resolves.not.toThrow()
      await expect(setThrottleFunction(32, 30, false)).resolves.not.toThrow()
      await expect(setThrottleFunction(32, 31, true)).resolves.not.toThrow()
    })
  })

  describe('roster groups', () => {
    // Mock data: diesels = [CSX754 addr 754, BNSF5240 addr 5240], steam = [UP3985 addr 3985]
    // All groups are fetched unconditionally — no config filter

    it('fetchRosterGroups populates ALL JMRI groups in groupedRoster', async () => {
      const { fetchRosterGroups, groupedRoster } = await connectMock()
      await fetchRosterGroups()
      expect(groupedRoster.value.length).toBeGreaterThanOrEqual(2)
      const diesels = groupedRoster.value.find(g => g.name === 'diesels')
      const steam = groupedRoster.value.find(g => g.name === 'steam')
      expect(diesels).toBeDefined()
      expect(steam).toBeDefined()
    })

    it('groupedRoster contains correct entries per group', async () => {
      const { fetchRosterGroups, groupedRoster } = await connectMock()
      await fetchRosterGroups()
      const diesels = groupedRoster.value.find(g => g.name === 'diesels')
      expect(diesels!.entries.map(e => e.address)).toContain(754)
      expect(diesels!.entries.map(e => e.address)).toContain(5240)
    })

    it('ungroupedRoster excludes entries belonging to any fetched group', async () => {
      const { fetchRosterGroups, ungroupedRoster } = await connectMock()
      await fetchRosterGroups()
      expect(ungroupedRoster.value.some(e => e.address === 754)).toBe(false)
      expect(ungroupedRoster.value.some(e => e.address === 5240)).toBe(false)
      expect(ungroupedRoster.value.some(e => e.address === 3985)).toBe(false)
    })

    it('clears stale groups on re-fetch', async () => {
      const { fetchRosterGroups, groupedRoster } = await connectMock()
      await fetchRosterGroups()
      const countAfterFirst = groupedRoster.value.length
      await fetchRosterGroups()
      expect(groupedRoster.value.length).toBe(countAfterFirst)
    })
  })
})
