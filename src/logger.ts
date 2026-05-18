import { LOGS_KEY, LOGS_MAX } from './constants'
import type { LogEntry, LogLevel } from './types'

/** OTel severity numbers per spec (DEBUG=5, INFO=9, WARN=13, ERROR=17, FATAL=21). */
const SEVERITY_NUMBER: Record<LogLevel, number> = {
  debug: 5, info: 9, warn: 13, error: 17, fatal: 21,
}

let logs: LogEntry[] = (() => {
  try { return JSON.parse(localStorage.getItem(LOGS_KEY) ?? '[]') as LogEntry[] }
  catch { return [] }
})()

/** Get a snapshot of current logs (newest first). */
export function getLogs(): readonly LogEntry[] {
  return logs
}

/** Append a log entry. Also echoes to the browser console. */
export function appLog(
  lvl: LogLevel,
  msg: string,
  data?: unknown,
  attributes?: Record<string, string | number | boolean>,
): void {
  const entry: LogEntry = { ts: Date.now(), lvl, severityNumber: SEVERITY_NUMBER[lvl], msg }
  if (data !== undefined) entry.data = typeof data === 'string' ? data : JSON.stringify(data)
  if (attributes) entry.attributes = attributes
  logs.unshift(entry)
  if (logs.length > LOGS_MAX) logs.length = LOGS_MAX
  try { localStorage.setItem(LOGS_KEY, JSON.stringify(logs)) } catch { /* ignore quota */ }
  const fn = lvl === 'error' || lvl === 'fatal' ? console.error
           : lvl === 'warn'  ? console.warn
           : lvl === 'debug' ? console.debug
           : console.log
  fn(`[YGO ${lvl.toUpperCase()}] ${msg}`, data ?? '')
}

/** Wipe all stored logs. */
export function clearLogs(): void {
  logs = []
  localStorage.removeItem(LOGS_KEY)
}

/** Approximate size of the logs stored in localStorage, in bytes. */
export function logsSizeBytes(): number {
  try {
    const raw = localStorage.getItem(LOGS_KEY) ?? ''
    return new Blob([raw]).size
  } catch { return 0 }
}
