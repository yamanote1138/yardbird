import { describe, it, expect, beforeEach, vi } from 'vitest'

const KEY = 'yardbird:recentLocos'

async function fresh() {
  vi.resetModules()
  const { useRecentLocos } = await import('@/plugins/jmri/useRecentLocos')
  return useRecentLocos()
}

describe('useRecentLocos', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty', async () => {
    const { recentLocos } = await fresh()
    expect(recentLocos.value).toEqual([])
  })

  it('puts the latest loco first and persists it', async () => {
    const r = await fresh()
    r.recordLoco({ address: 11, name: 'E235' })
    r.recordLoco({ address: 1, name: 'Thomas' })
    expect(r.recentLocos.value.map(l => l.address)).toEqual([1, 11])
    expect(JSON.parse(localStorage.getItem(KEY)!)[0].address).toBe(1)
  })

  it('moves a repeat loco to the front instead of duplicating it', async () => {
    const r = await fresh()
    r.recordLoco({ address: 11, name: 'E235' })
    r.recordLoco({ address: 1, name: 'Thomas' })
    r.recordLoco({ address: 11, name: 'E235' })
    expect(r.recentLocos.value.map(l => l.address)).toEqual([11, 1])
  })

  it('treats the same address on different command stations as different locos', async () => {
    const r = await fresh()
    r.recordLoco({ address: 3, name: 'A', commandStation: 'D' })
    r.recordLoco({ address: 3, name: 'B', commandStation: 'E' })
    expect(r.recentLocos.value).toHaveLength(2)
  })

  it('keeps only the five most recent', async () => {
    const r = await fresh()
    for (let a = 1; a <= 7; a++) r.recordLoco({ address: a, name: `L${a}` })
    expect(r.recentLocos.value.map(l => l.address)).toEqual([7, 6, 5, 4, 3])
  })

  it('loads from storage and ignores junk', async () => {
    localStorage.setItem(KEY, JSON.stringify([{ address: 5, name: 'Five' }, { nope: true }, 'x']))
    const { recentLocos } = await fresh()
    expect(recentLocos.value).toEqual([{ address: 5, name: 'Five' }])
  })

  it('survives invalid JSON in storage', async () => {
    localStorage.setItem(KEY, '{not json')
    const { recentLocos } = await fresh()
    expect(recentLocos.value).toEqual([])
  })
})
