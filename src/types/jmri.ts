import type { PowerState } from 'jmri-client'
import { TurnoutState, LightState } from 'jmri-client'

// Re-export for use in components
export { TurnoutState, LightState }

export enum Direction {
  FORWARD = true,
  REVERSE = false
}

export interface RosterEntry {
  address: number;
  name: string;
  road: string;
  number: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  functionKeys?: Record<string, string>; // e.g., { "F0": "Headlight", "F1": "Bell" }
}

export interface Throttle extends RosterEntry {
  speed: number;
  direction: Direction;
  directionVerified: boolean; // True if direction has been confirmed by JMRI
  functions: Record<string, ThrottleFunction>;
  acquiredAt: number; // Timestamp when throttle was acquired
}

export interface ThrottleFunction {
  label: string;
  lockable: boolean;
  value: boolean;
}

export interface TurnoutData {
  name: string;           // System name: LT1, IT42, etc.
  userName?: string;      // User-friendly name
  state: TurnoutState;    // Current state
  inverted?: boolean;     // Whether turnout logic is inverted
  comment?: string;       // User comment
}

export interface LightData {
  name: string;           // System name: LL1, IL42, etc.
  userName?: string;      // User-friendly name
  comment?: string;       // User comment
  state: LightState;      // Current state
}

export interface JmriState {
  power: PowerState;
  roster: Map<number, RosterEntry>;
  throttles: Map<number, Throttle>;
  turnouts: Map<string, TurnoutData>;
  lights: Map<string, LightData>;
}
