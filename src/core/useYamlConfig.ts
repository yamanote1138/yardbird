import yaml from 'js-yaml'
import type {
  StoredConfig, TabConfig, JmriPluginConfig, HomeAssistantPluginConfig,
  CommandStationsConfig, RosterGroupConfig,
} from './types'

// Sanitize raw parsed data (from localStorage or YAML import) into a valid StoredConfig.
// Returns null if the data is fatally unusable (not an object, wrong version, missing jmri host).
export function sanitize(raw: unknown): StoredConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  if (r.version !== 1) return null

  const connections = r.connections
  if (!connections || typeof connections !== 'object' || Array.isArray(connections)) return null
  const conn = connections as Record<string, unknown>

  const rawJmri = conn.jmri
  if (!rawJmri || typeof rawJmri !== 'object' || Array.isArray(rawJmri)) return null
  const rj = rawJmri as Record<string, unknown>

  if (typeof rj.host !== 'string' || !rj.host) return null

  const jmri: JmriPluginConfig = {
    host: rj.host,
    port: typeof rj.port === 'number' ? rj.port : 12080,
    ...(typeof rj.secure === 'boolean' && { secure: rj.secure }),
    ...(typeof rj.mock === 'boolean' && { mock: rj.mock }),
    ...(typeof rj.tramPwmFreq === 'number' && { tramPwmFreq: rj.tramPwmFreq }),
    ...(Array.isArray(rj.commandStations) && { commandStations: rj.commandStations as CommandStationsConfig }),
    ...(Array.isArray(rj.rosterGroups) && { rosterGroups: rj.rosterGroups as RosterGroupConfig[] }),
    // tramPrefix intentionally omitted — deprecated, silently dropped
  }

  let homeassistant: HomeAssistantPluginConfig | undefined
  const rawHa = conn.homeassistant
  if (rawHa && typeof rawHa === 'object' && !Array.isArray(rawHa)) {
    const rh = rawHa as Record<string, unknown>
    homeassistant = {
      url:   typeof rh.url   === 'string' ? rh.url   : '',
      token: typeof rh.token === 'string' ? rh.token : '',
      area:  typeof rh.area  === 'string' ? rh.area  : '',
      ...(typeof rh.enabled === 'boolean' && { enabled: rh.enabled }),
      ...(typeof rh.mock    === 'boolean' && { mock:    rh.mock }),
    }
  }

  const tabs: TabConfig[] = Array.isArray(r.tabs)
    ? (r.tabs as unknown[]).filter(
        (t): t is TabConfig =>
          !!t && typeof t === 'object' && typeof (t as TabConfig).id === 'string'
      )
    : []

  return {
    version:     1,
    ...(typeof r.debug === 'boolean' && { debug: r.debug }),
    connections: { jmri, homeassistant },
    tabs,
  }
}

// Parse a YAML string and convert it to a StoredConfig.
// The YAML uses a `plugins:` key (legacy shape); this maps it to `connections:`.
export function importYaml(text: string): { config: StoredConfig | null; warnings: string[] } {
  const warnings: string[] = []

  let parsed: unknown
  try {
    parsed = yaml.load(text)
  } catch (e) {
    return { config: null, warnings: [`Failed to parse YAML: ${String(e)}`] }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: null, warnings: ['YAML did not produce a valid object'] }
  }

  const raw = parsed as Record<string, unknown>
  const plugins = raw.plugins as Record<string, unknown> | undefined
  const jmriPlugin = plugins?.jmri as Record<string, unknown> | undefined

  if (jmriPlugin && 'tramPrefix' in jmriPlugin) {
    warnings.push('tramPrefix is no longer supported and was ignored')
  }

  const normalized: Record<string, unknown> = {
    version: 1,
    ...(typeof raw.debug === 'boolean' && { debug: raw.debug }),
    connections: {
      jmri:          plugins?.jmri,
      homeassistant: plugins?.homeassistant,
    },
    tabs: Array.isArray(raw.tabs) ? raw.tabs : [],
  }

  const config = sanitize(normalized)
  if (!config) {
    warnings.push('Config is missing required JMRI connection details (host)')
    return { config: null, warnings }
  }

  return { config, warnings }
}

// Serialise a StoredConfig back to YAML (plugins: shape for human readability).
export function exportYaml(config: StoredConfig): string {
  const doc: Record<string, unknown> = {}
  if (config.debug) doc.debug = config.debug
  doc.plugins = {
    jmri: config.connections.jmri,
    ...(config.connections.homeassistant && { homeassistant: config.connections.homeassistant }),
  }
  doc.tabs = config.tabs
  return yaml.dump(doc, { indent: 2, lineWidth: 120 })
}
