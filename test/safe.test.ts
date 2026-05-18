import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runSafe, safeStorageSet, safeStorageGetJSON, safeStorageRemove, swallow } from '../src/lib/safe'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('runSafe', () => {
  it('returns fn result on success', () => {
    expect(runSafe('ctx', () => 42, 0)).toBe(42)
  })

  it('returns fallback on throw', () => {
    expect(runSafe('ctx', () => { throw new Error('x') }, -1)).toBe(-1)
  })
})

describe('safeStorageSet', () => {
  it('writes and returns true on success', () => {
    expect(safeStorageSet('k', 'v', 'ctx')).toBe(true)
    expect(localStorage.getItem('k')).toBe('v')
  })

  it('returns false and logs when setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new DOMException('Quota exceeded', 'QuotaExceededError')
      throw err
    })
    expect(safeStorageSet('k', 'v', 'ctx')).toBe(false)
    expect(spy).toHaveBeenCalled()
  })
})

describe('safeStorageGetJSON', () => {
  it('returns fallback when key missing', () => {
    expect(safeStorageGetJSON('missing', { a: 1 }, 'ctx')).toEqual({ a: 1 })
  })

  it('parses JSON when present', () => {
    localStorage.setItem('k', JSON.stringify({ x: 2 }))
    expect(safeStorageGetJSON('k', { x: 0 }, 'ctx')).toEqual({ x: 2 })
  })

  it('returns fallback on parse error', () => {
    localStorage.setItem('k', 'not-json{')
    expect(safeStorageGetJSON('k', null, 'ctx')).toBe(null)
  })
})

describe('safeStorageRemove', () => {
  it('removes the key', () => {
    localStorage.setItem('k', 'v')
    safeStorageRemove('k', 'ctx')
    expect(localStorage.getItem('k')).toBe(null)
  })
})

describe('swallow', () => {
  it('returns a function that does not throw', () => {
    const fn = swallow('ctx')
    expect(() => fn(new Error('x'))).not.toThrow()
  })
})
