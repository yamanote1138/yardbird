import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, setDebugMode } from '@/utils/logger'

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setDebugMode(false)
  })

  it('suppresses debug output when debug mode is off', () => {
    setDebugMode(false)
    logger.debug('hello')
    expect(console.log).not.toHaveBeenCalled()
  })

  it('emits debug output when debug mode is on', () => {
    setDebugMode(true)
    logger.debug('hello')
    expect(console.log).toHaveBeenCalledWith('[DEBUG]', 'hello')
  })

  it('emits info output regardless of debug mode', () => {
    setDebugMode(false)
    logger.info('hello')
    expect(console.log).toHaveBeenCalledWith('[INFO]', 'hello')
  })

  it('emits warn regardless of debug mode', () => {
    setDebugMode(false)
    logger.warn('something')
    expect(console.warn).toHaveBeenCalledWith('[WARN]', 'something')
  })

  it('emits error regardless of debug mode', () => {
    setDebugMode(false)
    logger.error('boom')
    expect(console.error).toHaveBeenCalledWith('[ERROR]', 'boom')
  })
})
