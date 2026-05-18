// All localStorage / sessionStorage read+write helpers used by main.ts.
// Pure functions: state lives in main.ts; this module only knows how to
// serialize and migrate.

import type { CollectionCard, WishlistCard, DeckBuild, YGOCard, OwnedEdition, HistoryEntry } from './types'
import {
  STORAGE_KEY, WISHLIST_KEY, DECKS_KEY, DECK_BUILDS_KEY, CARD_CACHE_KEY,
  ACTION_HISTORY_KEY, CARD_CACHE_MAX,
} from './constants'
import { appLog } from './logger'
import { runSafe, safeStorageSet } from './lib/safe'
import { LRUMap } from './lib/lru-map'
import { syncReplaceCollection, syncWishlist, syncDeleteWishlist, syncDeck, syncDeleteDeck, getSync } from './sync'

// ─── Collection (with v0 migration) ──────────────────────────────────────────

export function loadCollection(): CollectionCard[] {
  return runSafe('persistence.loadCollection', () => {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown[]
    return raw.map((entry) => {
      const c = entry as CollectionCard & { qty?: number }
      if (Array.isArray(c.editions)) return c
      // legacy: single qty + first set → one OwnedEdition
      const legacyQty = c.qty ?? 1
      const firstSet =
        (c.frSets && c.frSets[0]) ||
        (c.allSets && c.allSets[0])
      const edition: OwnedEdition = firstSet
        ? { setCode: firstSet.set_code, setName: firstSet.set_name, rarity: firstSet.set_rarity, qty: legacyQty }
        : { setCode: '—', setName: 'Inconnue', rarity: '', qty: legacyQty }
      delete c.qty
      c.editions = [edition]
      return c
    })
  }, [])
}

export function saveCollection(c: CollectionCard[]): void {
  safeStorageSet(STORAGE_KEY, JSON.stringify(c), 'persistence.saveCollection')
  // Mirror to CRDT sync layer (no-op if unchanged, queued for backend push).
  syncReplaceCollection(c)
}

// ─── Wishlist ────────────────────────────────────────────────────────────────

export function loadWishlist(): WishlistCard[] {
  return runSafe('persistence.loadWishlist',
    () => JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? '[]') as WishlistCard[],
    [])
}

export function saveWishlist(w: WishlistCard[]): void {
  safeStorageSet(WISHLIST_KEY, JSON.stringify(w), 'persistence.saveWishlist')
  // Mirror wishlist: diff against current sync state and tombstone removals.
  const sync = getSync()
  const existing = new Set(sync.wishlist.values().map((c) => String(c.id)))
  for (const card of w) {
    syncWishlist(card)
    existing.delete(String(card.id))
  }
  for (const id of existing) syncDeleteWishlist({ id: Number(id) })
}

// ─── Decks (legacy string list, kept for backward-compat filter) ─────────────

export function loadDecks(): string[] {
  return runSafe('persistence.loadDecks',
    () => JSON.parse(localStorage.getItem(DECKS_KEY) ?? '[]') as string[],
    [])
}

export function saveDecks(d: string[]): void {
  safeStorageSet(DECKS_KEY, JSON.stringify(d), 'persistence.saveDecks')
}

// ─── Deck builds (with array-shape migration guards) ─────────────────────────

export function loadDeckBuilds(): DeckBuild[] {
  return runSafe('persistence.loadDeckBuilds', () => {
    const raw = JSON.parse(localStorage.getItem(DECK_BUILDS_KEY) ?? '[]') as DeckBuild[]
    return raw.map((d) => ({
      ...d,
      main:  Array.isArray(d.main)  ? d.main  : [],
      extra: Array.isArray(d.extra) ? d.extra : [],
      side:  Array.isArray(d.side)  ? d.side  : [],
    }))
  }, [])
}

export function saveDeckBuilds(d: DeckBuild[]): void {
  safeStorageSet(DECK_BUILDS_KEY, JSON.stringify(d), 'persistence.saveDeckBuilds')
  const sync = getSync()
  const existing = new Set(sync.decks.values().map((deck) => deck.id))
  for (const deck of d) {
    syncDeck(deck)
    existing.delete(deck.id)
  }
  for (const id of existing) syncDeleteDeck(id)
}

// ─── Card cache (LRU-bounded) ────────────────────────────────────────────────

export function loadCardCache(): LRUMap<number, YGOCard> {
  return runSafe('persistence.loadCardCache', () => {
    const raw = JSON.parse(localStorage.getItem(CARD_CACHE_KEY) ?? '[]') as [number, YGOCard][]
    return new LRUMap<number, YGOCard>(CARD_CACHE_MAX, raw)
  }, new LRUMap<number, YGOCard>(CARD_CACHE_MAX))
}

export function saveCardCache(cache: Map<number, YGOCard>): void {
  safeStorageSet(CARD_CACHE_KEY, JSON.stringify([...cache.entries()]), 'persistence.saveCardCache')
}

// ─── Action history (session-scoped) ─────────────────────────────────────────

export function loadActionHistory(): HistoryEntry[] {
  return runSafe('persistence.loadActionHistory',
    () => JSON.parse(sessionStorage.getItem(ACTION_HISTORY_KEY) ?? '[]') as HistoryEntry[],
    [])
}

export function saveActionHistory(h: HistoryEntry[]): void {
  try { sessionStorage.setItem(ACTION_HISTORY_KEY, JSON.stringify(h)) }
  catch (err) { appLog('warn', 'persistence.saveActionHistory: échec sessionStorage', String(err)) }
}
