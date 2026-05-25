import { describe, it, expect } from 'vitest'
import { WIDGET_REGISTRY, getWidgetDef } from '@/widgets/registry'
import type { WidgetType } from '@/core/types'

const EXPECTED_TYPES: WidgetType[] = [
  'jmri-power',
  'jmri-throttle',
  'jmri-turnout',
  'jmri-light',
  'ha-entity',
]

describe('WIDGET_REGISTRY', () => {
  it('contains all expected widget types', () => {
    for (const type of EXPECTED_TYPES) {
      expect(WIDGET_REGISTRY[type], `missing type: ${type}`).toBeDefined()
    }
  })

  it('has no extra widget types beyond the expected set', () => {
    const registeredTypes = Object.keys(WIDGET_REGISTRY)
    expect(registeredTypes.sort()).toEqual([...EXPECTED_TYPES].sort())
  })

  for (const type of EXPECTED_TYPES) {
    describe(`${type}`, () => {
      it('has required fields', () => {
        const def = WIDGET_REGISTRY[type]
        expect(typeof def.name).toBe('string')
        expect(def.name.length).toBeGreaterThan(0)
        expect(typeof def.icon).toBe('string')
        expect(def.icon.length).toBeGreaterThan(0)
        expect(['jmri', 'homeassistant']).toContain(def.plugin)
        expect(typeof def.defaultSize.w).toBe('number')
        expect(typeof def.defaultSize.h).toBe('number')
        expect(typeof def.minSize.w).toBe('number')
        expect(typeof def.minSize.h).toBe('number')
        expect(typeof def.hasConfig).toBe('boolean')
        expect(typeof def.component).toBe('function')
      })

      it('has minSize no larger than defaultSize', () => {
        const def = WIDGET_REGISTRY[type]
        expect(def.minSize.w).toBeLessThanOrEqual(def.defaultSize.w)
        expect(def.minSize.h).toBeLessThanOrEqual(def.defaultSize.h)
      })
    })
  }
})

describe('getWidgetDef', () => {
  it('returns the correct definition for a known type', () => {
    const def = getWidgetDef('jmri-power')
    expect(def.plugin).toBe('jmri')
  })

  it('returns undefined for an unknown type', () => {
    const def = getWidgetDef('not-a-widget' as WidgetType)
    expect(def).toBeUndefined()
  })
})
