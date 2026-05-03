import type { Component } from 'vue'
import type { WidgetType, WidgetGridPos } from '@/core/types'

export interface WidgetDefinition {
  type: WidgetType
  name: string
  icon: string
  plugin: 'jmri' | 'homeassistant'
  defaultSize: WidgetGridPos
  minSize: { w: number; h: number }
  hasConfig: boolean
  component: () => Promise<Component>
}

export const WIDGET_REGISTRY: Record<WidgetType, WidgetDefinition> = {
  'jmri-throttle': {
    type: 'jmri-throttle',
    name: 'Throttle',
    icon: 'i-mdi-train',
    plugin: 'jmri',
    defaultSize: { x: 0, y: 0, w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    hasConfig: true,
    component: () => import('@/plugins/jmri/components/ThrottleWidget.vue'),
  },

  'jmri-turnout': {
    type: 'jmri-turnout',
    name: 'Turnout',
    icon: 'i-mdi-source-branch',
    plugin: 'jmri',
    defaultSize: { x: 0, y: 0, w: 2, h: 1 },
    minSize: { w: 2, h: 1 },
    hasConfig: true,
    component: () => import('@/plugins/jmri/components/TurnoutWidget.vue'),
  },

  'jmri-light': {
    type: 'jmri-light',
    name: 'Light',
    icon: 'i-mdi-lightbulb-outline',
    plugin: 'jmri',
    defaultSize: { x: 0, y: 0, w: 2, h: 1 },
    minSize: { w: 2, h: 1 },
    hasConfig: true,
    component: () => import('@/plugins/jmri/components/LightWidget.vue'),
  },

  'jmri-power': {
    type: 'jmri-power',
    name: 'Command Station',
    icon: 'i-heroicons-bolt',
    plugin: 'jmri',
    defaultSize: { x: 0, y: 0, w: 2, h: 1 },
    minSize: { w: 2, h: 1 },
    hasConfig: true,
    component: () => import('@/plugins/jmri/components/PowerWidget.vue'),
  },

'ha-entity': {
    type: 'ha-entity',
    name: 'Room Control',
    icon: 'i-mdi-home',
    plugin: 'homeassistant',
    defaultSize: { x: 0, y: 0, w: 2, h: 1 },
    minSize: { w: 2, h: 1 },
    hasConfig: true,
    component: () => import('@/plugins/homeassistant/components/HaEntityWidget.vue'),
  },
}

export function getWidgetDef(type: WidgetType): WidgetDefinition {
  return WIDGET_REGISTRY[type]
}
