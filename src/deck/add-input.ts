// Search input wired in the deck-builder header. Hits the searchCards
// API (debounced) and lets the user pick a card to add to the current
// deck section.

import type { YGOCard } from '../types'
import { DEBOUNCE_MS } from '../constants'
import { escapeHtml, isExtraDeckType } from '../utils'
import { appLog } from '../logger'
import { searchCards } from '../api'
import { deps, currentDeck, getCardData, addIdToDeck } from './state'
import { renderDeckSection, renderDeckWarnings } from './builder-view'

export function wireDeckBuilderAddInput(): void {
  const input = document.getElementById('dbAddInput') as HTMLInputElement
  const sectionSelect = document.getElementById('dbAddSection') as HTMLSelectElement
  const sugList = document.getElementById('dbSuggestions') as HTMLUListElement
  let lastQuery = ''
  let timer: number | undefined

  const hide = (): void => { sugList.hidden = true; sugList.innerHTML = '' }

  const pick = (card: YGOCard): void => {
    const deck = currentDeck()
    if (!deck) return
    deps().cardCache.set(card.id, card)
    deps().saveCardCache()
    let section = sectionSelect.value as 'auto' | 'main' | 'extra' | 'side'
    if (section === 'auto') section = isExtraDeckType(card.type) ? 'extra' : 'main'
    addIdToDeck(deck, section, card.id)
    appLog('info', `Deck « ${deck.name} » : +${card.name} → ${section}`)
    input.value = ''
    hide()
    // First, render the specific section (important: do this BEFORE render() to update DOM)
    renderDeckSection(section)
    // Update count in DOM immediately
    const titleCount = deps().deckBuilderBody.querySelector(`.deck-section[data-section="${section}"] .deck-section-count`)
    if (titleCount) titleCount.textContent = String(deck[section].length)
    // Refresh banlist warnings panel
    renderDeckWarnings()
    // Then update global stats (counts, view state, etc.)
    deps().render()
  }

  input.addEventListener('input', () => {
    const q = input.value.trim()
    if (!q) { hide(); return }
    window.clearTimeout(timer)
    timer = window.setTimeout(async () => {
      if (q === lastQuery) return
      lastQuery = q
      if (/^\d{4,}$/.test(q)) {
        const card = await getCardData(Number(q))
        if (!card) { sugList.innerHTML = `<li class="suggestion-empty">Aucune carte pour ID ${q}</li>`; sugList.hidden = false; return }
        sugList.innerHTML = `<li class="suggestion db-suggestion" data-id="${card.id}">
          <img src="${escapeHtml(card.card_images?.[0]?.image_url_small ?? '')}" alt="" />
          <div><div>${escapeHtml(card.name)}</div><div class="muted small">${card.id} · ${escapeHtml(card.type ?? '')}</div></div>
        </li>`
        sugList.hidden = false
        sugList.querySelector<HTMLElement>('.db-suggestion')?.addEventListener('click', () => pick(card))
        return
      }
      try {
        const results = await searchCards(q)
        if (!results.length) { sugList.innerHTML = `<li class="suggestion-empty">Aucun résultat</li>`; sugList.hidden = false; return }
        sugList.innerHTML = results.slice(0, 8).map((c) => `
          <li class="suggestion db-suggestion" data-id="${c.id}">
            <img src="${escapeHtml(c.card_images?.[0]?.image_url_small ?? '')}" alt="" />
            <div><div>${escapeHtml(c.name)}</div><div class="muted small">${c.id} · ${escapeHtml(c.type ?? '')}</div></div>
          </li>`).join('')
        sugList.hidden = false
        sugList.querySelectorAll<HTMLElement>('.db-suggestion').forEach((li) => {
          li.addEventListener('click', () => {
            const card = results.find((r) => r.id === Number(li.dataset.id))!
            pick(card)
          })
        })
      } catch (err) {
        appLog('error', 'Deck builder search', String(err))
      }
    }, DEBOUNCE_MS)
  })

  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide() })
}
