import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountWithUI } from '@/__tests__/test-utils'
import { PowerState } from 'jmri-client'
import type { RosterEntry } from '@/types/jmri'

const { acquireThrottle, recordLoco } = vi.hoisted(() => ({ acquireThrottle: vi.fn(), recordLoco: vi.fn() }))

vi.mock('@/plugins/jmri', () => ({
  useJmri: () => ({
    isConnected: ref(true),
    power: ref(PowerState.ON),
    powerByPrefix: ref(new Map([['D', PowerState.ON]])),
    acquireThrottle,
  }),
}))
vi.mock('@/plugins/jmri/useRecentLocos', () => ({ useRecentLocos: () => ({ recordLoco }) }))

const { default: RosterCard } = await import('@/plugins/jmri/components/RosterCard.vue')

const ENTRY: RosterEntry = { address: 1, name: 'Thomas', road: 'NWR', number: '1' }

describe('RosterCard recent locos', () => {
  beforeEach(() => { acquireThrottle.mockReset(); recordLoco.mockReset() })

  it('records the loco as recent after a successful acquire', async () => {
    acquireThrottle.mockResolvedValue(undefined)
    const w = mountWithUI(RosterCard, { props: { entry: ENTRY, commandStation: 'D' } })
    await w.find('.loco-header').trigger('click')
    await flushPromises()
    expect(recordLoco).toHaveBeenCalledWith({ address: 1, name: 'Thomas', commandStation: 'D' })
  })

  it('does not record the loco when acquire fails', async () => {
    acquireThrottle.mockRejectedValue(new Error('nope'))
    const w = mountWithUI(RosterCard, { props: { entry: ENTRY } })
    await w.find('.loco-header').trigger('click')
    await flushPromises()
    expect(recordLoco).not.toHaveBeenCalled()
  })
})
