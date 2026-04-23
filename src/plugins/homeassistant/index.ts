import { ref, computed } from 'vue'
import { logger } from '@/utils/logger'
import type { HaEntity, HaEntityState, HaConnectionState } from '@/types/homeAssistant'

// Module-scope singleton state
let ws: WebSocket | null = null
let wsUrl: string | null = null
let accessToken: string | null = null
let filterAreaId: string | null = null
let nextMsgId = 1
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let entitySubscriptionId: number | null = null

const pendingRequests = new Map<number, { resolve: (data: any) => void; reject: (err: any) => void }>()

const connectionState = ref<HaConnectionState>('disconnected')
const entities = ref(new Map<string, HaEntity>())
const lastError = ref('')

function send(payload: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const json = JSON.stringify(payload)
    logger.debug(`[HA] >>> ${json}`)
    ws.send(json)
  } else {
    logger.warn('[HA] Cannot send — WebSocket not open')
  }
}

function sendRequest<T = any>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = nextMsgId++
    pendingRequests.set(id, { resolve, reject })
    send({ ...payload, id })
  })
}

function stateToEntity(raw: HaEntityState): HaEntity | null {
  const domain = raw.entity_id.split('.')[0]
  if (domain !== 'light' && domain !== 'switch') return null

  return {
    entityId: raw.entity_id,
    domain: domain as 'light' | 'switch',
    friendlyName: raw.attributes.friendly_name ?? raw.entity_id,
    state: (raw.state === 'on' || raw.state === 'off') ? raw.state : 'unavailable',
    brightness: domain === 'light' ? raw.attributes.brightness : undefined,
  }
}

async function onAuthenticated(): Promise<void> {
  try {
    const areas: Array<{ area_id: string; name: string }> =
      await sendRequest({ type: 'config/area_registry/list' })
    logger.info('[HA] Areas:', areas.map(a => `${a.name} (${a.area_id})`).join(', '))

    const [entityRegistry, deviceRegistry] = await Promise.all([
      sendRequest<Array<{ entity_id: string; area_id: string | null; device_id: string | null }>>(
        { type: 'config/entity_registry/list' }
      ),
      sendRequest<Array<{ id: string; area_id: string | null }>>(
        { type: 'config/device_registry/list' }
      ),
    ])

    // Devices in our target area
    const areaDeviceIds = new Set(
      deviceRegistry.filter(d => d.area_id === filterAreaId).map(d => d.id)
    )
    logger.info(`[HA] ${areaDeviceIds.size} devices in area "${filterAreaId}"`)

    // Entities belong to the area if they have area_id directly,
    // OR if their parent device is in the area (and entity has no override)
    const areaEntityIds = new Set(
      entityRegistry
        .filter(e =>
          e.area_id === filterAreaId ||
          (e.area_id === null && e.device_id !== null && areaDeviceIds.has(e.device_id))
        )
        .map(e => e.entity_id)
    )
    logger.info(`[HA] ${areaEntityIds.size} entities in area "${filterAreaId}"`)

    const states: HaEntityState[] = await sendRequest({ type: 'get_states' })

    const newEntities = new Map<string, HaEntity>()
    for (const state of states) {
      if (areaEntityIds.has(state.entity_id)) {
        const entity = stateToEntity(state)
        if (entity) {
          newEntities.set(state.entity_id, entity)
        }
      }
    }
    entities.value = newEntities
    logger.info(`[HA] Loaded ${entities.value.size} room entities`)

    const subId = nextMsgId++
    entitySubscriptionId = subId
    pendingRequests.set(subId, {
      resolve: () => logger.info('[HA] Subscribed to state_changed'),
      reject: (e) => logger.error('[HA] Subscription failed:', e),
    })
    send({ id: subId, type: 'subscribe_events', event_type: 'state_changed' })
  } catch (error: any) {
    logger.error('[HA] Initialization failed:', error)
    lastError.value = error.message ?? 'Initialization failed'
  }
}

function handleStateChanged(data: { entity_id: string; new_state: HaEntityState | null }): void {
  if (!data?.entity_id) return
  const { entity_id, new_state } = data

  if (!entities.value.has(entity_id)) return

  if (!new_state) {
    const next = new Map(entities.value)
    next.delete(entity_id)
    entities.value = next
    return
  }

  const updated = stateToEntity(new_state)
  if (updated) {
    const next = new Map(entities.value)
    next.set(entity_id, updated)
    entities.value = next
  }
}

function handleMessage(raw: string): void {
  let msg: any
  try {
    msg = JSON.parse(raw)
  } catch {
    logger.warn('[HA] Unparseable message:', raw)
    return
  }

  logger.debug('[HA] <<<', msg.type, msg.id ?? '')

  switch (msg.type) {
    case 'auth_required':
      connectionState.value = 'connecting'
      send({ type: 'auth', access_token: accessToken })
      break

    case 'auth_ok':
      logger.info('[HA] Authenticated')
      connectionState.value = 'connected'
      lastError.value = ''
      onAuthenticated()
      break

    case 'auth_invalid':
      logger.error('[HA] Authentication failed:', msg.message)
      lastError.value = `Authentication failed: ${msg.message}`
      connectionState.value = 'error'
      ws?.close()
      break

    case 'result': {
      const pending = pendingRequests.get(msg.id)
      if (pending) {
        pendingRequests.delete(msg.id)
        if (msg.success) {
          pending.resolve(msg.result)
        } else {
          logger.error('[HA] Request failed:', msg.error)
          pending.reject(new Error(msg.error?.message ?? 'HA request failed'))
        }
      }
      break
    }

    case 'event':
      if (msg.id === entitySubscriptionId) {
        handleStateChanged(msg.event?.data)
      }
      break
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  if (!wsUrl || !accessToken) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (wsUrl && accessToken && filterAreaId && connectionState.value === 'disconnected') {
      logger.info('[HA] Attempting reconnect...')
      connectWs(wsUrl, accessToken, filterAreaId)
    }
  }, 5000)
}

function connectWs(url: string, token: string, areaId: string): void {
  wsUrl = url
  accessToken = token
  filterAreaId = areaId
  connectionState.value = 'connecting'
  entities.value = new Map()
  entitySubscriptionId = null
  nextMsgId = 1
  pendingRequests.clear()

  ws = new WebSocket(url)

  ws.onopen = () => {
    logger.info('[HA] WebSocket connected, awaiting auth_required...')
  }

  ws.onmessage = (event) => {
    handleMessage(event.data as string)
  }

  ws.onclose = () => {
    logger.info('[HA] WebSocket disconnected')
    if (connectionState.value !== 'error') {
      connectionState.value = 'disconnected'
    }
    entitySubscriptionId = null
    scheduleReconnect()
  }

  ws.onerror = (event) => {
    logger.error('[HA] WebSocket error:', event)
  }
}

// Public API
export function useHomeAssistant() {
  function connect(url: string, token: string, areaId: string): void {
    disconnect()
    connectWs(url, token, areaId)
  }

  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    wsUrl = null
    accessToken = null
    filterAreaId = null
    pendingRequests.clear()
    entitySubscriptionId = null
    if (ws) {
      ws.onclose = null
      ws.close()
      ws = null
    }
    connectionState.value = 'disconnected'
    entities.value = new Map()
    lastError.value = ''
  }

  async function toggleEntity(entityId: string): Promise<void> {
    const entity = entities.value.get(entityId)
    if (!entity) return
    await sendRequest({
      type: 'call_service',
      domain: entity.domain,
      service: 'toggle',
      target: { entity_id: entityId },
    })
  }

  async function setBrightness(entityId: string, brightness: number): Promise<void> {
    if (connectionState.value !== 'connected') return
    await sendRequest({
      type: 'call_service',
      domain: 'light',
      service: 'turn_on',
      target: { entity_id: entityId },
      service_data: { brightness },
    })
  }

  return {
    connectionState: computed(() => connectionState.value),
    isConnected: computed(() => connectionState.value === 'connected'),
    lastError: computed(() => lastError.value),
    lights: computed(() =>
      Array.from(entities.value.values())
        .filter(e => e.domain === 'light')
        .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))
    ),
    switches: computed(() =>
      Array.from(entities.value.values())
        .filter(e => e.domain === 'switch')
        .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName))
    ),
    connect,
    disconnect,
    toggleEntity,
    setBrightness,
  }
}
