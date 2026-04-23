/**
 * Extended JMRI client with named power source support
 *
 * JMRI exposes multiple power managers (one per system connection).
 * The base JmriClient only handles the default power manager.
 * This subclass adds methods to query and control power by connection name.
 */

import { JmriClient, PowerState } from 'jmri-client'
import type { PartialClientOptions } from 'jmri-client'

export interface NamedPowerSource {
  name: string
  state: PowerState
  default: boolean
}

export class ExtendedJmriClient extends JmriClient {
  constructor(options?: PartialClientOptions) {
    super(options)
  }

  /**
   * List all power sources (system connections with power managers)
   */
  async listPowerSources(): Promise<NamedPowerSource[]> {
    const response = await this.wsClient.request({
      type: 'power',
      method: 'list'
    })

    if (Array.isArray(response)) {
      return response.map((entry: any) => ({
        name: entry.data?.name ?? entry.name,
        state: entry.data?.state ?? entry.state ?? PowerState.UNKNOWN,
        default: entry.data?.default ?? entry.default ?? false
      }))
    }

    return []
  }

  /**
   * Get power state for a specific named connection.
   * Uses request() with an id so we get a matched response.
   * JMRI requires no `method` field for named power GET to work correctly.
   */
  async getPowerByName(name: string): Promise<PowerState> {
    const response: any = await this.wsClient.request({
      type: 'power',
      data: { name }
    })

    return response?.data?.state ?? PowerState.UNKNOWN
  }

  /**
   * Set power state for a specific named connection.
   * Uses fire-and-forget send() — JMRI ignores named power SET when
   * `method` or `id` fields are present. The state transitions through
   * UNKNOWN (~10ms) before settling, so callers should poll after a delay.
   */
  setPowerByName(name: string, state: PowerState): void {
    this.wsClient.send({
      type: 'power',
      data: { name, state }
    })
  }

}
