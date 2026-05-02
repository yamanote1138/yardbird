import { ref } from 'vue'
import type { WidgetInstance, WidgetType } from '@/core/types'

export interface PendingWidgetConfig {
  widgetId: string | null       // null = new widget being added
  widgetType: WidgetType
  config: Record<string, unknown>
  onConfirm: (config: Record<string, unknown>) => void
  onCancel: () => void
}

const pending = ref<PendingWidgetConfig | null>(null)

export function useWidgetConfig() {
  function open(opts: PendingWidgetConfig) {
    pending.value = opts
  }

  function openForNew(widget: WidgetInstance, onConfirm: (w: WidgetInstance) => void, onCancel: () => void) {
    pending.value = {
      widgetId: null,
      widgetType: widget.type,
      config: { ...widget.config },
      onConfirm: (cfg) => onConfirm({ ...widget, config: cfg }),
      onCancel,
    }
  }

  function openForEdit(widgetId: string, widgetType: WidgetType, config: Record<string, unknown>, onConfirm: (cfg: Record<string, unknown>) => void) {
    pending.value = {
      widgetId,
      widgetType,
      config: { ...config },
      onConfirm,
      onCancel: () => { pending.value = null },
    }
  }

  function confirm(config: Record<string, unknown>) {
    pending.value?.onConfirm(config)
    pending.value = null
  }

  function cancel() {
    pending.value?.onCancel()
    pending.value = null
  }

  return { pending, open, openForNew, openForEdit, confirm, cancel }
}
