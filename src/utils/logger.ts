let _debug = false

export function setDebugMode(enabled: boolean) {
  _debug = enabled
}

export const logger = {
  debug: (...args: any[]) => { if (_debug) console.log('[DEBUG]', ...args) },
  info:  (...args: any[]) => console.log('[INFO]', ...args),
  warn:  (...args: any[]) => console.warn('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
}
