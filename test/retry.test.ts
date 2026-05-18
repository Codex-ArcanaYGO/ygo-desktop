import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry, fetchWithRetry } from '../src/lib/retry'

describe('withRetry', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns the first successful result', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok')
    const p = withRetry(fn, { retries: 3, baseDelayMs: 1 })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const p = withRetry(fn, { retries: 3, baseDelayMs: 1 })
    // Attach an immediate catch so the rejection is never unhandled,
    // then drive timers and assert.
    const assertion = expect(p).rejects.toThrow('boom')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respects shouldRetry=false to short-circuit', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'))
    await expect(withRetry(fn, { retries: 5, baseDelayMs: 1, shouldRetry: () => false }))
      .rejects.toThrow('fatal')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('fetchWithRetry', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('returns 2xx response without retry', async () => {
    const ok = new Response('ok', { status: 200 })
    const fetchMock = vi.fn().mockResolvedValue(ok)
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWithRetry('http://x', undefined, { retries: 3, baseDelayMs: 1 })).resolves.toBe(ok)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns 4xx without retrying (deterministic client error)', async () => {
    const notFound = new Response('', { status: 404 })
    const fetchMock = vi.fn().mockResolvedValue(notFound)
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWithRetry('http://x', undefined, { retries: 3, baseDelayMs: 1 })).resolves.toBe(notFound)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on 5xx', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const p = fetchWithRetry('http://x', undefined, { retries: 3, baseDelayMs: 1 })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on 429', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const p = fetchWithRetry('http://x', undefined, { retries: 3, baseDelayMs: 1 })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toHaveProperty('status', 200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on network errors (fetch throws)', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const p = fetchWithRetry('http://x', undefined, { retries: 3, baseDelayMs: 1 })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toHaveProperty('status', 200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
