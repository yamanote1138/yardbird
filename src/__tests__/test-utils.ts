import { mount, type MountingOptions } from '@vue/test-utils'
import { vi } from 'vitest'
import type { Component } from 'vue'
import { useJmri, ConnectionState, type JmriConnectionSettings } from '@/plugins/jmri'

export { mount }
export type { MountingOptions }

const DEFAULT_MOCK_SETTINGS: JmriConnectionSettings = {
  host: 'localhost',
  port: 12080,
  protocol: 'ws',
  mockEnabled: true,
  mockDelay: 0,
}

/** Wrap mount with pre-configured Nuxt UI stubs. Per-test stubs merge on top. */
export function mountWithUI<T>(
  component: Component,
  options?: MountingOptions<T>,
) {
  return mount(component, {
    ...options,
    global: {
      ...options?.global,
      stubs: {
        ...options?.global?.stubs,
      },
    },
  })
}

/** Connect to the JMRI mock client and wait until CONNECTED. */
export async function connectMockJmri(settings = DEFAULT_MOCK_SETTINGS) {
  const jmri = useJmri()
  jmri.initialize(settings)
  await vi.waitFor(() => {
    if (jmri.connectionState.value !== ConnectionState.CONNECTED) {
      throw new Error('not connected yet')
    }
  }, { timeout: 3000 })
  return jmri
}
