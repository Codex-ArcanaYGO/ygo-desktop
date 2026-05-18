// ─── Backup / Restore (JSON Export & Import) ─────────────────────────────────
//
// Phase 1 of the persistence layer: a self-contained, infrastructure-free
// snapshot of every relevant localStorage key, packaged as a single JSON file.
// Used as a safety-net backup of the local data and as a manual migration tool
// between machines until the SQLite (Tauri) and remote Postgres layers land.

import {
  STORAGE_KEY, WISHLIST_KEY, DECKS_KEY, DECK_BUILDS_KEY, CARD_CACHE_KEY,
  THEME_KEY, LANG_KEY, PIN_KEY, LOGS_KEY, SEARCH_HISTORY_KEY, VIEW_KEY,
  SUGG_HISTORY_KEY,
} from './constants'
import { appLog } from './logger'
import { runSafe } from './lib/safe'
import { downloadFile } from './lib/download'

/** Keys persisted into a backup file (everything user-state related). */
const BACKUP_KEYS: readonly string[] = [
  STORAGE_KEY, WISHLIST_KEY, DECKS_KEY, DECK_BUILDS_KEY, CARD_CACHE_KEY,
  THEME_KEY, LANG_KEY, PIN_KEY, LOGS_KEY, SEARCH_HISTORY_KEY, VIEW_KEY,
  SUGG_HISTORY_KEY,
] as const

export const BACKUP_FORMAT_VERSION = 1

export interface BackupFile {
  app: 'ygo-collection'
  version: number
  exportedAt: string
  data: Record<string, string>
}

/** Build a serialisable snapshot of every backup-eligible localStorage key. */
export function buildBackup(): BackupFile {
  const data: Record<string, string> = {}
  for (const k of BACKUP_KEYS) {
    const v = localStorage.getItem(k)
    if (v !== null) data[k] = v
  }
  return {
    app: 'ygo-collection',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }
}

/** Trigger a browser download of the current backup as a JSON file. */
export function downloadBackup(): void {
  const json = JSON.stringify(buildBackup(), null, 2)
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  downloadFile(json, `ygo-collection-backup-${ts}.json`, 'application/json')
  appLog('info', 'Backup exporté', [`${Object.keys(buildBackup().data).length} clés`])
}

export type ImportMode = 'replace' | 'merge'

export interface ImportResult {
  keysWritten: number
  cardsMerged?: number
  wishlistMerged?: number
  decksMerged?: number
}

/** Validate that an unknown JSON value is a usable BackupFile. */
function isBackupFile(v: unknown): v is BackupFile {
  if (!v || typeof v !== 'object') return false
  const o = v as Partial<BackupFile>
  return (
    o.app === 'ygo-collection' &&
    typeof o.version === 'number' &&
    !!o.data && typeof o.data === 'object'
  )
}

/**
 * Apply a backup to localStorage.
 *  - 'replace' overwrites each known key with the backup's value.
 *  - 'merge'   unions collections by id and sums quantities; other keys fall
 *              back to 'replace' semantics when missing locally.
 */
export function applyBackup(raw: string, mode: ImportMode): ImportResult {
  const parsed = JSON.parse(raw) as unknown
  if (!isBackupFile(parsed)) throw new Error('Format invalide')
  const backup = parsed
  const result: ImportResult = { keysWritten: 0 }

  if (mode === 'replace') {
    for (const k of BACKUP_KEYS) {
      const v = backup.data[k]
      if (v !== undefined) { localStorage.setItem(k, v); result.keysWritten++ }
    }
    appLog('info', 'Backup importé (replace)', [`${result.keysWritten} clés`])
    return result
  }

  // merge mode
  result.cardsMerged    = mergeCollection(backup.data[STORAGE_KEY])
  result.wishlistMerged = mergeWishlist(backup.data[WISHLIST_KEY])
  result.decksMerged    = mergeDecks(backup.data[DECKS_KEY], backup.data[DECK_BUILDS_KEY])

  // Card cache: take union (incoming wins on conflict — likely fresher names/prices).
  mergeCardCache(backup.data[CARD_CACHE_KEY])

  // Single-value preference keys: only set when missing locally.
  for (const k of [THEME_KEY, LANG_KEY, PIN_KEY, VIEW_KEY] as const) {
    if (backup.data[k] !== undefined && localStorage.getItem(k) === null) {
      localStorage.setItem(k, backup.data[k])
    }
  }
  result.keysWritten =
    (result.cardsMerged ? 1 : 0) +
    (result.wishlistMerged ? 1 : 0) +
    (result.decksMerged ? 1 : 0)
  appLog('info', 'Backup importé (merge)', [JSON.stringify(result)])
  return result
}

// ─── Merge helpers ───────────────────────────────────────────────────────────

interface IdEntity { id: number }

function safeParseArray<T>(raw: string | undefined): T[] {
  if (!raw) return []
  return runSafe('backup.parseArray', () => {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v as T[] : []
  }, [] as T[])
}

function mergeCollection(incomingRaw: string | undefined): number {
  if (!incomingRaw) return 0
  type Edition = { setCode: string; setName: string; rarity: string; qty: number }
  type Card = IdEntity & { editions?: Edition[]; addedAt?: number; [k: string]: unknown }
  const current = safeParseArray<Card>(localStorage.getItem(STORAGE_KEY) ?? undefined)
  const incoming = safeParseArray<Card>(incomingRaw)
  const byId = new Map<number, Card>(current.map((c) => [c.id, c]))
  let merged = 0
  for (const inc of incoming) {
    const local = byId.get(inc.id)
    if (!local) { byId.set(inc.id, inc); merged++; continue }
    // Sum editions by setCode (case-insensitive).
    const eds = new Map<string, Edition>()
    for (const e of (local.editions ?? [])) eds.set(e.setCode.toLowerCase(), { ...e })
    for (const e of (inc.editions ?? [])) {
      const key = e.setCode.toLowerCase()
      const ex = eds.get(key)
      if (ex) ex.qty = Math.max(ex.qty, e.qty)
      else eds.set(key, { ...e })
    }
    local.editions = Array.from(eds.values())
    if ((inc.addedAt ?? 0) > (local.addedAt ?? 0)) local.addedAt = inc.addedAt
    merged++
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(byId.values())))
  return merged
}

function mergeWishlist(incomingRaw: string | undefined): number {
  if (!incomingRaw) return 0
  type WishCard = IdEntity & { wantedQty?: number; [k: string]: unknown }
  const current = safeParseArray<WishCard>(localStorage.getItem(WISHLIST_KEY) ?? undefined)
  const incoming = safeParseArray<WishCard>(incomingRaw)
  const byId = new Map<number, WishCard>(current.map((c) => [c.id, c]))
  let merged = 0
  for (const inc of incoming) {
    const local = byId.get(inc.id)
    if (!local) { byId.set(inc.id, inc); merged++; continue }
    local.wantedQty = Math.max(local.wantedQty ?? 0, inc.wantedQty ?? 0)
    merged++
  }
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(Array.from(byId.values())))
  return merged
}

function mergeDecks(decksRaw: string | undefined, buildsRaw: string | undefined): number {
  if (decksRaw) {
    const cur = safeParseArray<string>(localStorage.getItem(DECKS_KEY) ?? undefined)
    const inc = safeParseArray<string>(decksRaw)
    const union = Array.from(new Set([...cur, ...inc]))
    localStorage.setItem(DECKS_KEY, JSON.stringify(union))
  }
  if (!buildsRaw) return 0
  type Build = { id: string; name: string; [k: string]: unknown }
  const cur = safeParseArray<Build>(localStorage.getItem(DECK_BUILDS_KEY) ?? undefined)
  const inc = safeParseArray<Build>(buildsRaw)
  const byId = new Map<string, Build>(cur.map((b) => [b.id, b]))
  let merged = 0
  for (const b of inc) {
    if (!byId.has(b.id)) { byId.set(b.id, b); merged++ }
  }
  localStorage.setItem(DECK_BUILDS_KEY, JSON.stringify(Array.from(byId.values())))
  return merged
}

function mergeCardCache(incomingRaw: string | undefined): void {
  if (!incomingRaw) return
  try {
    const cur = JSON.parse(localStorage.getItem(CARD_CACHE_KEY) ?? '[]') as [number, unknown][]
    const inc = JSON.parse(incomingRaw) as [number, unknown][]
    const m = new Map<number, unknown>(cur)
    for (const [k, v] of inc) m.set(k, v)
    localStorage.setItem(CARD_CACHE_KEY, JSON.stringify(Array.from(m.entries())))
  } catch (err) {
    appLog('warn', 'backup.mergeCardCache: cache non fusionnable (récupérable via API)', String(err))
  }
}

/** Prompt the user to pick a backup file and return its text content. */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onerror = () => resolve(null)
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.readAsText(file)
    })
    input.click()
  })
}
