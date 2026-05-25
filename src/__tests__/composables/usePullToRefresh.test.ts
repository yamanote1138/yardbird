import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { usePullToRefresh } from '@/composables/usePullToRefresh'

// Fires a touch event on an element with a single touch point at the given clientY
function fire(el: HTMLElement, type: string, clientY = 0) {
  const touch = {
    identifier: 1, target: el,
    clientX: 0, clientY,
    pageX: 0, pageY: clientY,
    screenX: 0, screenY: clientY,
    radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1,
  }
  el.dispatchEvent(new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [touch as unknown as Touch],
    changedTouches: [touch as unknown as Touch],
    bubbles: true,
    cancelable: true,
  }))
}

describe('usePullToRefresh', () => {
  it('calls onRefresh when pulled past threshold and released', () => {
    const el = document.createElement('div')
    const onRefresh = vi.fn()
    usePullToRefresh({ scrollEl: ref(el), enabled: ref(true), onRefresh })

    fire(el, 'touchstart', 0)
    fire(el, 'touchmove', 200) // damped: min(72, 200*0.4=80) = 72 ≥ 54 → past threshold
    fire(el, 'touchend')

    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('does not call onRefresh when released before threshold', () => {
    const el = document.createElement('div')
    const onRefresh = vi.fn()
    usePullToRefresh({ scrollEl: ref(el), enabled: ref(true), onRefresh })

    fire(el, 'touchstart', 0)
    fire(el, 'touchmove', 100) // damped: min(72, 100*0.4=40) = 40 < 54 → below threshold
    fire(el, 'touchend')

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does nothing when disabled', () => {
    const el = document.createElement('div')
    const onRefresh = vi.fn()
    usePullToRefresh({ scrollEl: ref(el), enabled: ref(false), onRefresh })

    fire(el, 'touchstart', 0)
    fire(el, 'touchmove', 200)
    fire(el, 'touchend')

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('ignores drag when element is scrolled down', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'scrollTop', { value: 50, writable: true })
    const onRefresh = vi.fn()
    usePullToRefresh({ scrollEl: ref(el), enabled: ref(true), onRefresh })

    fire(el, 'touchstart', 0)
    fire(el, 'touchmove', 200)
    fire(el, 'touchend')

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('sets isPulling true while dragging from top', () => {
    const el = document.createElement('div')
    const { isPulling } = usePullToRefresh({ scrollEl: ref(el), enabled: ref(true), onRefresh: vi.fn() })

    fire(el, 'touchstart', 0)
    fire(el, 'touchmove', 100)

    expect(isPulling.value).toBe(true)
  })

  it('resets isPulling after release before threshold', () => {
    const el = document.createElement('div')
    const { isPulling } = usePullToRefresh({ scrollEl: ref(el), enabled: ref(true), onRefresh: vi.fn() })

    fire(el, 'touchstart', 0)
    fire(el, 'touchmove', 100)
    fire(el, 'touchend')

    expect(isPulling.value).toBe(false)
  })

  it('isPastThreshold becomes true at 75% of max pull', () => {
    const el = document.createElement('div')
    const { isPastThreshold } = usePullToRefresh({ scrollEl: ref(el), enabled: ref(true), onRefresh: vi.fn() })

    fire(el, 'touchstart', 0)
    fire(el, 'touchmove', 200) // damped = 72 ≥ 54 = triggerAt

    expect(isPastThreshold.value).toBe(true)
  })

  it('pullDistance reflects damped drag amount', () => {
    const el = document.createElement('div')
    const { pullDistance } = usePullToRefresh({ scrollEl: ref(el), enabled: ref(true), onRefresh: vi.fn() })

    fire(el, 'touchstart', 0)
    fire(el, 'touchmove', 100)

    // 100 * 0.4 = 40, well below maxPull of 72
    expect(pullDistance.value).toBeCloseTo(40, 0)
  })
})
