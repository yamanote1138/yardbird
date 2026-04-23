// ── Layout / YAML config ─────────────────────────────────────────────────────

export interface JmriPluginConfig {
  host: string
  port: number
  secure?: boolean
  mock?: boolean
}

export interface DccExPluginConfig {
  enabled?: boolean
  host: string
  port: number
  pwmFreq?: number
}

export interface HomeAssistantPluginConfig {
  enabled?: boolean
  url: string
  token: string
  area: string
}

export interface TabConfig {
  id: string
  name: string
  icon: string
}

export interface LayoutConfig {
  debug?: boolean
  plugins: {
    jmri: JmriPluginConfig
    dccex?: DccExPluginConfig
    homeassistant?: HomeAssistantPluginConfig
  }
  tabs: TabConfig[]
}

