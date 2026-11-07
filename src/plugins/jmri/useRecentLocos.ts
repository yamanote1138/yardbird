import { ref, computed } from 'vue'
import { logger } from '@/utils/logger'

export interface RecentLoco {
  address: number
  name: string
  commandStation?: string
}

const STORAGE_KEY = 'yardbird:recentLocos'
const MAX_RECENT = 5

function isRecentLoco(v: unknown): v is RecentLoco {
  const o = v as RecentLoco
  return !!o && typeof o === 'object' && typeof o.address === 'number' && typeof o.name === 'string'
    && (o.commandStation === undefined || typeof o.commandStation === 'string')
}

function load(): RecentLoco[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isRecentLoco).slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

const recent = ref<RecentLoco[]>(load())

export function useRecentLocos() {
  function recordLoco(loco: RecentLoco) {
    const rest = recent.value.filter(l => !(l.address === loco.address && l.commandStation === loco.commandStation))
    recent.value = [loco, ...rest].slice(0, MAX_RECENT)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.value))
    } catch (error) {
      logger.warn('Could not save recent locos:', error)
    }
  }

  return { recentLocos: computed(() => recent.value), recordLoco }
}
