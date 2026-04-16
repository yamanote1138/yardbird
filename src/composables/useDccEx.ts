/**
 * DCC-EX direct connection via WiThrottle protocol over WebSocket.
 *
 * Bypasses JMRI entirely for tram throttle control — connects to DCC-EX
 * EX-CommandStation through a lightweight WebSocket-to-TCP proxy.
 *
 * WiThrottle protocol: text-based, newline-delimited messages.
 * Multi-throttle commands use the "T" throttle group (MT prefix).
 */

import { ref, computed } from 'vue'
import { logger } from '@/utils/logger'

export interface DccExThrottle {
  address: number
  isLong: boolean
  speed: number        // 0-126 WiThrottle scale
  forward: boolean
  acquired: boolean
}

export interface DccExRosterEntry {
  name: string
  address: number
  isLong: boolean
}

// Module-scope singleton state
let ws: WebSocket | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let heartbeatInterval = 10 // seconds, updated by server
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let handshakeTimer: ReturnType<typeof setTimeout> | null = null
let wsUrl: string | null = null

const HANDSHAKE_TIMEOUT = 5000

type DccExConnectionState = 'disconnected' | 'connecting' | 'connected'
const connectionState = ref<DccExConnectionState>('disconnected')
const powerState = ref<'on' | 'off' | 'unknown'>('unknown')
const throttles = ref(new Map<number, DccExThrottle>())
const roster = ref<DccExRosterEntry[]>([])

function addrKey(address: number, isLong: boolean): string {
  return `${isLong ? 'L' : 'S'}${address}`
}

function send(msg: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    logger.debug(`[DCC-EX] >>> ${msg}`)
    ws.send(msg + '\n')
  }
}

/**
 * Parse incoming WiThrottle messages from DCC-EX.
 */
function handleMessage(raw: string): void {
  const lines = raw.split('\n').filter(l => l.trim())
  for (const line of lines) {
    logger.debug(`[DCC-EX] <<< ${line}`)

    // WiThrottle power state: PPA0 (off) / PPA1 (on)
    if (line.startsWith('PPA')) {
      const state = line.charAt(3)
      powerState.value = state === '1' ? 'on' : state === '0' ? 'off' : 'unknown'
      continue
    }

    // Native power responses: <p1> (on) / <p0> (off) / <p1 A> / <p0 B> etc.
    if (line.startsWith('<p')) {
      const state = line.charAt(2)
      // Only update from the aggregate response <p1> / <p0> (no track letter)
      if (state === '1' && (line === '<p1>' || line.startsWith('<p1>'))) {
        powerState.value = 'on'
      } else if (state === '0' && (line === '<p0>' || line.startsWith('<p0>'))) {
        powerState.value = 'off'
      }
      continue
    }

    // Heartbeat interval: *N (seconds)
    if (line.startsWith('*') && line.length > 1 && !line.startsWith('**')) {
      const interval = parseInt(line.substring(1))
      if (!isNaN(interval) && interval > 0) {
        heartbeatInterval = interval
        startHeartbeat()
      }
      continue
    }

    // Roster list: RL{count}]\[{name}}|{{addr}}|{{S|L}]\[...
    // Roster entries exist regardless of power state — don't infer power from count
    if (line.startsWith('RL')) {
      parseRoster(line)
      continue
    }

    // Throttle acquired: MT+S30<;> or MT+L30<;>
    if (line.startsWith('MT+')) {
      const addr = parseThrottleAddr(line.substring(3))
      if (addr) {
        const existing = throttles.value.get(addr.address)
        if (existing) {
          existing.acquired = true
        } else {
          throttles.value.set(addr.address, {
            address: addr.address,
            isLong: addr.isLong,
            speed: 0,
            forward: true,
            acquired: true
          })
        }
        // Trigger reactivity
        throttles.value = new Map(throttles.value)
      }
      continue
    }

    // Throttle released: MT-S30<;>
    if (line.startsWith('MT-')) {
      const addr = parseThrottleAddr(line.substring(3))
      if (addr) {
        throttles.value.delete(addr.address)
        throttles.value = new Map(throttles.value)
      }
      continue
    }

    // Throttle updates: MTAS30<;>V50, MTAS30<;>R1, MTAS30<;>F01, etc.
    if (line.startsWith('MTA')) {
      parseThrottleUpdate(line.substring(3))
      continue
    }

    // DCC-EX hello message — marks server ready (e.g. "HMConnecting..")
    if (line.startsWith('HM')) {
      logger.info('[DCC-EX] Server ready:', line)
      if (handshakeTimer) {
        clearTimeout(handshakeTimer)
        handshakeTimer = null
      }
      connectionState.value = 'connected'
      // Query actual power state — WiThrottle PPA in the greeting can be
      // stale/wrong. Native <s> returns the true state for all tracks.
      send('<s>')
      continue
    }

    // Server info (ignored but logged)
    if (line.startsWith('VN') || line.startsWith('HT') || line.startsWith('Ht') ||
        line.startsWith('PT') || line.startsWith('PR')) {
      continue
    }
  }
}

function parseThrottleAddr(segment: string): { address: number, isLong: boolean } | null {
  // Format: S30<;>... or L30<;>...
  const sepIdx = segment.indexOf('<;>')
  const addrStr = sepIdx >= 0 ? segment.substring(0, sepIdx) : segment
  if (addrStr.length < 2) return null
  const isLong = addrStr.charAt(0) === 'L'
  const address = parseInt(addrStr.substring(1))
  if (isNaN(address)) return null
  return { address, isLong }
}

function parseThrottleUpdate(segment: string): void {
  // Format: S30<;>V50 or *<;>V50
  const sepIdx = segment.indexOf('<;>')
  if (sepIdx < 0) return

  const addrPart = segment.substring(0, sepIdx)
  const valuePart = segment.substring(sepIdx + 3)

  // Find which throttle this applies to
  let throttle: DccExThrottle | undefined
  if (addrPart === '*') {
    // Broadcast to all throttles — typically only one active
    const entries = [...throttles.value.values()]
    if (entries.length === 1) {
      throttle = entries[0]
    }
  } else {
    const addr = parseThrottleAddr(addrPart + '<;>')
    if (addr) {
      throttle = throttles.value.get(addr.address)
    }
  }

  if (!throttle) return

  const cmd = valuePart.charAt(0)
  const val = valuePart.substring(1)

  switch (cmd) {
    case 'V': { // Speed
      const speed = parseInt(val)
      if (!isNaN(speed)) throttle.speed = speed
      break
    }
    case 'R': { // Direction: 1=forward, 0=reverse
      throttle.forward = val === '1'
      break
    }
    case 's': { // Speed steps mode (ignore)
      break
    }
    case 'F': { // Function (ignore for trams)
      break
    }
  }

  // Trigger reactivity
  throttles.value = new Map(throttles.value)
}

function parseRoster(line: string): void {
  // RL2]\[DC TRACK A}|{30}|{S]\[DC TRACK B}|{31}|{S
  const entries: DccExRosterEntry[] = []
  const parts = line.split(']\\[').slice(1) // Skip "RL2" prefix
  for (const part of parts) {
    const fields = part.split('}|{')
    if (fields.length >= 3) {
      const name = fields[0]
      const address = parseInt(fields[1])
      const isLong = fields[2].replace(']', '').trim() === 'L'
      if (!isNaN(address)) {
        entries.push({ name, address, isLong })
      }
    }
  }
  roster.value = entries
}

function startHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  // Send heartbeat at half the server's interval to stay well within the timeout
  heartbeatTimer = setInterval(() => send('*'), (heartbeatInterval * 1000) / 2)
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (wsUrl && connectionState.value === 'disconnected') {
      logger.info('[DCC-EX] Attempting reconnect...')
      connectWs(wsUrl)
    }
  }, 3000)
}

function connectWs(url: string): void {
  wsUrl = url
  connectionState.value = 'connecting'
  ws = new WebSocket(url)

  ws.onopen = () => {
    logger.info('[DCC-EX] WebSocket connected, sending handshake...')
    send('NTrains-TOTI')
    send('HUtoti-' + Date.now().toString(36))

    // Timeout if DCC-EX doesn't complete the handshake
    if (handshakeTimer) clearTimeout(handshakeTimer)
    handshakeTimer = setTimeout(() => {
      handshakeTimer = null
      if (connectionState.value === 'connecting') {
        logger.warn('[DCC-EX] Handshake timeout — closing and retrying')
        ws?.close()
      }
    }, HANDSHAKE_TIMEOUT)
  }

  ws.onmessage = (event) => {
    handleMessage(event.data as string)
  }

  ws.onclose = () => {
    logger.info('[DCC-EX] WebSocket disconnected')
    if (handshakeTimer) {
      clearTimeout(handshakeTimer)
      handshakeTimer = null
    }
    connectionState.value = 'disconnected'
    powerState.value = 'unknown'
    stopHeartbeat()
    scheduleReconnect()
  }

  ws.onerror = (event) => {
    logger.error('[DCC-EX] WebSocket error:', event)
  }
}

// Public API
export function useDccEx() {
  function connect(url: string): void {
    disconnect()
    connectWs(url)
  }

  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (handshakeTimer) {
      clearTimeout(handshakeTimer)
      handshakeTimer = null
    }
    wsUrl = null
    stopHeartbeat()
    if (ws) {
      ws.onclose = null // prevent reconnect
      ws.close()
      ws = null
    }
    connectionState.value = 'disconnected'
    powerState.value = 'unknown'
    throttles.value = new Map()
    roster.value = []
  }

  function retry(): void {
    if (!wsUrl) return
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (handshakeTimer) {
      clearTimeout(handshakeTimer)
      handshakeTimer = null
    }
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
    stopHeartbeat()
    connectWs(wsUrl)
  }

  function setPower(on: boolean): void {
    // Use native DCC-EX commands — WiThrottle PPA only controls MAIN tracks,
    // but DC tram tracks need native <1>/<0> which controls ALL tracks
    send(on ? '<1>' : '<0>')
  }

  function acquireThrottle(address: number, isLong = false): void {
    const key = addrKey(address, isLong)
    send(`MT+${key}<;>${key}`)
  }

  function releaseThrottle(address: number, isLong = false): void {
    const key = addrKey(address, isLong)
    send(`MT-${key}<;>${key}`)
  }

  function setSpeed(address: number, speed: number): void {
    const key = addrKey(address, throttles.value.get(address)?.isLong ?? false)
    const clamped = Math.max(0, Math.min(126, Math.round(speed)))
    send(`MTA${key}<;>V${clamped}`)
  }

  function setDirection(address: number, forward: boolean): void {
    const key = addrKey(address, throttles.value.get(address)?.isLong ?? false)
    send(`MTA${key}<;>R${forward ? 1 : 0}`)
  }

  function eStop(address: number): void {
    const key = addrKey(address, throttles.value.get(address)?.isLong ?? false)
    send(`MTA${key}<;>X`)
  }

  function setPwmFrequency(address: number, freqIndex: number): void {
    const clamped = Math.max(0, Math.min(3, Math.floor(freqIndex)))
    send(`<F ${address} DCFREQ ${clamped}>`)
    logger.info(`[DCC-EX] Set PWM frequency for address ${address} to index ${clamped}`)
  }

  return {
    // State
    isConnected: computed(() => connectionState.value === 'connected'),
    connectionState: computed(() => connectionState.value),
    powerState: computed(() => powerState.value),
    throttles: computed(() => throttles.value),
    roster: computed(() => roster.value),

    // Methods
    connect,
    disconnect,
    retry,
    setPower,
    acquireThrottle,
    releaseThrottle,
    setSpeed,
    setDirection,
    eStop,
    setPwmFrequency,
  }
}
