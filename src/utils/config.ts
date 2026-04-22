export interface YardbirdConfig {
  jmriHost: string
  jmriPort: number
  jmriSecure: boolean
  mock: boolean
  debug: boolean
  dccexEnabled: boolean
  dccexHost: string
  dccexPort: number
  dccexPwmFreq: number
  haEnabled: boolean
  haUrl: string
  haToken: string
  haArea: string
}

declare global {
  interface Window {
    __YB_CONFIG__?: Partial<YardbirdConfig>
  }
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return value === 'true' || value === '1'
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  return isNaN(n) ? fallback : n
}

let _config: YardbirdConfig | null = null

export function getConfig(): YardbirdConfig {
  if (_config) return _config

  const runtime = window.__YB_CONFIG__ ?? {}
  const env = import.meta.env

  const jmriHost = runtime.jmriHost
    ?? env.VITE_YB_JMRI_HOST
    ?? 'raspi-jmri.local'

  _config = {
    jmriHost,
    jmriPort: runtime.jmriPort
      ?? parseNumber(env.VITE_YB_JMRI_PORT, 12080),
    jmriSecure: runtime.jmriSecure
      ?? parseBool(env.VITE_YB_JMRI_SECURE, false),
    mock: runtime.mock
      ?? parseBool(env.VITE_YB_MOCK, false),
    debug: runtime.debug
      ?? parseBool(env.VITE_YB_DEBUG, false),
    dccexEnabled: runtime.dccexEnabled
      ?? parseBool(env.VITE_YB_DCCEX_ENABLED, false),
    dccexHost: runtime.dccexHost
      ?? env.VITE_YB_DCCEX_HOST
      ?? jmriHost,
    dccexPort: runtime.dccexPort
      ?? parseNumber(env.VITE_YB_DCCEX_PORT, 2561),
    dccexPwmFreq: runtime.dccexPwmFreq
      ?? parseNumber(env.VITE_YB_DCCEX_PWM_FREQ, 3),
    haEnabled: runtime.haEnabled
      ?? parseBool(env.VITE_YB_HA_ENABLED, false),
    haUrl: runtime.haUrl
      ?? env.VITE_YB_HA_URL
      ?? 'ws://homeassistant.local:8123/api/websocket',
    haToken: runtime.haToken
      ?? env.VITE_YB_HA_TOKEN
      ?? '',
    haArea: runtime.haArea
      ?? env.VITE_YB_HA_AREA
      ?? '',
  }

  return _config
}
