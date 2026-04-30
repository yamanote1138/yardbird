// ── Layout / YAML config ─────────────────────────────────────────────────────

export interface JmriPluginConfig {
  host: string
  port: number
  secure?: boolean
  mock?: boolean
  tramPrefix?: string  // System connection prefix for tram (DC) throttles, e.g. 'D' for DCC++
  tramPwmFreq?: number // DC PWM frequency on acquire: 0=131Hz, 1=490Hz, 2=3.4kHz, 3=Supersonic (default)
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
    homeassistant?: HomeAssistantPluginConfig
  }
  tabs: TabConfig[]
}

