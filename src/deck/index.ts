// Public entry point for the deck-builder feature. Aggregates all the
// sub-modules and exposes the API previously offered by the monolithic
// `deck-builder.ts`.

import { setDeps, type DeckBuilderDeps } from './state'
import { openYDKImport } from './ydk-import'
import { createDeckBuild, openDeckBuilder, closeDeckBuilder } from './lifecycle'

export type { DeckBuilderDeps } from './state'
export { renderDecksView } from './list-view'
export {
  createDeckBuild, openDeckBuilder, closeDeckBuilder, isDeckBuilderOpen,
  prefetchDeckCards, getCurrentDeckBuildId,
} from './lifecycle'
export { renderDeckBuilder } from './builder-view'
export { openYDKImport } from './ydk-import'

export function initDeckBuilder(d: DeckBuilderDeps): void {
  setDeps(d)
  d.deckCreateNewBtn.addEventListener('click', () => {
    const dk = createDeckBuild(`Nouveau deck ${d.getDeckBuilds().length + 1}`)
    d.render()
    openDeckBuilder(dk.id)
  })
  d.deckImportBtn.addEventListener('click', () => openYDKImport())
  d.deckBuilderModal.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close-deckbuilder]')) closeDeckBuilder()
  })
}
