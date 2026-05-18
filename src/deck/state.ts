// Shared module state for the deck-builder feature.
//
// We use module-scoped variables instead of a class to keep call sites
// concise (no `instance.method()` everywhere). All sub-modules import
// from here.

import type { YGOCard, DeckBuild, CollectionCard, WishlistCard } from '../types'
import { fetchById, fetchFrById } from '../api'
import { totalQty } from '../utils'

export interface DeckBuilderDeps {
  getCollection: () => CollectionCard[]
  getWishlist:   () => WishlistCard[]
  getDeckBuilds: () => DeckBuild[]
  setDeckBuilds: (d: DeckBuild[]) => void
  saveDeckBuilds: () => void
  cardCache: Map<number, YGOCard>
  saveCardCache: () => void
  render: () => void
  showToast: (msg: string, kind?: 'success' | 'error', withUndo?: boolean) => void
  deckBuilderModal: HTMLDivElement
  deckBuilderBody: HTMLDivElement
  deckBuildsListEl: HTMLDivElement
  deckCreateNewBtn: HTMLButtonElement
  deckImportBtn: HTMLButtonElement
}

let _deps!: DeckBuilderDeps
let _currentDeckBuildId: string | null = null

export function setDeps(d: DeckBuilderDeps): void { _deps = d }
export function deps(): DeckBuilderDeps { return _deps }

export function getCurrentDeckBuildId(): string | null { return _currentDeckBuildId }
export function setCurrentDeckBuildId(id: string | null): void { _currentDeckBuildId = id }

export function currentDeck(): DeckBuild | null {
  if (!_currentDeckBuildId) return null
  return _deps.getDeckBuilds().find((d) => d.id === _currentDeckBuildId) ?? null
}

export async function getCardData(id: number): Promise<YGOCard | null> {
  const cached = _deps.cardCache.get(id)
  if (cached) return cached
  const card = (await fetchFrById(id)) ?? (await fetchById(id))
  if (card) {
    _deps.cardCache.set(id, card)
    _deps.saveCardCache()
  }
  return card
}

export function ownedCountInCollection(id: number): number {
  const c = _deps.getCollection().find((x) => x.id === id)
  return c ? totalQty(c) : 0
}

export function wishlistQty(id: number): number {
  return _deps.getWishlist().find((w) => w.id === id)?.wantedQty ?? 0
}

export function countInOtherDecks(id: number, excludeDeckId: string): number {
  let n = 0
  for (const d of _deps.getDeckBuilds()) {
    if (d.id === excludeDeckId) continue
    for (const x of d.main)  if (x === id) n++
    for (const x of d.extra) if (x === id) n++
    for (const x of d.side)  if (x === id) n++
  }
  return n
}

export interface DeckUsage {
  deck: DeckBuild
  counts: { main: number; extra: number; side: number; total: number }
}

export function listOtherDeckUsages(id: number, excludeDeckId: string): DeckUsage[] {
  const out: DeckUsage[] = []
  for (const d of _deps.getDeckBuilds()) {
    if (d.id === excludeDeckId) continue
    const main  = d.main.filter((x) => x === id).length
    const extra = d.extra.filter((x) => x === id).length
    const side  = d.side.filter((x) => x === id).length
    const total = main + extra + side
    if (total > 0) out.push({ deck: d, counts: { main, extra, side, total } })
  }
  return out
}

export function addIdToDeck(deck: DeckBuild, section: 'main' | 'extra' | 'side', id: number): void {
  deck[section].push(id)
  deck.updatedAt = Date.now()
  _deps.saveDeckBuilds()
}

export function removeOneFromDeck(deck: DeckBuild, section: 'main' | 'extra' | 'side', id: number): void {
  const arr = deck[section]
  const idx = arr.indexOf(id)
  if (idx >= 0) arr.splice(idx, 1)
  deck.updatedAt = Date.now()
  _deps.saveDeckBuilds()
}
