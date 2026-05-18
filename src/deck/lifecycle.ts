// Deck-builder modal open/close + creation. Kept small so list-view and
// other sub-modules can import without circular issues.

import type { DeckBuild } from '../types'
import { newId } from '../utils'
import { appLog } from '../logger'
import {
  deps, setCurrentDeckBuildId, getCurrentDeckBuildId, currentDeck, getCardData,
} from './state'
import { renderDeckBuilder } from './builder-view'

export function createDeckBuild(name: string): DeckBuild {
  const now = Date.now()
  const d: DeckBuild = { id: newId(), name, main: [], extra: [], side: [], createdAt: now, updatedAt: now }
  deps().getDeckBuilds().unshift(d)
  deps().saveDeckBuilds()
  appLog('info', `Deck créé : « ${name} »`)
  return d
}

export function openDeckBuilder(id: string): void {
  setCurrentDeckBuildId(id)
  deps().deckBuilderModal.hidden = false
  renderDeckBuilder()
}

export function closeDeckBuilder(): void {
  setCurrentDeckBuildId(null)
  deps().deckBuilderModal.hidden = true
}

export function isDeckBuilderOpen(): boolean { return !deps().deckBuilderModal.hidden }

export function prefetchDeckCards(): void {
  const allIds = new Set<number>()
  for (const d of deps().getDeckBuilds()) {
    for (const id of d.main)  allIds.add(id)
    for (const id of d.extra) allIds.add(id)
    for (const id of d.side)  allIds.add(id)
  }
  const missing = [...allIds].filter((id) => !deps().cardCache.has(id))
  if (missing.length) {
    appLog('info', `Pré-chargement de ${missing.length} cartes de deck…`)
    Promise.all(missing.map((id) => getCardData(id))).then(() => {
      if (getCurrentDeckBuildId()) renderDeckBuilder()
      else deps().render()
    })
  }
}

// Re-export the helper for sub-modules that need to inspect the current deck.
export { currentDeck, getCurrentDeckBuildId }
