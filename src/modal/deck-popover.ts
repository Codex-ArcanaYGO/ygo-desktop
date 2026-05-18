// Deck-assignment popover anchored to deck-chip buttons in the collection grid.

import { escapeHtml } from '../utils'
import { setDeck } from '../collection-crud'
import { deps } from './deps'

let _deckPopoverCardId: number | null = null

export function getActiveDeckPopoverCardId(): number | null {
  return _deckPopoverCardId
}

export function initDeckPopover(): void {
  const d = deps()
  d.deckCreateBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const name = d.deckNameInput.value.trim()
    if (!name || _deckPopoverCardId === null) return
    setDeck(_deckPopoverCardId, name)
    hideDeckPopover()
  })

  d.deckNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.stopPropagation(); d.deckCreateBtn.click() }
    if (e.key === 'Escape') hideDeckPopover()
  })
}

export function showDeckPopover(cardId: number, anchor: HTMLElement): void {
  const d = deps()
  if (!d.deckPopoverEl.hidden && _deckPopoverCardId === cardId) { hideDeckPopover(); return }
  _deckPopoverCardId = cardId
  const c = d.getCollection().find((x) => x.id === cardId)!

  d.deckListEl.innerHTML = [
    c.deck
      ? `<li data-dv=""><i class="fa-solid fa-xmark"></i> Retirer du deck</li>`
      : '',
    ...d.getDecks()
      .filter((deck) => deck !== c.deck)
      .map((deck) => `<li data-dv="${escapeHtml(deck)}"><i class="fa-solid fa-folder"></i> ${escapeHtml(deck)}</li>`),
    d.getDecks().length === 0 && !c.deck
      ? `<li class="deck-empty"><i class="fa-solid fa-circle-info"></i> Aucun deck — créez-en un</li>`
      : '',
  ].join('')

  d.deckListEl.querySelectorAll<HTMLLIElement>('[data-dv]').forEach((li) => {
    li.addEventListener('click', (e) => {
      e.stopPropagation()
      setDeck(cardId, li.dataset.dv || null)
      hideDeckPopover()
    })
  })

  d.deckNameInput.value = ''
  const rect = anchor.getBoundingClientRect()
  d.deckPopoverEl.style.top  = `${rect.bottom + 6}px`
  d.deckPopoverEl.style.left = `${Math.min(rect.left, window.innerWidth - 210)}px`
  d.deckPopoverEl.hidden = false
  setTimeout(() => d.deckNameInput.focus(), 50)
}

export function hideDeckPopover(): void {
  deps().deckPopoverEl.hidden = true
  _deckPopoverCardId = null
}
