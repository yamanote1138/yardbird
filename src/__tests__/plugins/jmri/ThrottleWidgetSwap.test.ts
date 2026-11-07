import { describe, it, expect, afterEach, vi } from 'vitest'
import { mountWithUI, connectMockJmri } from '@/__tests__/test-utils'
import { useJmri } from '@/plugins/jmri'
import { useWidgetConfig } from '@/composables/useWidgetConfig'
import { WIDGET_ID_KEY } from '@/widgets/widgetContext'
import type { RosterEntry, Throttle } from '@/types/jmri'
import { Direction } from '@/types/jmri'

const { updateWidgetConfig } = vi.hoisted(() => ({ updateWidgetConfig: vi.fn() }))
vi.mock('@/core/useConfig', () => ({ useConfig: () => ({ updateWidgetConfig }) }))

const { default: ThrottleWidget } = await import('@/plugins/jmri/components/ThrottleWidget.vue')

const ENTRY: RosterEntry = { address: 11, name: 'E235', road: 'JR East', number: '11' }
const THROTTLE: Throttle = {
  address: 11, name: 'E235', road: 'JR East', number: '11', speed: 0,
  direction: Direction.FORWARD, directionVerified: true, functions: {}, acquiredAt: 0,
}

function mountWidget(props: Record<string, unknown>) {
  return mountWithUI(ThrottleWidget, {
    props,
    global: {
      provide: { [WIDGET_ID_KEY as symbol]: 'w1' },
      stubs: {
        ThrottleCard: { template: '<div data-testid="throttle-card" />' },
        RosterCard: { template: '<div data-testid="roster-card" />' },
      },
    },
  })
}

const changeButton = (w: ReturnType<typeof mountWidget>) =>
  w.findAll('button').find(b => b.text().includes('Change loco'))

describe('ThrottleWidget loco swap', () => {
  afterEach(async () => {
    useWidgetConfig().cancel()
    updateWidgetConfig.mockClear()
    useJmri().disconnect()
    await new Promise(r => setTimeout(r, 50))
  })

  it('offers Change loco when the throttle is released', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.roster.set(11, ENTRY)
    const w = mountWidget({ address: 11 })
    expect(changeButton(w)).toBeDefined()
  })

  it('offers Change loco when the address is not in the roster', async () => {
    await connectMockJmri()
    const w = mountWidget({ address: 999 })
    expect(changeButton(w)).toBeDefined()
  })

  it('hides Change loco while the throttle is acquired', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.throttles.set(11, THROTTLE)
    const w = mountWidget({ address: 11 })
    expect(changeButton(w)).toBeUndefined()
  })

  it('opens the throttle config for this widget and saves the pick', async () => {
    await connectMockJmri()
    useJmri().jmriState.value.roster.set(11, ENTRY)
    const w = mountWidget({ address: 11, commandStation: 'D' })
    await changeButton(w)!.trigger('click')

    const { pending, confirm } = useWidgetConfig()
    expect(pending.value?.widgetId).toBe('w1')
    expect(pending.value?.widgetType).toBe('jmri-throttle')
    expect(pending.value?.config).toEqual({ address: 11, commandStation: 'D' })

    confirm({ address: 1, commandStation: 'D' })
    expect(updateWidgetConfig).toHaveBeenCalledWith('w1', { address: 1, commandStation: 'D' })
  })
})
