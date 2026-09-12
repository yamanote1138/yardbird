import { ref, onUnmounted } from 'vue'

function computeIsStandalone(): boolean {
  if (document.fullscreenElement) return true
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if ((window.navigator as { standalone?: boolean }).standalone) return true
  return false
}

export function useDisplayMode() {
  const isStandalone = ref(computeIsStandalone())

  function update() {
    isStandalone.value = computeIsStandalone()
  }

  const mediaQuery = window.matchMedia('(display-mode: standalone)')
  document.addEventListener('fullscreenchange', update)
  mediaQuery.addEventListener('change', update)

  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', update)
    mediaQuery.removeEventListener('change', update)
  })

  return { isStandalone }
}
