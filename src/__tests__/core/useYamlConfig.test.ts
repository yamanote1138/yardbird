import { describe, it, expect } from 'vitest'
import { sanitize, importYaml, exportYaml } from '@/core/useYamlConfig'

const VALID_STORED = {
  version: 1 as const,
  connections: { jmri: { host: 'myhost', port: 12080 } },
  tabs: [],
}

describe('sanitize', () => {
  it('returns a valid StoredConfig unchanged', () => {
    const result = sanitize(VALID_STORED)
    expect(result).not.toBeNull()
    expect(result!.connections.jmri?.host).toBe('myhost')
  })

  it('returns null when jmri connection is missing', () => {
    expect(sanitize({ version: 1, connections: {}, tabs: [] })).toBeNull()
  })

  it('returns null for wrong version', () => {
    expect(sanitize({ version: 2, connections: { jmri: { host: 'x', port: 1 } }, tabs: [] })).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(sanitize(null)).toBeNull()
    expect(sanitize('string')).toBeNull()
    expect(sanitize(42)).toBeNull()
  })

  it('strips deprecated tramPrefix silently', () => {
    const raw = { version: 1, connections: { jmri: { host: 'h', port: 1, tramPrefix: 'D' } }, tabs: [] }
    const result = sanitize(raw)
    expect(result).not.toBeNull()
    expect((result!.connections.jmri as any).tramPrefix).toBeUndefined()
  })

  it('strips unknown top-level fields', () => {
    const raw = { version: 1, connections: { jmri: { host: 'h', port: 1 } }, tabs: [], unknown: 'field' }
    const result = sanitize(raw)
    expect(result).not.toBeNull()
    expect((result as any).unknown).toBeUndefined()
  })

  it('defaults tabs to [] when missing', () => {
    const raw = { version: 1, connections: { jmri: { host: 'h', port: 1 } } }
    const result = sanitize(raw)
    expect(result!.tabs).toEqual([])
  })
})

describe('importYaml', () => {
  it('imports a valid YAML with plugins.jmri shape', () => {
    const yaml = `
plugins:
  jmri:
    host: myhost
    port: 12080
tabs: []
`
    const { config, warnings } = importYaml(yaml)
    expect(config).not.toBeNull()
    expect(config!.connections.jmri?.host).toBe('myhost')
    expect(warnings).toHaveLength(0)
  })

  it('returns a warning for deprecated tramPrefix', () => {
    const yaml = `
plugins:
  jmri:
    host: myhost
    port: 12080
    tramPrefix: D
tabs: []
`
    const { config, warnings } = importYaml(yaml)
    expect(config).not.toBeNull()
    expect(warnings.some(w => w.includes('tramPrefix'))).toBe(true)
  })

  it('returns null config when jmri host is missing', () => {
    const yaml = `
plugins:
  jmri:
    port: 12080
tabs: []
`
    const { config } = importYaml(yaml)
    expect(config).toBeNull()
  })

  it('returns null config for malformed YAML', () => {
    const { config, warnings } = importYaml(': invalid: yaml: {{{')
    expect(config).toBeNull()
    expect(warnings.length).toBeGreaterThan(0)
  })
})

describe('exportYaml', () => {
  it('round-trips a StoredConfig through export → import', () => {
    const original: typeof VALID_STORED = {
      version: 1,
      connections: { jmri: { host: 'roundtrip', port: 9999 } },
      tabs: [],
    }
    const yaml = exportYaml(original)
    const { config } = importYaml(yaml)
    expect(config).not.toBeNull()
    expect(config!.connections.jmri?.host).toBe('roundtrip')
    expect(config!.connections.jmri?.port).toBe(9999)
  })
})
