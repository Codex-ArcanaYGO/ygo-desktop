// Small set of helpers that turn the dozens of `catch { /* ignore */ }`
// scattered across the codebase into observable, log-emitting operations.
//
// Design goals:
//  • One-liner replacements for the most common silent-catch patterns.
//  • Every swallowed error produces an `appLog` entry with a context tag,
//    so production debugging stops being guesswork.
//  • Quota errors on localStorage are tagged distinctly (warn, not error).

import { appLog } from '../logger'
import type { LogLevel } from '../types'

// ─── Async catch-arms ────────────────────────────────────────────────────────

/**
 * Drop-in for `.catch(() => {})`. Logs the rejection with a context tag.
 *
 *     fetch(url).catch(swallow('imageCache.fetch'))
 */
export function swallow(context: string, level: LogLevel = 'warn'): (err: unknown) => void {
  return (err) => {
    appLog(level, `[swallow] ${context}`, _serialise(err))
  }
}

// ─── localStorage wrappers ───────────────────────────────────────────────────

/**
 * `localStorage.setItem` with QuotaExceededError detection.
 * Returns true on success; quota failures are logged as `warn`, other failures as `error`.
 */
export function safeStorageSet(key: string, value: string, context: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    const isQuota = _isQuotaError(err)
    appLog(isQuota ? 'warn' : 'error', `localStorage.setItem failed (${context})`, {
      key,
      quota: isQuota,
      bytes: value.length,
      error: _serialise(err),
    })
    return false
  }
}

/**
 * Reads a JSON-encoded value from localStorage. Returns `fallback` on any failure
 * (missing key, parse error, JSON shape mismatch) and logs the cause when it
 * was not simply absent.
 */
export function safeStorageGetJSON<T>(key: string, fallback: T, context: string): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch (err) {
    appLog('warn', `localStorage parse failed (${context})`, {
      key,
      error: _serialise(err),
    })
    return fallback
  }
}

/** `localStorage.removeItem` with logging. Errors are rare but reported. */
export function safeStorageRemove(key: string, context: string): void {
  try { localStorage.removeItem(key) }
  catch (err) {
    appLog('warn', `localStorage.removeItem failed (${context})`, {
      key,
      error: _serialise(err),
    })
  }
}

// ─── Sync block wrapper ──────────────────────────────────────────────────────

/**
 * Runs `fn` synchronously; on throw, logs with the given context and returns `fallback`.
 *
 *     const cards = runSafe('hydrate.cards', () => parseCache(raw), [])
 */
export function runSafe<T>(
  context: string,
  fn:      () => T,
  fallback: T,
  level:   LogLevel = 'warn',
): T {
  try { return fn() }
  catch (err) {
    appLog(level, `runSafe failed (${context})`, _serialise(err))
    return fallback
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

function _isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name ?? ''
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  const msg = (err as { message?: string }).message ?? ''
  return /quota|storage.*full/i.test(msg)
}

function _serialise(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  if (typeof err === 'string') return err
  try { return JSON.stringify(err) } catch { return String(err) }
}
