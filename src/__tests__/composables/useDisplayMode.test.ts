import { describe, it, expect, vi, afterEach } from 'vitest'
import { useDisplayMode } from '@/composables/useDisplayMode'

interface MockMql {
  matches: boolean
  media: string
  addEventListener: (type: string, cb: (e: { matches: boolean }) => void) => void
  removeEventListener: (type: string, cb: (e: { matches: boolean }) => void) => void
}

function mockMatchMedia(initialMatches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  const mql: MockMql = {
    matches: initialMatches,
    media: '(display-mode: standalone)',
    addEventListener: (_type, cb) => listeners.push(cb),
    removeEventListener: vi.fn(),
  }
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia
  return {
    trigger: (matches: boolean) => {
      mql.matches = matches
      listeners.forEach(cb => cb({ matches }))
    },
  }
}

describe('useDisplayMode', () => {
  afterEach(() => {
    // Clean up any fullscreenElement stub between tests
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    ;(window.navigator as { standalone?: boolean }).standalone = undefined
  })

  it('is false in a normal browser tab', () => {
    mockMatchMedia(false)
    const { isStandalone } = useDisplayMode()
    expect(isStandalone.value).toBe(false)
  })

  it('is true when the display-mode media query matches on load', () => {
    mockMatchMedia(true)
    const { isStandalone } = useDisplayMode()
    expect(isStandalone.value).toBe(true)
  })

  it('updates when the display-mode media query changes', () => {
    const { trigger } = mockMatchMedia(false)
    const { isStandalone } = useDisplayMode()
    expect(isStandalone.value).toBe(false)

    trigger(true)
    expect(isStandalone.value).toBe(true)
  })

  it('is true when the document is in fullscreen', () => {
    mockMatchMedia(false)
    const { isStandalone } = useDisplayMode()
    expect(isStandalone.value).toBe(false)

    Object.defineProperty(document, 'fullscreenElement', { value: document.createElement('div'), configurable: true })
    document.dispatchEvent(new Event('fullscreenchange'))

    expect(isStandalone.value).toBe(true)
  })

  it('is true when navigator.standalone is set (iOS home-screen launch)', () => {
    mockMatchMedia(false)
    ;(window.navigator as { standalone?: boolean }).standalone = true

    const { isStandalone } = useDisplayMode()

    expect(isStandalone.value).toBe(true)
  })
})
