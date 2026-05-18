// Public API of the archetypes feature — the only thing main.ts touches.
//
// Compatibility wrappers (initArchetypes / loadArchetypes / renderArchetypesView /
// openArchetypeByName) match the legacy signature so the existing bootstrap
// continues to work without further changes.

import { render } from 'preact'
import type { CollectionCard, WishlistCard, YGOCard } from '../../types'
import { ArchetypesView, openArchetypeExternal } from './ArchetypesView'
import { initArchetypeState, loadArchetypeList } from './state'

export interface ArchetypesDeps {
  archetypesPageEl:  HTMLElement
  getCollection:     () => CollectionCard[]
  getWishlist:       () => WishlistCard[]
  showToast:         (msg: string, kind?: 'success' | 'error') => void
  openCardModal:     (id: number) => void
  saveCollection:    () => void
}

let _mountEl: HTMLElement | null = null
let _mounted = false

export function initArchetypes(d: ArchetypesDeps): void {
  _mountEl = d.archetypesPageEl
  initArchetypeState({
    getCollection:       d.getCollection,
    onCollectionMutated: d.saveCollection,
  })
  // d.getWishlist / d.showToast / d.openCardModal are part of the legacy
  // signature — the Preact view consumes wishlistSig & openCard() directly,
  // so these props are intentionally unused here.
  void d.getWishlist
  void d.showToast
  void d.openCardModal
}

export async function loadArchetypes(force = false): Promise<void> {
  await loadArchetypeList(force)
}

export async function renderArchetypesView(): Promise<void> {
  if (!_mountEl) return
  if (!_mounted) {
    render(<ArchetypesView />, _mountEl)
    _mounted = true
  }
}

export function openArchetypeByName(name: string): void {
  openArchetypeExternal(name)
}

export type { YGOCard } // re-export for legacy importers (none today)
