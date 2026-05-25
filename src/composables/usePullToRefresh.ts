import { ref, watch, onUnmounted, type Ref } from 'vue'

interface Options {
  scrollEl: Ref<HTMLElement | null>
  enabled: Ref<boolean>
  threshold?: number
  onRefresh?: () => void
}

export function usePullToRefresh({
  scrollEl,
  enabled,
  threshold = 80,
  onRefresh = () => window.location.reload(),
}: Options) {
  const isPulling = ref(false)
  const pullDistance = ref(0)
  const isPastThreshold = ref(false)

  // maxPull: visual cap; triggerAt: 75% of cap triggers refresh
  const maxPull = threshold * 0.9
  const triggerAt = maxPull * 0.75

  let startY = 0

  function onTouchStart(e: TouchEvent) {
    if (!enabled.value) return
    startY = e.touches[0].clientY
  }

  function onTouchMove(e: TouchEvent) {
    if (!enabled.value || !scrollEl.value) return
    if (scrollEl.value.scrollTop > 0) return

    const delta = e.touches[0].clientY - startY
    if (delta <= 0) return

    e.preventDefault()
    isPulling.value = true
    pullDistance.value = Math.min(maxPull, delta * 0.4)
    isPastThreshold.value = pullDistance.value >= triggerAt
  }

  function onTouchEnd() {
    if (!isPulling.value) return
    if (isPastThreshold.value) {
      onRefresh()
    } else {
      reset()
    }
  }

  function reset() {
    isPulling.value = false
    pullDistance.value = 0
    isPastThreshold.value = false
  }

  function attach(el: HTMLElement) {
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove as EventListener, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
  }

  function detach(el: HTMLElement) {
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove as EventListener)
    el.removeEventListener('touchend', onTouchEnd)
  }

  watch(scrollEl, (el, oldEl) => {
    if (oldEl) detach(oldEl)
    if (el) attach(el)
  }, { immediate: true })

  onUnmounted(() => {
    if (scrollEl.value) detach(scrollEl.value)
  })

  return { isPulling, pullDistance, isPastThreshold }
}
