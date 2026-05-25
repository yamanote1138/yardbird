import { describe, it, expect, afterEach, vi } from 'vitest'
import { useWidgetConfig } from '@/composables/useWidgetConfig'
import type { WidgetInstance } from '@/core/types'

const MOCK_WIDGET: WidgetInstance = {
  id: 'test-id',
  type: 'jmri-turnout',
  grid: { x: 0, y: 0, w: 2, h: 1 },
  config: { address: 'LT1' },
}

describe('useWidgetConfig', () => {
  afterEach(() => {
    useWidgetConfig().cancel()
  })

  it('starts with no pending config', () => {
    const { pending } = useWidgetConfig()
    expect(pending.value).toBeNull()
  })

  describe('open', () => {
    it('sets pending to the provided opts', () => {
      const { open, pending } = useWidgetConfig()
      const onConfirm = vi.fn()
      const onCancel = vi.fn()
      open({ widgetId: 'w1', widgetType: 'jmri-turnout', config: {}, onConfirm, onCancel })
      expect(pending.value?.widgetId).toBe('w1')
      expect(pending.value?.widgetType).toBe('jmri-turnout')
    })
  })

  describe('openForNew', () => {
    it('sets widgetId to null and copies config', () => {
      const { openForNew, pending } = useWidgetConfig()
      openForNew(MOCK_WIDGET, vi.fn(), vi.fn())
      expect(pending.value?.widgetId).toBeNull()
      expect(pending.value?.widgetType).toBe('jmri-turnout')
      expect(pending.value?.config).toEqual({ address: 'LT1' })
    })

    it('calls onConfirm with merged widget on confirm', () => {
      const { openForNew, confirm } = useWidgetConfig()
      const onConfirm = vi.fn()
      openForNew(MOCK_WIDGET, onConfirm, vi.fn())
      confirm({ address: 'LT2' })
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test-id', config: { address: 'LT2' } })
      )
    })

    it('calls onCancel and clears pending on cancel', () => {
      const { openForNew, cancel, pending } = useWidgetConfig()
      const onCancel = vi.fn()
      openForNew(MOCK_WIDGET, vi.fn(), onCancel)
      cancel()
      expect(onCancel).toHaveBeenCalled()
      expect(pending.value).toBeNull()
    })
  })

  describe('openForEdit', () => {
    it('sets widgetId and config for an existing widget', () => {
      const { openForEdit, pending } = useWidgetConfig()
      openForEdit('existing-id', 'jmri-light', { address: 'IL1' }, vi.fn())
      expect(pending.value?.widgetId).toBe('existing-id')
      expect(pending.value?.config).toEqual({ address: 'IL1' })
    })
  })

  describe('confirm', () => {
    it('calls onConfirm with new config and clears pending', () => {
      const { open, confirm, pending } = useWidgetConfig()
      const onConfirm = vi.fn()
      open({ widgetId: 'w1', widgetType: 'jmri-light', config: {}, onConfirm, onCancel: vi.fn() })
      confirm({ address: 'IL2' })
      expect(onConfirm).toHaveBeenCalledWith({ address: 'IL2' })
      expect(pending.value).toBeNull()
    })
  })

  describe('cancel', () => {
    it('calls onCancel and clears pending', () => {
      const { open, cancel, pending } = useWidgetConfig()
      const onCancel = vi.fn()
      open({ widgetId: 'w1', widgetType: 'jmri-light', config: {}, onConfirm: vi.fn(), onCancel })
      cancel()
      expect(onCancel).toHaveBeenCalled()
      expect(pending.value).toBeNull()
    })
  })
})
