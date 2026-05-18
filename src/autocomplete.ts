import type { YGOCard, View } from './types'
import { DEBOUNCE_MS, SUGGESTION_LIMIT, SEARCH_HISTORY_MAX, SEARCH_HISTORY_KEY } from './constants'
import { escapeHtml } from './utils'
import { searchCards, fetchById, fetchFrById } from './api'
import { addToWishlist } from './wishlist'
import { openEditionPicker } from './modal'
import { handleAdd } from './collection-crud'
import { startSpan, endSpan, recordCounter } from './telemetry'

export interface AutocompleteDeps {
  cardInput: HTMLInputElement
  suggestionsEl: HTMLUListElement
  pinnedPrefix: () => string
  applyPin: (prefix: string) => void
  showToast: (msg: string, kind?: 'success' | 'error', withUndo?: boolean) => void
  hideError: () => void
  resetInput: () => void
  getCollection: () => { id: number }[]
  currentView: () => View
  hideDeckPopover: () => void
}

let deps!: AutocompleteDeps
let suggestionCards: YGOCard[] = []
let suggestionTimer: ReturnType<typeof setTimeout> | null = null
let activeSuggestionIdx = -1
let searchHistory: string[] = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) ?? '[]')
let searchHistoryIdx = -1
let lastKeyWasBackspace = false

export function pushSearchHistory(query: string): void {
  const q = query.trim()
  if (!q) return
  searchHistory = searchHistory.filter((x) => x !== q)
  searchHistory.unshift(q)
  if (searchHistory.length > SEARCH_HISTORY_MAX) searchHistory.length = SEARCH_HISTORY_MAX
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory))
  searchHistoryIdx = -1
}

export function fullQuery(): string {
  return (deps.pinnedPrefix() + deps.cardInput.value).trim()
}

export function hideSuggestions(): void {
  deps.suggestionsEl.hidden = true
  deps.suggestionsEl.innerHTML = ''
  suggestionCards = []
  activeSuggestionIdx = -1
}

export function initAutocomplete(d: AutocompleteDeps): void {
  deps = d

  deps.cardInput.addEventListener('input', () => {
    const q = fullQuery()
    if (suggestionTimer) clearTimeout(suggestionTimer)
    deps.hideError()
    if (q.length < 1) { hideSuggestions(); return }
    suggestionTimer = setTimeout(() => void runSuggestions(q), DEBOUNCE_MS)
  })

  deps.cardInput.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && deps.cardInput.value === '' && deps.pinnedPrefix()) {
      if (lastKeyWasBackspace) {
        deps.applyPin('')
        deps.showToast('Préfixe épinglé retiré', 'success')
      }
      lastKeyWasBackspace = true
    } else {
      lastKeyWasBackspace = false
    }

    if (e.key === 'Tab') {
      const current = deps.cardInput.value.trim()
      if (current) {
        e.preventDefault()
        hideSuggestions()
        const pp = deps.pinnedPrefix()
        if (pp && current.startsWith(pp)) {
          deps.applyPin('')
          deps.showToast('Préfixe épinglé retiré', 'success')
        } else {
          deps.applyPin(current)
          deps.cardInput.value = ''
          deps.showToast(`Préfixe épinglé : « ${current} »`, 'success')
        }
      }
      return
    }

    if (deps.suggestionsEl.hidden) {
      if (e.key === 'Enter') { e.preventDefault(); void handleAdd() }
      else if (e.key === 'ArrowUp') {
        e.preventDefault()
        searchHistoryIdx = Math.min(searchHistoryIdx + 1, searchHistory.length - 1)
        const historyItem = searchHistory[searchHistoryIdx] ?? ''
        const pp = deps.pinnedPrefix()
        deps.cardInput.value = pp && historyItem.startsWith(pp)
          ? historyItem.slice(pp.length)
          : historyItem
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (searchHistoryIdx > 0) {
          searchHistoryIdx--
          const historyItem = searchHistory[searchHistoryIdx]
          const pp = deps.pinnedPrefix()
          deps.cardInput.value = pp && historyItem.startsWith(pp)
            ? historyItem.slice(pp.length)
            : historyItem
        } else {
          searchHistoryIdx = -1
          deps.cardInput.value = ''
        }
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeSuggestionIdx = Math.min(activeSuggestionIdx + 1, suggestionCards.length - 1)
      refreshActiveSuggestion()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeSuggestionIdx = Math.max(activeSuggestionIdx - 1, 0)
      refreshActiveSuggestion()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeSuggestionIdx >= 0) void pickFromSuggestion(suggestionCards[activeSuggestionIdx])
      else void handleAdd()
    } else if (e.key === 'Escape') {
      hideSuggestions()
    }
  })

  document.addEventListener('click', (e) => {
    const target = e.target as Element
    if (!target.closest('.search-card')) hideSuggestions()
    if (!target.closest('#deckPopover') && !target.closest('[data-action="deck"]')) deps.hideDeckPopover()
  })
}

async function pickFromSuggestion(card: YGOCard): Promise<void> {
  const q = fullQuery()
  pushSearchHistory(q)
  hideSuggestions()
  deps.resetInput()
  const [frCard, enCard] = await Promise.all([
    fetchFrById(card.id).then((c) => c ?? card),
    fetchById(card.id).then((c) => c ?? card),
  ])
  if (deps.currentView() === 'wishlist') {
    addToWishlist(frCard, enCard, 1)
    return
  }
  openEditionPicker(frCard, enCard)
}

async function runSuggestions(q: string): Promise<void> {
  const span = startSpan('ygo.autocomplete.suggestions', { 'ygo.query': q.slice(0, 50) })
  recordCounter('ygo.autocomplete.search')
  try {
    const results = await searchCards(q)
    endSpan(span, { attributes: { 'ygo.result_count': results.length } })
    suggestionCards = results.slice(0, SUGGESTION_LIMIT)
    if (!suggestionCards.length) { hideSuggestions(); return }

    const collection = deps.getCollection()
    deps.suggestionsEl.innerHTML = suggestionCards
      .map(
        (c, i) => {
          const owned = collection.some((x) => x.id === c.id)
          return `
        <li data-idx="${i}"${owned ? ' class="sug-owned-item"' : ''}>
          <img src="${escapeHtml(c.card_images?.[0]?.image_url_small)}" alt="" loading="lazy" />
          <div class="sug-name">${escapeHtml(c.name)}${owned ? '<span class="sug-owned-badge">Possédé</span>' : ''}</div>
          <span class="sub">${escapeHtml(c.type ?? '')}</span>
        </li>`
        }
      )
      .join('')

    deps.suggestionsEl.hidden = false
    activeSuggestionIdx = -1

    deps.suggestionsEl.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
      li.addEventListener('click', () => {
        void pickFromSuggestion(suggestionCards[Number(li.dataset.idx)])
      })
    })
  } catch (err) {
    endSpan(span, { error: String(err) })
    console.error(err)
  }
}

function refreshActiveSuggestion(): void {
  deps.suggestionsEl.querySelectorAll('li').forEach((li, i) => {
    li.classList.toggle('active', i === activeSuggestionIdx)
  })
}
