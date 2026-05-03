// ── Layout / YAML config ─────────────────────────────────────────────────────

export interface CommandStation {
  name: string
  prefix: string  // empty string = default JMRI connection
}

// commandStations in YAML can be:
//   - CommandStation[]          → use these explicit stations
//   - { discover: true }        → auto-discover via getSystemConnections()
//   - missing / { discover: false } → single default power button (fallback)
export type CommandStationsConfig = CommandStation[] | { discover: boolean }

export interface JmriPluginConfig {
  host: string
  port: number
  secure?: boolean
  mock?: boolean
  tramPrefix?: string  // kept for legacy PWM power-zone routing; not used for throttle acquisition
  tramPwmFreq?: number
  commandStations?: CommandStationsConfig
}

export interface HomeAssistantPluginConfig {
  enabled?: boolean
  url: string
  token: string
  area: string
}

// ── Widget / Dashboard types ──────────────────────────────────────────────────

export type WidgetType =
  | 'jmri-power'
  | 'jmri-throttle'
  | 'jmri-turnout'
  | 'jmri-light'
  | 'ha-entity'

export interface WidgetGridPos {
  x: number
  y: number
  w: number
  h: number
}

export interface WidgetInstance {
  id: string                         // crypto.randomUUID()
  type: WidgetType
  grid: WidgetGridPos
  config: Record<string, unknown>    // widget-specific: address, entityId, prefix, label, etc.
}

export interface TabConfig {
  id: string
  name: string
  icon: string
  widgets: WidgetInstance[]
}

// ── Stored / active config ────────────────────────────────────────────────────

export interface StoredConfig {
  version: 1
  debug?: boolean
  connections: {
    jmri?: JmriPluginConfig
    homeassistant?: HomeAssistantPluginConfig
  }
  tabs: TabConfig[]
}

// ── Legacy YAML config (used only by useLayout.ts as fallback source) ─────────

export interface LayoutConfig {
  debug?: boolean
  plugins: {
    jmri: JmriPluginConfig
    homeassistant?: HomeAssistantPluginConfig
  }
  tabs: Array<{ id: string; name: string; icon: string }>
}

