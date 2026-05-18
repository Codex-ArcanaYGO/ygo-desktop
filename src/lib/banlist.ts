// Banlist management — fetches the current TCG forbidden/limited list from
// YGOPRODeck and caches it in localStorage. Supports offline operation:
// once the list has been fetched at least once, the cached version is used
// when the network is unavailable.
//
// Data source: https://db.ygoprodeck.com/api/v7/cardinfo.php?banlist=tcg
// This returns ALL cards currently on the TCG banlist with their
// `banlist_info.ban_tcg` status ('Banned' | 'Limited' | 'Semi-Limited').
//
// The cache is considered fresh for `BANLIST_TTL_MS` (default: 24h).
// We also expose a sync `getBanStatus(id)` for synchronous rendering.

import { appLog } from '../logger'
import { fetchWithRetry } from './retry'
import { runSafe, safeStorageSet } from './safe'

export type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited'

export interface BanlistData {
  /** map of cardId → ban status */
  cards: Record<number, BanStatus>
  /** unix timestamp of last successful fetch */
  fetchedAt: number
}

const BANLIST_KEY = 'ygo_banlist_tcg_v1'
const BANLIST_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const BANLIST_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?banlist=tcg'

/** Maximum copies allowed per ban status. Banned = 0, Limited = 1, Semi = 2. */
export function maxCopiesForStatus(status: BanStatus | null): number {
  if (status === 'Banned') return 0
  if (status === 'Limited') return 1
  if (status === 'Semi-Limited') return 2
  return 3
}

/** In-memory copy, populated at startup from localStorage. */
let _banlist: BanlistData = { cards: {}, fetchedAt: 0 }
let _loaded = false

/** Read the cached banlist (if any) from localStorage into memory. */
function loadFromStorage(): void {
  if (_loaded) return
  _loaded = true
  const data = runSafe<BanlistData | null>(
    'banlist.loadFromStorage',
    () => {
      const raw = localStorage.getItem(BANLIST_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as BanlistData
      if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.cards) return null
      return parsed
    },
    null,
  )
  if (data) _banlist = data
}

function saveToStorage(): void {
  safeStorageSet(BANLIST_KEY, JSON.stringify(_banlist), 'banlist.saveToStorage')
}

/** Synchronous ban-status lookup. Returns null if card is not on the banlist
 *  (or if banlist hasn't been loaded yet). */
export function getBanStatus(cardId: number): BanStatus | null {
  loadFromStorage()
  return _banlist.cards[cardId] ?? null
}

/** Last fetch timestamp (0 if never). */
export function banlistFetchedAt(): number {
  loadFromStorage()
  return _banlist.fetchedAt
}

/** True if a banlist is available (either from cache or network). */
export function hasBanlist(): boolean {
  loadFromStorage()
  return _banlist.fetchedAt > 0
}

interface ApiCard {
  id: number
  banlist_info?: {
    ban_tcg?: BanStatus
    ban_ocg?: BanStatus
    ban_goat?: BanStatus
  }
}

/** Fetch the TCG banlist from YGOPRODeck. Resolves to true on success.
 *  Skips the network call if the cache is still fresh (< 24h). Always
 *  loads the local cache first so `getBanStatus` works synchronously. */
export async function refreshBanlist(): Promise<boolean> {
  loadFromStorage()
  const age = Date.now() - _banlist.fetchedAt
  if (_banlist.fetchedAt > 0 && age < BANLIST_TTL_MS) {
    // Cache is fresh — no network request needed.
    appLog('debug', `Banlist en cache (${Math.round(age / 60000)} min)`)
    return true
  }
  try {
    const res = await fetchWithRetry(BANLIST_URL, undefined, { context: 'banlist.refresh' })
    if (!res.ok) {
      appLog('error', `Banlist HTTP ${res.status}`)
      return false
    }
    const json = (await res.json()) as { data?: ApiCard[] }
    if (!json.data || !Array.isArray(json.data)) {
      appLog('error', 'Banlist: réponse inattendue')
      return false
    }
    const cards: Record<number, BanStatus> = {}
    for (const c of json.data) {
      const status = c.banlist_info?.ban_tcg
      if (status) cards[c.id] = status
    }
    _banlist = { cards, fetchedAt: Date.now() }
    saveToStorage()
    appLog('info', `Banlist TCG mise à jour : ${Object.keys(cards).length} cartes`)
    return true
  } catch (err) {
    appLog('error', 'Banlist fetch échec', String(err))
    return false
  }
}

/** Ensure the banlist is loaded. Triggers a background refresh if the cache
 *  is missing or stale. Returns immediately — UI can read the cached data
 *  via `getBanStatus`. */
export function ensureBanlist(): void {
  loadFromStorage()
  const age = Date.now() - _banlist.fetchedAt
  if (_banlist.fetchedAt === 0 || age > BANLIST_TTL_MS) {
    // Fire and forget — offline-safe (failure leaves cache untouched).
    void refreshBanlist()
  }
}

/** Sum copies of a given card id across all sections of a deck. */
export function countInDeck(
  deck: { main: number[]; extra: number[]; side: number[] },
  cardId: number,
): number {
  let n = 0
  for (const x of deck.main)  if (x === cardId) n++
  for (const x of deck.extra) if (x === cardId) n++
  for (const x of deck.side)  if (x === cardId) n++
  return n
}

export interface DeckBanIssue {
  cardId: number
  count: number
  status: BanStatus | null
  /** Max copies allowed (0 for Banned, 1 for Limited, 2 for Semi, 3 otherwise). */
  maxAllowed: number
  /** 'banned' (count > 0 of banned card), 'over-limit' (count > max), 'too-many' (count > 3) */
  kind: 'banned' | 'over-limit' | 'too-many'
}

/** Return the list of cards that violate the banlist or the 3-copy rule. */
export function validateDeck(deck: { main: number[]; extra: number[]; side: number[] }): DeckBanIssue[] {
  loadFromStorage()
  const issues: DeckBanIssue[] = []
  const counts = new Map<number, number>()
  for (const id of [...deck.main, ...deck.extra, ...deck.side]) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  for (const [id, count] of counts) {
    const status = _banlist.cards[id] ?? null
    const maxAllowed = maxCopiesForStatus(status)
    if (count > maxAllowed) {
      const kind: DeckBanIssue['kind'] =
        status === 'Banned' ? 'banned'
        : status ? 'over-limit'
        : 'too-many'
      issues.push({ cardId: id, count, status, maxAllowed, kind })
    }
  }
  return issues
}
