import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateId } from '@/utils/uuid'

describe('generateId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a valid UUID-format string in secure contexts', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('returns unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })

  it('falls back to Math.random UUID when crypto.randomUUID is unavailable', () => {
    // Simulate non-secure HTTP context where randomUUID is undefined
    vi.spyOn(crypto, 'randomUUID').mockImplementation(undefined as unknown as () => `${string}-${string}-${string}-${string}-${string}`)
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
