// Mirror sync store state back into the legacy localStorage blobs.
// Called whenever a remote pull merges new records, so existing UI code
// (which reads from localStorage on demand) sees the fresh data.

import { STORAGE_KEY, WISHLIST_KEY, DECK_BUILDS_KEY } from '../constants'
import type { CollectionCard, WishlistCard, DeckBuild } from '../types'
import { getSync } from './engine'

export function mirrorToLocalStorage(): void {
  const sync = getSync()
  const collection: CollectionCard[] = sync.collection.values()
  const wishlist:   WishlistCard[]   = sync.wishlist.values()
  const decks:      DeckBuild[]      = sync.decks.values()
  try {
    localStorage.setItem(STORAGE_KEY,     JSON.stringify(collection))
    localStorage.setItem(WISHLIST_KEY,    JSON.stringify(wishlist))
    localStorage.setItem(DECK_BUILDS_KEY, JSON.stringify(decks))
    // Notify same-tab listeners (storage event only fires across tabs).
    window.dispatchEvent(new CustomEvent('ygo:sync:remote-update'))
  } catch { /* ignore */ }
}
