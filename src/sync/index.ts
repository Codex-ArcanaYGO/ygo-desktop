// Public entrypoint for the sync subsystem.
//
// Usage from existing persistence/CRUD code:
//
//   import { syncCollection, syncWishlist, syncDecks, syncDeleteCollection } from './sync'
//
//   syncCollection(card)      // mirror an upsert into the CRDT store
//   syncDeleteCollection(card) // tombstone
//
// Keys:
//   - collection / wishlist: `${cardId}` (one record per Konami ID, value holds editions[])
//   - decks: `${deck.id}`

import type { CollectionCard, WishlistCard, DeckBuild } from '../types'
import { getSync } from './engine'

export { getSync } from './engine'
export type { SyncRecord } from './store'

function collectionKey(c: CollectionCard): string { return String(c.id) }
function wishlistKey  (w: WishlistCard):   string { return String(w.id) }
function deckKey      (d: DeckBuild):      string { return d.id }

export function syncCollection(card: CollectionCard): void {
  getSync().collection.put(collectionKey(card), card)
}

export function syncDeleteCollection(card: Pick<CollectionCard, 'id'>): void {
  getSync().collection.put(String(card.id), null)
}

export function syncWishlist(card: WishlistCard): void {
  getSync().wishlist.put(wishlistKey(card), card)
}

export function syncDeleteWishlist(card: Pick<WishlistCard, 'id'>): void {
  getSync().wishlist.put(String(card.id), null)
}

export function syncDeck(deck: DeckBuild): void {
  getSync().decks.put(deckKey(deck), deck)
}

export function syncDeleteDeck(deckId: string): void {
  getSync().decks.put(deckId, null)
}

/** Replace the whole collection with a fresh array (used on bulk imports). */
export function syncReplaceCollection(cards: CollectionCard[]): void {
  const sync = getSync()
  const existing = new Set(sync.collection.values().map((c) => String(c.id)))
  for (const c of cards) {
    sync.collection.put(String(c.id), c)
    existing.delete(String(c.id))
  }
  for (const id of existing) sync.collection.put(id, null)
}
