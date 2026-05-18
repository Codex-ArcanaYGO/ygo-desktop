// Retry helpers for flaky network calls (YGOPRODeck rate limits, transient DNS, etc.).
//
// `withRetry` retries any async function on failure with exponential backoff.
// `fetchWithRetry` wraps `fetch` and retries on network errors or 5xx / 429 responses.
// 4xx responses (other than 429) are not retried — they are deterministic.

import { appLog } from '../logger'

export interface RetryOptions {
  /** Max attempts including the first one. Default: 3 */
  retries?: number
  /** Initial delay in ms. Default: 400 */
  baseDelayMs?: number
  /** Max delay in ms. Default: 8000 */
  maxDelayMs?: number
  /** Optional context tag for logs. */
  context?: string
  /** Custom predicate: return true to retry, false to abort. */
  shouldRetry?: (err: unknown, attempt: number) => boolean
}

const DEFAULT_RETRIES = 3
const DEFAULT_BASE_DELAY = 400
const DEFAULT_MAX_DELAY = 8000

function _delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function _backoff(attempt: number, base: number, max: number): number {
  // Exponential with full jitter: random in [0, min(max, base * 2^attempt))
  const exp = Math.min(max, base * Math.pow(2, attempt))
  return Math.floor(Math.random() * exp)
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? DEFAULT_RETRIES
  const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY
  const max = opts.maxDelayMs ?? DEFAULT_MAX_DELAY
  const ctx = opts.context ?? 'withRetry'
  const shouldRetry = opts.shouldRetry ?? (() => true)

  let lastErr: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === retries - 1 || !shouldRetry(err, attempt)) {
        throw err
      }
      const delayMs = _backoff(attempt, base, max)
      appLog('info', `${ctx} retry ${attempt + 1}/${retries - 1} dans ${delayMs}ms`, String(err))
      await _delay(delayMs)
    }
  }
  // Unreachable
  throw lastErr
}

/**
 * Wraps `fetch` with retry on transient failures.
 * Retries on:
 *   - Network errors (fetch throws — TypeError, DNS, abort)
 *   - 5xx server errors
 *   - 429 rate-limit
 * Does NOT retry on:
 *   - 4xx client errors (other than 429)
 *   - 2xx / 3xx responses (returned as-is, even non-OK 3xx)
 */
export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, opts: RetryOptions = {}): Promise<Response> {
  const ctx = opts.context ?? `fetch ${typeof input === 'string' ? input : input.toString()}`
  return withRetry(async () => {
    const res = await fetch(input, init)
    if (res.status >= 500 || res.status === 429) {
      // Convert to error so withRetry sees a failure
      throw new Error(`HTTP ${res.status}`)
    }
    return res
  }, { ...opts, context: ctx })
}
