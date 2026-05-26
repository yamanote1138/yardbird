import { describe, it, expect, afterEach } from 'vitest'
import { useHomeAssistant } from '@/plugins/homeassistant'

describe('useHomeAssistant', () => {
  afterEach(() => {
    useHomeAssistant().disconnect()
  })

  describe('initial state', () => {
    it('starts disconnected', () => {
      expect(useHomeAssistant().connectionState.value).toBe('disconnected')
    })

    it('isConnected is false before connect', () => {
      expect(useHomeAssistant().isConnected.value).toBe(false)
    })

    it('lights is empty before connect', () => {
      expect(useHomeAssistant().lights.value).toHaveLength(0)
    })

    it('switches is empty before connect', () => {
      expect(useHomeAssistant().switches.value).toHaveLength(0)
    })

    it('lastError is empty before connect', () => {
      expect(useHomeAssistant().lastError.value).toBe('')
    })
  })

  describe('connectMock', () => {
    it('sets connectionState to connected', () => {
      useHomeAssistant().connectMock()
      expect(useHomeAssistant().connectionState.value).toBe('connected')
    })

    it('isConnected is true after connectMock', () => {
      useHomeAssistant().connectMock()
      expect(useHomeAssistant().isConnected.value).toBe(true)
    })

    it('seeds 3 lights', () => {
      useHomeAssistant().connectMock()
      expect(useHomeAssistant().lights.value).toHaveLength(3)
    })

    it('seeds 2 switches', () => {
      useHomeAssistant().connectMock()
      expect(useHomeAssistant().switches.value).toHaveLength(2)
    })

    it('lights only contain light-domain entities', () => {
      useHomeAssistant().connectMock()
      const { lights } = useHomeAssistant()
      expect(lights.value.every(e => e.domain === 'light')).toBe(true)
    })

    it('switches only contain switch-domain entities', () => {
      useHomeAssistant().connectMock()
      const { switches } = useHomeAssistant()
      expect(switches.value.every(e => e.domain === 'switch')).toBe(true)
    })

    it('lights are sorted alphabetically by friendlyName', () => {
      useHomeAssistant().connectMock()
      const names = useHomeAssistant().lights.value.map(e => e.friendlyName)
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    })

    it('switches are sorted alphabetically by friendlyName', () => {
      useHomeAssistant().connectMock()
      const names = useHomeAssistant().switches.value.map(e => e.friendlyName)
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    })

    it('entities have valid state values', () => {
      useHomeAssistant().connectMock()
      const { lights, switches } = useHomeAssistant()
      const all = [...lights.value, ...switches.value]
      expect(all.every(e => ['on', 'off', 'unavailable'].includes(e.state))).toBe(true)
    })
  })

  describe('disconnect', () => {
    it('sets connectionState back to disconnected', () => {
      const ha = useHomeAssistant()
      ha.connectMock()
      ha.disconnect()
      expect(ha.connectionState.value).toBe('disconnected')
    })

    it('isConnected is false after disconnect', () => {
      const ha = useHomeAssistant()
      ha.connectMock()
      ha.disconnect()
      expect(ha.isConnected.value).toBe(false)
    })

    it('clears lights after disconnect', () => {
      const ha = useHomeAssistant()
      ha.connectMock()
      ha.disconnect()
      expect(ha.lights.value).toHaveLength(0)
    })

    it('clears switches after disconnect', () => {
      const ha = useHomeAssistant()
      ha.connectMock()
      ha.disconnect()
      expect(ha.switches.value).toHaveLength(0)
    })
  })
})
