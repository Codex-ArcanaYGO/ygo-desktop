// Centralised application state — Preact signals.
//
// Goals:
//   • Single source of truth for collection / wishlist / decks / view / lang / toast / theme.
//   • Components subscribe via signal reads inside JSX (or via .value in effects).
//   • Persistence is delegated to existing src/persistence.ts (vanilla layer).
//
// During the Preact migration, legacy modules continue to mutate plain arrays
// imported from this file via `getCollection()` / `getWishlist()` getters.
// Those getters return the signals' current value, so legacy code keeps working
// while new components subscribe reactively. When we mutate, we should use the
// `setCollection / setWishlist` helpers so signals re-render.

import { signal, computed } from '@preact/signals'
import type { CollectionCard, WishlistCard, LangPref, ArchetypeSortKey } from '../types'
import { safeStorageGetJSON, safeStorageSet } from '../lib/safe'

export type ViewName = 'collection' | 'wishlist' | 'decks' | 'archetypes' | 'settings'
export type ThemeName = 'light' | 'dark' | 'system'

export const collectionSig = signal<CollectionCard[]>([])
export const wishlistSig   = signal<WishlistCard[]>([])
export const decksSig      = signal<string[]>([])
export const viewSig       = signal<ViewName>('collection')
export const langSig       = signal<LangPref>('fr')
export const themeSig      = signal<ThemeName>('system')
export const archetypeSortSig = signal<ArchetypeSortKey>('name')

export const totalCardsSig = computed(() =>
  collectionSig.value.reduce(
    (sum, c) => sum + c.editions.reduce((s, e) => s + (e.qty || 0), 0),
    0,
  ),
)

// ─── Toast queue ─────────────────────────────────────────────────────────────

export interface ToastEntry {
  id:      number
  message: string
  kind:    'success' | 'error' | 'info'
}
export const toastSig = signal<ToastEntry[]>([])
let _toastSeq = 0

export function pushToast(message: string, kind: ToastEntry['kind'] = 'success'): void {
  const id = ++_toastSeq
  toastSig.value = [...toastSig.value, { id, message, kind }]
  setTimeout(() => {
    toastSig.value = toastSig.value.filter((t) => t.id !== id)
  }, kind === 'error' ? 4500 : 2800)
}

// ─── Card-modal context ──────────────────────────────────────────────────────
// When `cardModalSig.value !== null`, the universal <CardModal /> renders.
// `source` lets the modal tailor its actions (edit qty for collection, "promote
// to collection" for wishlist, "voir l'archétype" for archetype view).

export interface CardModalContext {
  cardId:  number
  source:  'collection' | 'wishlist' | 'archetype' | 'search'
}
export const cardModalSig = signal<CardModalContext | null>(null)

export function openCard(cardId: number, source: CardModalContext['source']): void {
  cardModalSig.value = { cardId, source }
}
export function closeCard(): void {
  cardModalSig.value = null
}

// ─── Pinned archetypes ────────────────────────────────────────────────────────

const PINNED_ARCHETYPES_KEY = 'ygo_pinned_archetypes'

function _loadPinnedArchetypes(): Set<string> {
  const arr = safeStorageGetJSON<string[]>(PINNED_ARCHETYPES_KEY, [], 'pinnedArchetypes.load')
  return new Set(arr)
}

export const pinnedArchetypesSig = signal<Set<string>>(_loadPinnedArchetypes())

export function togglePinnedArchetype(name: string): void {
  const next = new Set(pinnedArchetypesSig.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  pinnedArchetypesSig.value = next
  safeStorageSet(PINNED_ARCHETYPES_KEY, JSON.stringify([...next]), 'pinnedArchetypes.save')
}
