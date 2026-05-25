/**
 * JMRI control composable
 * Handles connection and control of JMRI model railroad system
 */

import { ref, computed } from 'vue'
import { logger } from '@/utils/logger'
import type { JmriState, Throttle, RosterEntry, Direction, ThrottleFunction, LightData } from '@/types/jmri'

import { JmriClient, PowerState, LightState } from 'jmri-client'
import type { CommandStation, CommandStationsConfig, RosterGroupConfig } from '@/core/types'

// Connection state enum
export enum ConnectionState {
  UNKNOWN = 'unknown',      // JMRI state unknown (reconnecting, initializing, etc.)
  DISCONNECTED = 'disconnected', // JMRI disconnected
  CONNECTED = 'connected'   // JMRI connected
}

export interface JmriConnectionSettings {
  host: string
  port: number
  protocol: 'ws' | 'wss'
  mockEnabled: boolean
  mockDelay?: number
  rosterGroups?: RosterGroupConfig[]
  commandStationsConfig?: CommandStationsConfig
}

// Background-tab brake watchdog. JMRI's idle-kill is 30s; the heartbeat is 15s,
// so worst case the last beat fired at t=-14s leaving ~16s before JMRI cuts us.
// 12s leaves ~3-4s for the brake itself (1.5s ramp + per-throttle release).
const HIDDEN_BRAKE_WATCHDOG_MS = 12000
const BRAKE_RAMP_MS = 1500
const BRAKE_STEP_MS = 100

// Event surface for the UI to subscribe to (toast notifications).
export interface JmriEvent {
  kind: 'preemptive-release' | 'unexpected-disconnect-released'
  names: string[]
}

// Singleton state
const jmriState = ref<JmriState>({
  power: 0, // PowerState.UNKNOWN
  roster: new Map(),
  throttles: new Map(),
  turnouts: new Map(),
  lights: new Map()
})

// Group name → resolved entries; populated by fetchRosterGroups()
const groupedRosterEntries = ref<Map<string, RosterEntry[]>>(new Map())

const connectionState = ref<ConnectionState>(ConnectionState.DISCONNECTED)
const isServerOnline = ref<boolean>(true) // Browser/web server connectivity
const railroadName = ref<string>('Model Railroad')
const jmriVersion = ref<string>('')
const lastEvent = ref<JmriEvent | null>(null)
let jmriClient: JmriClient | null = null
let currentSettings: JmriConnectionSettings | null = null
const throttleIds = new Map<number, string>() // address -> throttleId mapping

// Listener refs + watchdog state so we can clean them up on disconnect.
let onVisibilityChange: (() => void) | null = null
let onBrowserOnline: (() => void) | null = null
let onBrowserOffline: (() => void) | null = null
let hiddenWatchdogId: ReturnType<typeof setTimeout> | null = null
let preemptiveReleaseInFlight = false
let preemptiveReleaseLastNames: string[] = []

// Command station state — populated on connect based on commandStationsConfig
const commandStations = ref<CommandStation[]>([])
const powerByPrefix = ref<Map<string, PowerState>>(new Map())

function emitJmriEvent(ev: JmriEvent) {
  // Reassign to a fresh object so Vue watchers see the change even if names happen
  // to match a prior event.
  lastEvent.value = { kind: ev.kind, names: [...ev.names] }
}

async function resolveCommandStations(config: CommandStationsConfig | undefined): Promise<CommandStation[]> {
  if (!config) return []
  if (Array.isArray(config)) return config
  if (!config.discover) return []
  try {
    const connections = await jmriClient!.getSystemConnections()
    return (connections as any[]).map(c => ({
      name: c.name ?? c.prefix ?? `Connection ${c.prefix}`,
      prefix: c.prefix ?? ''
    }))
  } catch (error) {
    logger.warn('Failed to discover system connections for power zones:', error)
    return []
  }
}

async function refreshAllZonePower(): Promise<void> {
  if (!jmriClient || commandStations.value.length === 0) return
  const newMap = new Map<string, PowerState>()
  for (const zone of commandStations.value) {
    try {
      const state = zone.prefix
        ? await jmriClient.getPower(zone.prefix)
        : await jmriClient.getPower()
      logger.info(`[Power] Zone "${zone.name}" (prefix="${zone.prefix}") → state=${state}`)
      newMap.set(zone.prefix, state)
    } catch (err) {
      logger.warn(`[Power] Zone "${zone.name}" (prefix="${zone.prefix}") query failed:`, err)
      newMap.set(zone.prefix, PowerState.UNKNOWN)
    }
  }
  powerByPrefix.value = newMap
}

/**
 * Main JMRI composable
 */
export function useJmri() {
  /**
   * Initialize JMRI client with connection settings
   */
  const initialize = (settings: JmriConnectionSettings) => {
    if (jmriClient) {
      logger.warn('JMRI client already initialized, disconnecting first')
      disconnect()
    }

    currentSettings = { ...settings }
    const wsUrl = `${settings.protocol}://${settings.host}:${settings.port}/json`
    logger.debug('Initializing JMRI client with URL:', wsUrl)
    logger.debug('Mock mode enabled:', settings.mockEnabled)

    // Initialize extended JMRI client with named power support
    jmriClient = new JmriClient({
      host: settings.host,
      port: settings.port,
      protocol: settings.protocol,
      autoConnect: false, // Disable auto-connect, we'll connect manually
      mock: {
        enabled: settings.mockEnabled,
        responseDelay: settings.mockDelay || 50
      },
      reconnection: {
        enabled: true,
        maxAttempts: 0, // Infinite retries
        initialDelay: 1000,
        maxDelay: 30000,
        multiplier: 1.5,
        jitter: true
      },
      heartbeat: {
        enabled: !settings.mockEnabled, // Disable in mock mode
        interval: 15000,
        timeout: 5000
      }
    })

    // Set up event handlers
    jmriClient.on('connected', async () => {
      logger.info('JMRI client connected')
      connectionState.value = ConnectionState.CONNECTED

      // Fetch initial power state
      try {
        const powerState = await jmriClient.getPower()
        jmriState.value.power = powerState
        logger.info('Initial power state:', powerState === PowerState.ON ? 'ON' : powerState === PowerState.OFF ? 'OFF' : 'UNKNOWN')
      } catch (error) {
        logger.error('Failed to get initial power state:', error)
      }

      // Resolve power zones and fetch per-zone power state
      try {
        commandStations.value = await resolveCommandStations(currentSettings?.commandStationsConfig)
        if (commandStations.value.length > 0) {
          logger.info(`Command stations resolved: ${commandStations.value.map(z => `"${z.name}" (prefix="${z.prefix}")`).join(', ')}`)
          await refreshAllZonePower()
        }
      } catch (error) {
        logger.error('Failed to resolve power zones:', error)
      }

      // Fetch turnouts
      try {
        await fetchTurnouts()
      } catch (error) {
        logger.error('Failed to fetch turnouts on connect:', error)
      }

      // Fetch lights
      try {
        await fetchLights()
      } catch (error) {
        logger.error('Failed to fetch lights on connect:', error)
      }
    })

    jmriClient.on('hello', (data: any) => {
      if (data?.railroad) {
        railroadName.value = data.railroad
        logger.info('Railroad name:', railroadName.value)
      }
      if (data?.JMRI) {
        jmriVersion.value = data.JMRI
        logger.info('JMRI version:', jmriVersion.value)
      }
    })

    jmriClient.on('disconnected', (reason: any) => {
      logger.warn('JMRI client disconnected:', reason)
      connectionState.value = ConnectionState.UNKNOWN

      // Capture acquired throttle names before clearing so we can toast them.
      // JMRI has already released them server-side; their throttle IDs are dead.
      const releasedNames = Array.from(jmriState.value.throttles.values()).map(t => t.name)
      throttleIds.clear()
      jmriState.value.throttles.clear()

      if (releasedNames.length === 0) return

      // If the preemptive (visibility-driven) release just handled exactly
      // these throttles, suppress the duplicate "unexpected disconnect" toast.
      const handledByVisibility =
        preemptiveReleaseLastNames.length > 0 &&
        releasedNames.every(n => preemptiveReleaseLastNames.includes(n))

      if (handledByVisibility) {
        preemptiveReleaseLastNames = []
        return
      }

      emitJmriEvent({ kind: 'unexpected-disconnect-released', names: releasedNames })
    })

    jmriClient.on('reconnecting', (attempt: number, delay: number) => {
      logger.info(`Reconnecting to JMRI (attempt ${attempt}, delay ${delay}ms)`)
      connectionState.value = ConnectionState.UNKNOWN
    })

    jmriClient.on('reconnected', () => {
      logger.info('JMRI client reconnected successfully')
      connectionState.value = ConnectionState.CONNECTED
    })

    jmriClient.on('reconnectionFailed', (attempts: number) => {
      logger.error(`Failed to reconnect to JMRI after ${attempts} attempts`)
    })

    jmriClient.on('error', (error: any) => {
      logger.error('JMRI client error:', error)
    })

    jmriClient.on('debug', (message: string) => {
      logger.debug('[JMRI]', message)
    })

    jmriClient.on('heartbeat:sent', () => {
      logger.debug('Heartbeat ping sent')
    })

    jmriClient.on('heartbeat:timeout', () => {
      logger.warn('JMRI heartbeat timeout - connection lost')
      connectionState.value = ConnectionState.UNKNOWN
    })

    jmriClient.on('connectionStateChanged', (state: any) => {
      logger.debug('Connection state changed:', state)
    })

    jmriClient.on('power:changed', (state: any) => {
      logger.info('Power state changed:', state === 2 ? 'ON' : state === 4 ? 'OFF' : 'UNKNOWN')
      jmriState.value.power = state
      // Per-zone state is managed optimistically in setPower — the event carries
      // no prefix info and JMRI doesn't reliably respond to named power queries,
      // so we don't re-query here to avoid clobbering the optimistic state.
    })

    jmriClient.on('turnout:changed', (name: string, state: any) => {
      logger.info(`Turnout ${name} changed to`, state === 2 ? 'CLOSED' : state === 4 ? 'THROWN' : state === 8 ? 'INCONSISTENT' : 'UNKNOWN')

      // Update existing turnout or add new one
      const existing = jmriState.value.turnouts.get(name)
      if (existing) {
        jmriState.value.turnouts.set(name, { ...existing, state })
      } else {
        // Turnout not in our list - add with minimal data
        jmriState.value.turnouts.set(name, { name, state })
      }
    })

    jmriClient.on('light:changed', (name: string, state: any) => {
      logger.info(`Light ${name} changed to`, state === LightState.ON ? 'ON' : state === LightState.OFF ? 'OFF' : 'UNKNOWN')

      // Update existing light or add new one
      const existing = jmriState.value.lights.get(name)
      if (existing) {
        jmriState.value.lights.set(name, { ...existing, state })
      } else {
        jmriState.value.lights.set(name, { name, state })
      }
    })

    jmriClient.on('throttle:updated', (throttleId: string, data: any) => {
      logger.debug('Throttle update event:', throttleId, data)

      // Find address from our throttleIds map (reverse lookup)
      let address: number | undefined
      for (const [addr, tId] of throttleIds.entries()) {
        if (tId === throttleId) {
          address = addr
          break
        }
      }

      if (!address) {
        logger.error('Received update for unknown throttle:', throttleId)
        return
      }

      // Get existing throttle and merge updates
      const existing = jmriState.value.throttles.get(address)
      if (!existing) {
        logger.error('No throttle found for address:', address)
        return
      }

      // Handle function updates - functions come directly in data as F0, F1, etc.
      // Extract any function keys (F0-F28) from the data
      const functionUpdates: Record<string, any> = {}
      for (const key in data) {
        if (key.match(/^F\d+$/)) {
          // Preserve existing label and lockable, only update value
          const existingFn = existing.functions[key]
          if (existingFn) {
            functionUpdates[key] = {
              ...existingFn,
              value: typeof data[key] === 'boolean' ? data[key] : data[key].value || false
            }
          } else if (typeof data[key] === 'boolean') {
            // New function not in our list - use function key as label
            functionUpdates[key] = { value: data[key], label: key, lockable: false }
          } else {
            // New function with full object
            functionUpdates[key] = data[key]
          }
        }
      }

      // Update only the changed fields
      const updated: Throttle = {
        ...existing,
        speed: data.speed !== undefined ? data.speed : existing.speed,
        direction: data.forward !== undefined ? data.forward : existing.direction,
        directionVerified: data.forward !== undefined ? true : existing.directionVerified,
        functions: Object.keys(functionUpdates).length > 0
          ? { ...existing.functions, ...functionUpdates }
          : existing.functions
      }

      jmriState.value.throttles.set(address, updated)
    })

    // Connect to JMRI
    jmriClient.connect()

    // Listen for browser-level connectivity changes
    // This detects when the web server (Vite/production) goes down
    onBrowserOffline = () => {
      logger.warn('Browser detected offline - web server may be down')
      isServerOnline.value = false
    }
    onBrowserOnline = () => {
      logger.info('Browser detected back online')
      isServerOnline.value = true
    }
    window.addEventListener('offline', onBrowserOffline)
    window.addEventListener('online', onBrowserOnline)

    // Check initial browser connectivity state
    if (!navigator.onLine) {
      logger.warn('Browser is offline at initialization')
      isServerOnline.value = false
    }

    // Background-tab brake. When the tab is hidden, the browser throttles JS
    // timers, the jmri-client heartbeat eventually misses, and JMRI cuts the
    // socket — hard-releasing all throttles. To preempt that, schedule a
    // watchdog when the tab hides; if still hidden when it fires, gracefully
    // brake and release all throttles while we still have a live socket.
    // Skipped in mock mode (no real JMRI to time out).
    if (!settings.mockEnabled) {
      onVisibilityChange = () => {
        if (document.hidden) {
          if (hiddenWatchdogId !== null) return
          if (connectionState.value !== ConnectionState.CONNECTED) return
          logger.info(`Tab hidden — scheduling preemptive brake in ${HIDDEN_BRAKE_WATCHDOG_MS}ms`)
          hiddenWatchdogId = setTimeout(handleHiddenWatchdogFire, HIDDEN_BRAKE_WATCHDOG_MS)
        } else {
          if (hiddenWatchdogId !== null) {
            clearTimeout(hiddenWatchdogId)
            hiddenWatchdogId = null
            logger.debug('Tab visible again — preemptive brake cancelled')
          }
          // If a brake is mid-flight, let it finish; aborting would leave
          // throttles in an intermediate state.
        }
      }
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    // In development, listen to Vite's HMR connection state
    if (import.meta.hot) {
      import.meta.hot.on('vite:ws:disconnect', () => {
        logger.warn('Vite dev server connection lost')
        isServerOnline.value = false
      })

      import.meta.hot.on('vite:ws:connect', () => {
        logger.info('Vite dev server connection restored')
        isServerOnline.value = true
      })
    }
  }

  /**
   * Set track power on/off, optionally targeting a specific system connection.
   * When prefix is provided, only throttles belonging to that connection are
   * released on power-off. When omitted, all throttles are released.
   */
  async function setPower(state: 'on' | 'off', prefix?: string) {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot set power: JMRI client not connected')
      return
    }

    try {
      const label = prefix !== undefined ? `[prefix="${prefix}"] ` : ''
      logger.info(`Setting ${label}power:`, state.toUpperCase())

      if (state === 'off') {
        const addresses = Array.from(jmriState.value.throttles.keys())
        const groups = currentSettings?.rosterGroups ?? []

        if (prefix === undefined) {
          // Global power-off: release everything
          for (const address of addresses) {
            await releaseThrottle(address)
          }
        } else {
          // Per-zone power-off: release throttles whose configured group's commandStation matches prefix.
          // Throttles not in any configured group belong to the default connection (prefix "").
          for (const address of addresses) {
            const group = groups.find(g => {
              const entries = groupedRosterEntries.value.get(g.name) ?? []
              return entries.some(e => e.address === address)
            })
            const addressPrefix = group?.commandStation ?? ''
            if (addressPrefix === prefix) await releaseThrottle(address)
          }
        }
      }

      const powerState = state === 'on' ? PowerState.ON : PowerState.OFF
      await jmriClient.setPower(powerState, prefix)

      if (commandStations.value.length > 0 && prefix !== undefined) {
        // JMRI doesn't reliably return named connection power via prefix queries,
        // so apply the state optimistically — the power:changed event confirming
        // the command is the source of truth.
        powerByPrefix.value = new Map(powerByPrefix.value).set(prefix, powerState)
        // Keep jmriState.power in sync when the default zone is toggled
        if (!prefix) jmriState.value.power = powerState
      } else {
        const actualState = await jmriClient.getPower()
        jmriState.value.power = actualState
        logger.info('Power state after setting:', actualState === PowerState.ON ? 'ON' : actualState === PowerState.OFF ? 'OFF' : 'UNKNOWN')
      }
    } catch (error) {
      logger.error('Failed to set power:', error)
      throw error
    }
  }

  /**
   * Set throttle speed
   */
  async function setThrottleSpeed(address: number, speed: number) {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot set throttle speed: JMRI client not connected')
      return
    }

    const throttleId = throttleIds.get(address)
    if (!throttleId) {
      logger.error(`No throttle acquired for address ${address}`)
      return
    }

    try {
      logger.debug(`Setting throttle ${address} speed to ${Math.round(speed * 100)}%`)
      await jmriClient.setThrottleSpeed(throttleId, speed)
    } catch (error) {
      logger.error('Failed to set throttle speed:', error)
      throw error
    }
  }

  /**
   * Set throttle direction
   */
  async function setThrottleDirection(address: number, direction: Direction) {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot set throttle direction: JMRI client not connected')
      return
    }

    const throttleId = throttleIds.get(address)
    if (!throttleId) {
      logger.error(`No throttle acquired for address ${address}`)
      return
    }

    try {
      logger.debug(`Setting throttle ${address} direction to ${direction ? 'FORWARD' : 'REVERSE'}`)
      await jmriClient.setThrottleDirection(throttleId, direction)

      // Mark direction as verified after successful command
      const throttle = jmriState.value.throttles.get(address)
      if (throttle) {
        jmriState.value.throttles.set(address, { ...throttle, directionVerified: true })
      }
    } catch (error) {
      logger.error('Failed to set throttle direction:', error)
      throw error
    }
  }

  /**
   * Set throttle function
   */
  async function setThrottleFunction(address: number, fn: number, state: boolean) {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot set throttle function: JMRI client not connected')
      return
    }

    const throttleId = throttleIds.get(address)
    if (!throttleId) {
      logger.error(`No throttle acquired for address ${address}`)
      return
    }

    try {
      logger.debug(`Setting throttle ${address} function F${fn} to ${state ? 'ON' : 'OFF'}`)
      await jmriClient.setThrottleFunction(throttleId, `F${fn}`, state)
    } catch (error) {
      logger.error('Failed to set throttle function:', error)
      throw error
    }
  }

  /**
   * Fetch roster from JMRI
   *
   * Note: JMRI servers return roster entries wrapped in {type, data, id} structure.
   * Mock mode will be fixed to match this format: https://github.com/yamanote1138/jmri-client/issues/21
   */
  async function fetchRoster() {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot fetch roster: JMRI client not connected')
      return
    }

    try {
      logger.info('Fetching roster from JMRI')
      const roster = await jmriClient.getRoster()

      // Process roster entries (don't acquire yet)
      for (const entry of roster) {
        // JMRI server wraps entries in {type: "rosterEntry", data: {...}, id: number} structure
        const entryData = entry.data

        const address = parseInt(entryData.address)

        const httpProtocol = currentSettings?.protocol === 'wss' ? 'https' : 'http'
        const { host, port, mockEnabled } = currentSettings ?? { host: '', port: 0, mockEnabled: false }

        let thumbnailUrl: string | undefined

        if (mockEnabled) {
          thumbnailUrl = `/locomotives/${entryData.name}.png`
        } else {
          thumbnailUrl = entryData.icon
            ? `${httpProtocol}://${host}:${port}${entryData.icon}`
            : entryData.name
            ? `${httpProtocol}://${host}:${port}/roster/${encodeURI(entryData.name)}/icon?maxHeight=200`
            : undefined
        }

        // Extract function keys from roster entry
        // JMRI v5.x returns functionKeys as an array: [{ name: "F0", label: "headlight", lockable: true, ... }]
        const rawFunctionKeys = entryData.functionKeys
        const functionKeys: Record<string, string> = {}

        if (Array.isArray(rawFunctionKeys)) {
          for (const fn of rawFunctionKeys) {
            if (fn.label && fn.name) {
              functionKeys[fn.name] = fn.label
            }
          }
        }

        // Always include F0 as Headlight if not defined
        if (!functionKeys.F0) {
          functionKeys.F0 = 'Headlight'
        }

        logger.debug(`Function keys for ${entryData.name}:`, functionKeys)

        const rosterEntry: RosterEntry = {
          address,
          name: entryData.name || `Loco ${address}`,
          road: entryData.road || '',
          number: entryData.number || '',
          thumbnailUrl,
          functionKeys
        }
        jmriState.value.roster.set(address, rosterEntry)
      }

      logger.info(`Loaded ${roster.length} locomotives from roster`)
    } catch (error) {
      logger.error('Failed to fetch roster:', error)
      throw error
    }
  }

  /**
   * Fetch roster groups from JMRI and populate roster + groupedRosterEntries
   */
  async function fetchRosterGroups() {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot fetch roster groups: JMRI client not connected')
      return
    }
    try {
      logger.info('Fetching roster groups from JMRI')
      const configuredNames = new Set(
        (currentSettings?.rosterGroups ?? []).map(g => g.name)
      )
      const allGroups = await jmriClient.getRosterGroups()
      const httpProtocol = currentSettings?.protocol === 'wss' ? 'https' : 'http'
      const { host, port, mockEnabled } = currentSettings ?? { host: '', port: 0, mockEnabled: false }

      for (const group of allGroups) {
        const entries = await jmriClient.getRosterEntriesByGroup(group.name)
        const parsedEntries: RosterEntry[] = []

        for (const entry of entries) {
          const entryData = entry.data
          const address = parseInt(entryData.address)
          let thumbnailUrl: string | undefined
          if (mockEnabled) {
            thumbnailUrl = `/locomotives/${entryData.name}.png`
          } else {
            thumbnailUrl = entryData.icon
              ? `${httpProtocol}://${host}:${port}${entryData.icon}`
              : entryData.name
              ? `${httpProtocol}://${host}:${port}/roster/${encodeURI(entryData.name)}/icon?maxHeight=200`
              : undefined
          }
          const rawFunctionKeys = entryData.functionKeys
          const functionKeys: Record<string, string> = {}
          if (Array.isArray(rawFunctionKeys)) {
            for (const fn of rawFunctionKeys) {
              if (fn.label && fn.name) functionKeys[fn.name] = fn.label
            }
          }
          if (!functionKeys.F0) functionKeys.F0 = 'Headlight'
          const rosterEntry: RosterEntry = {
            address,
            name: entryData.name || `Loco ${address}`,
            road: entryData.road || '',
            number: entryData.number || '',
            thumbnailUrl,
            functionKeys,
          }
          jmriState.value.roster.set(address, rosterEntry)
          parsedEntries.push(rosterEntry)
        }

        if (configuredNames.has(group.name)) {
          groupedRosterEntries.value.set(group.name, parsedEntries)
        }
      }
      logger.info(`Loaded ${allGroups.length} roster group(s) from JMRI`)
    } catch (error) {
      logger.error('Failed to fetch roster groups:', error)
      throw error
    }
  }

  /**
   * Fetch turnouts from JMRI
   */
  async function fetchTurnouts() {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot fetch turnouts: JMRI client not connected')
      return
    }

    try {
      logger.info('Fetching turnouts from JMRI')
      const turnouts = await jmriClient.listTurnouts()

      // Process turnout entries
      for (const turnout of turnouts) {
        const turnoutData = {
          name: turnout.name,
          userName: turnout.userName,
          state: turnout.state ?? 0, // Default to UNKNOWN
          inverted: turnout.inverted,
          comment: turnout.comment
        }
        jmriState.value.turnouts.set(turnout.name, turnoutData)
      }

      logger.info(`Loaded ${turnouts.length} turnouts from JMRI`)
    } catch (error) {
      logger.error('Failed to fetch turnouts:', error)
      throw error
    }
  }

  /**
   * Fetch lights from JMRI
   */
  async function fetchLights() {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot fetch lights: JMRI client not connected')
      return
    }

    try {
      logger.info('Fetching lights from JMRI')
      const lights = await jmriClient.listLights()

      for (const light of lights) {
        const lightData: LightData = {
          name: light.name,
          userName: light.userName,
          comment: light.comment ?? undefined,
          state: light.state ?? LightState.UNKNOWN
        }
        jmriState.value.lights.set(light.name, lightData)
      }

      logger.info(`Loaded ${lights.length} lights from JMRI`)
    } catch (error) {
      logger.error('Failed to fetch lights:', error)
      throw error
    }
  }

  /**
   * Toggle light state (ON <-> OFF)
   */
  async function toggleLight(name: string) {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot toggle light: JMRI client not connected')
      return
    }

    const light = jmriState.value.lights.get(name)
    if (!light) {
      logger.error(`No light found with name ${name}`)
      return
    }

    try {
      if (light.state === LightState.ON) {
        logger.info(`Turning off light ${name}`)
        await jmriClient.turnOffLight(name)
      } else {
        logger.info(`Turning on light ${name}`)
        await jmriClient.turnOnLight(name)
      }
    } catch (error) {
      logger.error(`Failed to toggle light ${name}:`, error)
      throw error
    }
  }

  /**
   * Acquire a throttle for control
   */
  async function acquireThrottle(address: number, prefix?: string) {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot acquire throttle: JMRI client not connected')
      return
    }

    // Create a synthetic roster entry for addresses not in the JMRI roster
    if (!jmriState.value.roster.has(address)) {
      logger.info(`No roster entry for address ${address} — creating synthetic entry`)
      jmriState.value.roster.set(address, {
        address,
        name: `Address ${address}`,
        road: '',
        number: '',
        functionKeys: {}
      })
    }

    const rosterEntry = jmriState.value.roster.get(address)!

    try {
      logger.info(`Acquiring throttle for ${rosterEntry.name} (address ${address}${prefix ? `, prefix ${prefix}` : ''})`)
      const throttleId = await jmriClient.acquireThrottle({ address, ...(prefix && { prefix }) })
      throttleIds.set(address, throttleId)
      logger.debug(`Acquired throttle ID: ${throttleId}`)

      // Initialize functions from roster entry's functionKeys
      const functions: Record<string, ThrottleFunction> = {}
      logger.debug(`Initializing functions for ${rosterEntry.name} with functionKeys:`, rosterEntry.functionKeys)
      if (rosterEntry.functionKeys) {
        for (const [key, label] of Object.entries(rosterEntry.functionKeys)) {
          functions[key] = {
            label,
            lockable: false,
            value: false
          }
          logger.debug(`  Added function ${key}: ${label}`)
        }
      }
      logger.debug(`Total functions initialized:`, Object.keys(functions).length)

      // Create throttle from roster entry
      const throttle: Throttle = {
        ...rosterEntry,
        speed: 0,
        direction: true, // Direction.FORWARD (default, unverified)
        directionVerified: false, // Will be verified when JMRI sends first update
        functions,
        acquiredAt: Date.now()
      }
      jmriState.value.throttles.set(address, throttle)

      // After a short yield, read any function states JMRI sent as unsolicited
      // updates following acquisition. jmri-client stores these in its internal
      // throttle cache via the throttle:updated event; we sync them into our state.
      setTimeout(() => {
        const clientState = jmriClient?.getThrottleState(throttleId)
        const fnMap = clientState?.functions
        if (!(fnMap instanceof Map) || fnMap.size === 0) return

        const currentThrottle = jmriState.value.throttles.get(address)
        if (!currentThrottle) return

        const updatedFunctions = { ...currentThrottle.functions }
        let anyUpdated = false
        for (const [key, value] of fnMap.entries()) {
          if (updatedFunctions[key]) {
            updatedFunctions[key] = { ...updatedFunctions[key], value: !!value }
            anyUpdated = true
          }
        }

        if (anyUpdated) {
          jmriState.value.throttles.set(address, { ...currentThrottle, functions: updatedFunctions })
          logger.debug(`Applied initial function states for ${rosterEntry.name}`)
        }
      }, 200)
    } catch (error) {
      logger.error(`Failed to acquire throttle for address ${address}:`, error)
      throw error
    }
  }

  /**
   * Set throttle to idle (speed to 0, maintain direction)
   */
  async function idleThrottle(address: number) {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot idle throttle: JMRI client not connected')
      return
    }

    const throttleId = throttleIds.get(address)
    if (!throttleId) {
      logger.error(`No throttle acquired for address ${address}`)
      return
    }

    try {
      logger.debug(`Setting throttle ${address} to idle`)
      await jmriClient.idleThrottle(throttleId)
    } catch (error) {
      logger.error('Failed to idle throttle:', error)
      throw error
    }
  }

  /**
   * Stop all acquired throttles (set speed to 0)
   */
  async function stopAllThrottles() {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot stop throttles: JMRI client not connected')
      return
    }

    try {
      logger.info('Stopping all throttles')
      const addresses = Array.from(jmriState.value.throttles.keys())
      for (const address of addresses) {
        const throttleId = throttleIds.get(address)
        if (throttleId) {
          await jmriClient.setThrottleSpeed(throttleId, 0)
        }
      }
      logger.info('All throttles stopped successfully')
    } catch (error) {
      logger.error('Failed to stop all throttles:', error)
      throw error
    }
  }

  /**
   * Release all acquired throttles
   */
  async function releaseAllThrottles() {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot release throttles: JMRI client not connected')
      return
    }

    try {
      logger.info('Releasing all throttles')
      await jmriClient.releaseAllThrottles()
      throttleIds.clear()
      jmriState.value.throttles.clear()
      logger.info('All throttles released successfully')
    } catch (error) {
      logger.error('Failed to release all throttles:', error)
      throw error
    }
  }

  /**
   * Ramp a throttle linearly from its current speed to 0, then release it.
   * If speed is already 0, releases immediately. Tolerant of errors mid-brake —
   * always proceeds to release the handle and clear local state. Never throws.
   * Returns the throttle's name and starting speed for caller toast composition,
   * or null if no such throttle was acquired.
   */
  async function brakeAndRelease(
    address: number
  ): Promise<{ name: string; brakedFrom: number } | null> {
    const throttleId = throttleIds.get(address)
    const throttle = jmriState.value.throttles.get(address)
    if (!throttleId || !throttle) return null

    const startSpeed = throttle.speed
    const name = throttle.name

    // Connection already gone: just clean up local state, no remote calls.
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.debug(`brakeAndRelease(${name}): connection already gone, cleaning local state only`)
      throttleIds.delete(address)
      jmriState.value.throttles.delete(address)
      return { name, brakedFrom: startSpeed }
    }

    if (startSpeed > 0.01) {
      const steps = Math.max(1, Math.ceil(BRAKE_RAMP_MS / BRAKE_STEP_MS))
      logger.info(`Braking ${name} from ${Math.round(startSpeed * 100)}% to 0 over ${BRAKE_RAMP_MS}ms`)
      for (let i = 1; i <= steps; i++) {
        if (connectionState.value !== ConnectionState.CONNECTED) break
        const t = i / steps
        const speed = Math.max(0, startSpeed * (1 - t))
        try {
          await jmriClient.setThrottleSpeed(throttleId, speed)
        } catch (err) {
          logger.warn(`brakeAndRelease: setThrottleSpeed failed mid-brake for ${name}:`, err)
          break
        }
        if (i < steps) await new Promise(r => setTimeout(r, BRAKE_STEP_MS))
      }
    }

    try {
      if (jmriClient && connectionState.value === ConnectionState.CONNECTED) {
        await jmriClient.setThrottleSpeed(throttleId, 0)
        logger.info(`Releasing throttle for ${name}`)
        await jmriClient.releaseThrottle(throttleId)
      }
    } catch (err) {
      logger.warn(`brakeAndRelease: release failed for ${name} (socket likely gone):`, err)
    } finally {
      throttleIds.delete(address)
      jmriState.value.throttles.delete(address)
    }

    return { name, brakedFrom: startSpeed }
  }

  /**
   * Release a throttle. Delegates to brakeAndRelease so locomotives at speed
   * decelerate gracefully rather than slamming to 0.
   */
  async function releaseThrottle(address: number) {
    if (!throttleIds.has(address)) {
      logger.error(`No throttle acquired for address ${address}`)
      return
    }
    await brakeAndRelease(address)
  }

  /**
   * Watchdog fire: tab has been hidden long enough that JMRI's idle timeout is
   * imminent. Brake and release all acquired throttles while we still have a
   * live socket, then emit a preemptive-release event for the UI to toast.
   */
  async function handleHiddenWatchdogFire() {
    hiddenWatchdogId = null
    if (!document.hidden) return
    if (connectionState.value !== ConnectionState.CONNECTED) return
    if (preemptiveReleaseInFlight) return
    if (jmriState.value.throttles.size === 0) return

    preemptiveReleaseInFlight = true
    try {
      const snapshot = Array.from(jmriState.value.throttles.values()).map(t => ({
        address: t.address,
        name: t.name,
      }))
      preemptiveReleaseLastNames = snapshot.map(s => s.name)
      logger.info(`Preemptive brake firing for ${snapshot.length} throttle(s): ${preemptiveReleaseLastNames.join(', ')}`)

      // Sequential, not parallel — JMRI processes one message at a time and we
      // want predictable, observable braking.
      for (const { address } of snapshot) {
        await brakeAndRelease(address)
      }

      emitJmriEvent({ kind: 'preemptive-release', names: preemptiveReleaseLastNames })
    } finally {
      preemptiveReleaseInFlight = false
    }
  }

  /**
   * Set turnout to CLOSED (straight through)
   */
  async function closeTurnout(name: string) {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot close turnout: JMRI client not connected')
      return
    }

    try {
      logger.info(`Closing turnout ${name}`)
      await jmriClient.closeTurnout(name)
    } catch (error) {
      logger.error(`Failed to close turnout ${name}:`, error)
      throw error
    }
  }

  /**
   * Set turnout to THROWN (diverging route)
   */
  async function throwTurnout(name: string) {
    if (!jmriClient || connectionState.value !== ConnectionState.CONNECTED) {
      logger.error('Cannot throw turnout: JMRI client not connected')
      return
    }

    try {
      logger.info(`Throwing turnout ${name}`)
      await jmriClient.throwTurnout(name)
    } catch (error) {
      logger.error(`Failed to throw turnout ${name}:`, error)
      throw error
    }
  }

  /**
   * Toggle turnout state (CLOSED <-> THROWN)
   */
  async function toggleTurnout(name: string) {
    const turnout = jmriState.value.turnouts.get(name)
    if (!turnout) {
      logger.error(`No turnout found with name ${name}`)
      return
    }

    if (turnout.state === 2) { // TurnoutState.CLOSED
      await throwTurnout(name)
    } else {
      await closeTurnout(name)
    }
  }

  async function applyCommandStationsConfig(config: CommandStationsConfig | undefined): Promise<void> {
    commandStations.value = await resolveCommandStations(config)
    if (commandStations.value.length > 0) {
      logger.info(`Command stations updated: ${commandStations.value.map(z => `"${z.name}" (prefix="${z.prefix}")`).join(', ')}`)
      if (jmriClient) await refreshAllZonePower()
    }
  }

  /**
   * Disconnect from JMRI and clean up
   */
  function disconnect() {
    if (!jmriClient) {
      return
    }

    logger.info('Disconnecting from JMRI')

    try {
      jmriClient.disconnect()
    } catch (error) {
      logger.error('Error during disconnect:', error)
    }

    // Remove DOM listeners so they don't leak across reconnect cycles.
    if (onVisibilityChange) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      onVisibilityChange = null
    }
    if (onBrowserOnline) {
      window.removeEventListener('online', onBrowserOnline)
      onBrowserOnline = null
    }
    if (onBrowserOffline) {
      window.removeEventListener('offline', onBrowserOffline)
      onBrowserOffline = null
    }
    if (hiddenWatchdogId !== null) {
      clearTimeout(hiddenWatchdogId)
      hiddenWatchdogId = null
    }
    preemptiveReleaseInFlight = false
    preemptiveReleaseLastNames = []

    jmriClient = null
    currentSettings = null
    connectionState.value = ConnectionState.DISCONNECTED
    throttleIds.clear()
    jmriState.value.throttles.clear()
    jmriState.value.roster.clear()
    jmriState.value.turnouts.clear()
    jmriState.value.lights.clear()
    groupedRosterEntries.value.clear()
    jmriState.value.power = 0
    railroadName.value = 'Model Railroad'
    jmriVersion.value = ''
    commandStations.value = []
    powerByPrefix.value = new Map()
  }

  return {
    // State
    jmriState,
    connectionState,
    isServerOnline,
    railroadName,
    jmriVersion,
    commandStations,
    powerByPrefix,
    lastEvent,

    // Computed
    isConnected: computed(() => connectionState.value === ConnectionState.CONNECTED),
    isMockMode: computed(() => currentSettings?.mockEnabled ?? false),
    ungroupedRoster: computed(() => {
      const groupedAddresses = new Set(
        [...groupedRosterEntries.value.values()].flatMap(entries => entries.map(e => e.address))
      )
      return Array.from(jmriState.value.roster.values())
        .filter(e => !groupedAddresses.has(e.address))
    }),
    groupedRoster: computed<{ name: string; entries: RosterEntry[] }[]>(() =>
      (currentSettings?.rosterGroups ?? []).map(group => ({
        name: group.name,
        entries: groupedRosterEntries.value.get(group.name) ?? [],
      }))
    ),
    throttles: computed(() => Array.from(jmriState.value.throttles.values())),
    turnouts: computed(() => Array.from(jmriState.value.turnouts.values())),
    lights: computed(() => Array.from(jmriState.value.lights.values())),
    power: computed(() => jmriState.value.power),
    // Methods
    initialize,
    disconnect,
    applyCommandStationsConfig,
    setPower,
    setThrottleSpeed,
    setThrottleDirection,
    setThrottleFunction,
    fetchRoster,
    fetchRosterGroups,
    fetchTurnouts,
    fetchLights,
    toggleLight,
    acquireThrottle,
    idleThrottle,
    releaseThrottle,
    stopAllThrottles,
    releaseAllThrottles,
    closeTurnout,
    throwTurnout,
    toggleTurnout
  }
}
