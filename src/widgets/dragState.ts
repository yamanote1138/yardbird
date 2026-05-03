import type { WidgetType } from '@/core/types'

// Tracks the widget type currently being dragged from the palette.
// Gridstack creates a new DOM element on drop (not the original palette element),
// so this is the only reliable way to pass the type through.
export let draggingWidgetType: WidgetType | null = null

export function setDraggingType(type: WidgetType | null) {
  draggingWidgetType = type
}
