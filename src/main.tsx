import './styles/tokens.css'
import './styles/base.css'
import './styles/legacy.css'

// ─── Module imports ───────────────────────────────────────────────────────────

import type {
  YGOCard,
  CollectionCard, WishlistCard, DeckBuild,
  Theme, LangPref, View,
  HistoryEntry,
} from './types'

import {
  THEME_KEY, LANG_KEY, PIN_KEY, VIEW_KEY,
  HISTORY_MAX,
} from './constants'

import { escapeHtml } from './utils'
import {
  loadCollection, saveCollection as persistCollection,
  loadWishlist, saveWishlist as persistWishlist,
  loadDecks, saveDecks as persistDecks,
  loadDeckBuilds, saveDeckBuilds as persistDeckBuilds,
  loadCardCache, saveCardCache as persistCardCache,
  loadActionHistory, saveActionHistory as persistActionHistory,
} from './persistence'

import {
  initSuggestions,
  renderDeckSuggestions,
  evaluateAllSuggestions,
  rotateSuggestions,
  buildBestDeckFromCollection,
} from './suggestions'
import { initSettings } from './settings'
import { initWishlist, addToWishlist, downloadWishlistCardmarket } from './wishlist'
import {
  initCollectionCrud, addCardToCollection,
} from './collection-crud'
import { initModal, isModalOpen, closeModal, isPickerOpen, closePicker, hideDeckPopover, openModal } from './modal'
import { initRender, render } from './render'
import { initAutocomplete, pushSearchHistory, hideSuggestions } from './autocomplete'
import {
  initDeckBuilder, renderDecksView, closeDeckBuilder,
  createDeckBuild, openDeckBuilder, isDeckBuilderOpen,
  prefetchDeckCards,
} from './deck'
import { initArchetypes, renderArchetypesView, openArchetypeByName } from './features/archetypes'
import { safeStorageSet } from './lib/safe'
import { collectionSig as _collectionSig, wishlistSig as _wishlistSig } from './app/state'

// ─── State ────────────────────────────────────────────────────────────────────

let collection: CollectionCard[] = loadCollection()
let wishlist: WishlistCard[] = loadWishlist()
// Seed Preact signals from persisted state — they are the source of truth for
// .tsx components from now on. Every save() below keeps them in sync.
_collectionSig.value = collection.slice()
_wishlistSig.value   = wishlist.slice()
let currentView: View = ((): View => {
  const v = localStorage.getItem(VIEW_KEY) as View | null
  return v === 'wishlist' || v === 'decks' || v === 'archetypes' ? v : 'collection'
})()
let decks: string[] = loadDecks()
let deckBuilds: DeckBuild[] = loadDeckBuilds()
const cardCache: Map<number, YGOCard> = loadCardCache()
let deckFilter = ''
let langPref: LangPref = (localStorage.getItem(LANG_KEY) as LangPref | null) ?? 'fr'

function saveCollection(): void {
  persistCollection(collection)
  _collectionSig.value = collection.slice()
}
function saveWishlist(): void {
  persistWishlist(wishlist)
  _wishlistSig.value = wishlist.slice()
}
function saveDecks(): void { persistDecks(decks) }
function saveDeckBuilds(): void { persistDeckBuilds(deckBuilds) }
function saveCardCache(): void { persistCardCache(cardCache) }

// ─── History / Undo / Redo ──────────────────────────────────────────────────────

let actionHistory: HistoryEntry[] = loadActionHistory()
let redoHistory: HistoryEntry[] = []

function saveActionHistory(): void { persistActionHistory(actionHistory) }

function pushHistory(label: string, cardId: number, snapshot: CollectionCard | null): void {
  actionHistory.unshift({ id: cardId, label, timestamp: Date.now(), snapshot })
  if (actionHistory.length > HISTORY_MAX) actionHistory.length = HISTORY_MAX
  redoHistory = [] // Clear redo history when a new action is performed
  saveActionHistory()
}

function undoLast(): void {
  const entry = actionHistory.shift()
  if (!entry) return
  // Save the reverse action to redo history
  const redoEntry: HistoryEntry = {
    id: entry.id,
    label: entry.label,
    timestamp: Date.now(),
    snapshot: entry.snapshot === null ? collection.find((c) => c.id === entry.id) ?? null : null,
  }
  redoHistory.unshift(redoEntry)
  // Apply undo
  if (entry.snapshot === null) {
    collection = collection.filter((c) => c.id !== entry.id)
  } else {
    const idx = collection.findIndex((c) => c.id === entry.id)
    if (idx !== -1) collection[idx] = entry.snapshot
    else collection.unshift(entry.snapshot)
  }
  saveCollection()
  render()
  renderHistoryPanel()
  showToast('Action annulée', 'success', false)
  saveActionHistory()
}

function undoEntry(idx: number): void {
  const entry = actionHistory[idx]
  if (!entry) return
  actionHistory.splice(idx, 1)
  if (entry.snapshot === null) {
    collection = collection.filter((c) => c.id !== entry.id)
  } else {
    const i = collection.findIndex((c) => c.id === entry.id)
    if (i !== -1) collection[i] = entry.snapshot
    else collection.unshift(entry.snapshot)
  }
  saveCollection()
  render()
  renderHistoryPanel()
  showToast('Action annulée', 'success', false)
  saveActionHistory()
}

function redoLast(): void {
  const entry = redoHistory.shift()
  if (!entry) return
  // Save the reverse action back to undo history
  const undoEntry: HistoryEntry = {
    id: entry.id,
    label: entry.label,
    timestamp: Date.now(),
    snapshot: entry.snapshot === null ? collection.find((c) => c.id === entry.id) ?? null : null,
  }
  actionHistory.unshift(undoEntry)
  // Apply redo
  if (entry.snapshot === null) {
    collection = collection.filter((c) => c.id !== entry.id)
  } else {
    const idx = collection.findIndex((c) => c.id === entry.id)
    if (idx !== -1) collection[idx] = entry.snapshot
    else collection.unshift(entry.snapshot)
  }
  saveCollection()
  render()
  renderHistoryPanel()
  showToast('Action réappliquée', 'success', false)
  saveActionHistory()
}

// ─── DOM ──────────────────────────────────────────────────────────────────────

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const cardInput        = el<HTMLInputElement>('cardInput')
const suggestionsEl    = el<HTMLUListElement>('suggestions')
const formError        = el<HTMLDivElement>('formError')
const gallery          = el<HTMLElement>('gallery')
const emptyState       = el<HTMLDivElement>('emptyState')
const statCount        = el<HTMLSpanElement>('statCount')
const statValue        = el<HTMLSpanElement>('statValue')
const filterInput      = el<HTMLInputElement>('filterInput')
const sortSelect       = el<HTMLSelectElement>('sortSelect')
const deckFilterSelect = el<HTMLSelectElement>('deckFilter')
const banFilterSelect  = el<HTMLSelectElement>('banFilterSelect')
const modalEl          = el<HTMLDivElement>('modal')
const modalBody        = el<HTMLDivElement>('modalBody')
const toastEl          = el<HTMLDivElement>('toast')
const deckPopoverEl    = el<HTMLDivElement>('deckPopover')
const deckListEl       = el<HTMLUListElement>('deckList')
const deckNameInput    = el<HTMLInputElement>('deckNameInput')
const langToggle       = el<HTMLDivElement>('langToggle')
const pickerEl         = el<HTMLDivElement>('editionPicker')
const pickerBody       = el<HTMLDivElement>('pickerBody')
const pinBtn           = el<HTMLButtonElement>('pinBtn')
const pinPrefixEl      = el<HTMLSpanElement>('pinPrefix')
const viewTabsEl       = el<HTMLElement>('viewTabs')
const countCollectionEl = el<HTMLSpanElement>('countCollection')
const countWishlistEl   = el<HTMLSpanElement>('countWishlist')
const historyBtn       = el<HTMLButtonElement>('historyBtn')
const historyPanel     = el<HTMLDivElement>('historyPanel')
const historyList      = el<HTMLUListElement>('historyList')
const settingsBtn      = el<HTMLButtonElement>('settingsBtn')
const settingsModal    = el<HTMLDivElement>('settingsModal')
const toolbarEl        = el<HTMLElement>('toolbar')
const decksPageEl      = el<HTMLElement>('decksPage')
const archetypesPageEl = el<HTMLElement>('archetypesPage')
const deckBuildsListEl = el<HTMLDivElement>('deckBuildsList')
const deckCreateNewBtn = el<HTMLButtonElement>('deckCreateNewBtn')
const deckImportBtn    = el<HTMLButtonElement>('deckImportBtn')
const deckBuilderModal = el<HTMLDivElement>('deckBuilderModal')
const deckBuilderBody  = el<HTMLDivElement>('deckBuilderBody')
const countDecksEl     = el<HTMLSpanElement>('countDecks')

// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.setAttribute(
    'data-theme',
    theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
  )
  document.querySelectorAll<HTMLButtonElement>('.theme-toggle button').forEach((b) => {
    b.classList.toggle('active', b.dataset.theme === theme)
  })
  localStorage.setItem(THEME_KEY, theme)
}

document.querySelectorAll<HTMLButtonElement>('.theme-toggle button').forEach((b) => {
  b.addEventListener('click', () => applyTheme(b.dataset.theme as Theme))
})

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem(THEME_KEY) === 'system') applyTheme('system')
})

applyTheme((localStorage.getItem(THEME_KEY) as Theme | null) ?? 'system')

// ─── Language toggle ──────────────────────────────────────────────────────────

function applyLang(lang: LangPref): void {
  langPref = lang
  localStorage.setItem(LANG_KEY, lang)
  document.documentElement.setAttribute('data-lang', lang)
  langToggle.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.lang === lang)
  })
  render()
}

langToggle.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
  b.addEventListener('click', () => applyLang(b.dataset.lang as LangPref))
})

applyLang((localStorage.getItem(LANG_KEY) as LangPref | null) ?? 'fr')

// ─── Pin prefix ───────────────────────────────────────────────────────────────

let pinnedPrefix: string = localStorage.getItem(PIN_KEY) ?? ''

function applyPin(prefix: string): void {
  pinnedPrefix = prefix
  if (prefix) {
    localStorage.setItem(PIN_KEY, prefix)
    pinPrefixEl.textContent = prefix
    pinPrefixEl.hidden = false
    pinBtn.classList.add('active')
    pinBtn.title = `Désépingler « ${prefix} »`
    if (cardInput.value.startsWith(prefix)) {
      cardInput.value = cardInput.value.slice(prefix.length)
    }
  } else {
    localStorage.removeItem(PIN_KEY)
    pinPrefixEl.textContent = ''
    pinPrefixEl.hidden = true
    pinBtn.classList.remove('active')
    pinBtn.title = 'Épingler un préfixe'
  }
  cardInput.focus()
}

function resetInput(): void {
  cardInput.value = ''
  hideSuggestions()
  cardInput.focus()
}

pinBtn.addEventListener('click', () => {
  const current = cardInput.value.trim()
  if (!current) {
    showToast('Tapez un préfixe (ex. « MP25- ») puis ré-appuyez sur l\'épingle.', 'error')
    return
  }
  if (pinnedPrefix && current.startsWith(pinnedPrefix)) {
    applyPin('')
    showToast('Préfixe épinglé retiré', 'success')
  } else {
    applyPin(current)
    cardInput.value = ''
    showToast(`Préfixe épinglé : « ${current} »`, 'success')
  }
})

pinPrefixEl.addEventListener('click', () => applyPin(''))

applyPin(pinnedPrefix)

// ─── View tabs ────────────────────────────────────────────────────────────────

function applyView(v: View): void {
  currentView = v
  safeStorageSet(VIEW_KEY, v, 'main.applyView')
  viewTabsEl.querySelectorAll<HTMLButtonElement>('.view-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === v)
  })
  document.documentElement.setAttribute('data-view', v)
  const isDecks = v === 'decks'
  const isArchetypes = v === 'archetypes'
  const isList  = !isDecks && !isArchetypes
  toolbarEl.hidden        = !isList
  gallery.hidden          = !isList
  decksPageEl.hidden      = !isDecks
  archetypesPageEl.hidden = !isArchetypes
  if (isDecks || isArchetypes) emptyState.hidden = true
  filterInput.placeholder = v === 'wishlist' ? 'Filtrer ma wishlist…' : 'Filtrer ma collection…'
  const emptyTitle = emptyState.querySelector('h2')
  const emptyText  = emptyState.querySelector('p')
  if (emptyTitle && emptyText) {
    if (v === 'wishlist') {
      emptyTitle.textContent = 'Votre wishlist est vide'
      emptyText.textContent  = 'Cherchez une carte et ajoutez-la à votre wishlist.'
    } else {
      emptyTitle.textContent = 'Votre collection est vide'
      emptyText.textContent  = 'Cherchez une carte par son nom français pour commencer.'
    }
  }
  render()
}

viewTabsEl.querySelectorAll<HTMLButtonElement>('.view-tab').forEach((b) => {
  b.addEventListener('click', () => applyView(b.dataset.view as View))
})

// ─── Storage delegated to ./persistence ──────────────────────────────────────

// ─── Feedback ─────────────────────────────────────────────────────────────────

function showError(msg: string): void {
  formError.textContent = msg
  formError.hidden = false
}
function hideError(): void {
  formError.hidden = true
}

let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string, kind: 'success' | 'error' = 'success', withUndo = false): void {
  if (toastTimer) clearTimeout(toastTimer)
  toastEl.className = `toast ${kind}`
  toastEl.innerHTML = `<i class="fa-solid fa-${kind === 'success' ? 'circle-check' : 'circle-exclamation'}"></i> ${escapeHtml(msg)}`
  if (withUndo) {
    const undoBtn = document.createElement('button')
    undoBtn.className = 'toast-undo'
    undoBtn.textContent = 'Annuler'
    undoBtn.addEventListener('click', () => { undoLast(); toastEl.hidden = true })
    toastEl.appendChild(undoBtn)
  }
  toastEl.hidden = false
  requestAnimationFrame(() => toastEl.classList.add('show'))
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show')
    setTimeout(() => { toastEl.hidden = true }, 300)
  }, withUndo ? 4000 : 2400)
}

function renderHistoryPanel(): void {
  if (!actionHistory.length) {
    historyList.innerHTML = '<li class="history-empty"><i class="fa-solid fa-inbox"></i> Aucune action récente</li>'
    return
  }
  const fmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  historyList.innerHTML = actionHistory
    .map((e, i) => `
      <li class="history-entry" data-idx="${i}">
        <div class="history-entry-text">
          <span class="history-label">${escapeHtml(e.label)}</span>
          <span class="history-time">${fmt.format(new Date(e.timestamp))}</span>
        </div>
        <button class="btn-undo-entry" data-idx="${i}" title="Annuler cette action">
          <i class="fa-solid fa-rotate-left"></i> Annuler
        </button>
      </li>`)
    .join('')
  historyList.querySelectorAll<HTMLButtonElement>('.btn-undo-entry').forEach((btn) => {
    btn.addEventListener('click', () => undoEntry(Number(btn.dataset.idx)))
  })
}

function displayName(c: CollectionCard): string {
  return langPref === 'en' && c.nameEn ? c.nameEn : c.name
}

// ─── Init wiring ──────────────────────────────────────────────────────────────

initModal({
  getCollection: () => collection,
  getDecks: () => decks,
  saveCollection,
  langPref: () => langPref,
  modalEl, modalBody, pickerEl, pickerBody,
  deckPopoverEl, deckListEl, deckNameInput,
  deckCreateBtn: el<HTMLButtonElement>('deckCreateBtn'),
  openArchetype: (name) => {
    applyView('archetypes')
    openArchetypeByName(name)
  },
})

initWishlist({
  getWishlist: () => wishlist,
  setWishlist: (w) => { wishlist = w },
  saveWishlist,
  saveCollection,
  render,
  showToast,
  addCardToCollection,
})

initCollectionCrud({
  getCollection: () => collection,
  setCollection: (c) => { collection = c },
  saveCollection,
  getDecks: () => decks,
  saveDecks,
  render,
  showToast,
  showError,
  hideError,
  pushHistory,
  pushSearchHistory,
  resetInput,
  fullQuery: () => cardInput.value.trim() ? (pinnedPrefix + cardInput.value).trim() : '',
  displayName,
  currentView: () => currentView,
  modalEl,
})

initDeckBuilder({
  getCollection: () => collection,
  getWishlist:   () => wishlist,
  getDeckBuilds: () => deckBuilds,
  setDeckBuilds: (d) => { deckBuilds = d },
  saveDeckBuilds,
  cardCache,
  saveCardCache,
  render,
  showToast,
  deckBuilderModal, deckBuilderBody, deckBuildsListEl,
  deckCreateNewBtn, deckImportBtn,
})

initRender({
  getCollection: () => collection,
  getWishlist: () => wishlist,
  getDecks: () => decks,
  getDeckBuilds: () => deckBuilds,
  getDeckFilter: () => deckFilter,
  setDeckFilter: (v) => { deckFilter = v },
  langPref: () => langPref,
  currentView: () => currentView,
  filterInput, sortSelect, deckFilterSelect, banFilterSelect,
  gallery, emptyState, statCount, statValue,
  countCollectionEl, countWishlistEl, countDecksEl,
  renderDecksView,
  renderArchetypesView,
})

initArchetypes({
  archetypesPageEl,
  getCollection: () => collection,
  getWishlist:   () => wishlist,
  showToast,
  openCardModal: openModal,
  saveCollection,
})

initAutocomplete({
  cardInput, suggestionsEl,
  pinnedPrefix: () => pinnedPrefix,
  applyPin,
  showToast,
  hideError,
  resetInput,
  getCollection: () => collection,
  currentView: () => currentView,
  hideDeckPopover,
})

initSettings({
  settingsModal, settingsBtn, showToast,
  reloadAfterImport: () => location.reload(),
  wishlistIsEmpty: () => wishlist.length === 0,
  getCollection: () => collection,
  cardCache,
})

;(document.getElementById('wishlistExportTabIcon') as HTMLSpanElement)
  .addEventListener('click', async (e) => {
    e.stopPropagation()
    if (wishlist.length === 0) { showToast('Wishlist vide', 'error'); return }
    await downloadWishlistCardmarket()
    showToast('Wishlist copiée (Cardmarket)', 'success')
  })

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    undoLast()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    redoLast()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    cardInput.focus()
    cardInput.select()
    return
  }
  if (e.key === 'Escape') {
    const stealOverlay = document.getElementById('stealOverlay') as HTMLDivElement | null
    if (stealOverlay && !stealOverlay.hidden) { stealOverlay.hidden = true; return }
    if (isDeckBuilderOpen()) { closeDeckBuilder(); return }
    if (!settingsModal.hidden) { settingsModal.hidden = true; return }
    if (!historyPanel.hidden) {
      historyPanel.classList.remove('open')
      setTimeout(() => { historyPanel.hidden = true }, 280)
    }
    if (isModalOpen()) closeModal()
    if (isPickerOpen()) closePicker()
  }
})

applyView(currentView)

historyBtn.addEventListener('click', () => {
  renderHistoryPanel()
  historyPanel.hidden = false
  requestAnimationFrame(() => historyPanel.classList.add('open'))
})

historyPanel.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-close-history]')) {
    historyPanel.classList.remove('open')
    setTimeout(() => { historyPanel.hidden = true }, 280)
  }
})

el<HTMLButtonElement>('suggestEvaluateBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement
  btn.disabled = true
  const orig = btn.innerHTML
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calcul…'
  await evaluateAllSuggestions()
  btn.disabled = false
  btn.innerHTML = orig
})
el<HTMLButtonElement>('suggestRotateBtn').addEventListener('click', () => rotateSuggestions())
el<HTMLButtonElement>('suggestBuildFromColBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement
  btn.disabled = true
  const orig = btn.innerHTML
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Optimisation…'
  await buildBestDeckFromCollection()
  btn.disabled = false
  btn.innerHTML = orig
})

initSuggestions({
  getCollection: () => collection,
  cardCache,
  saveCardCache,
  totalQty: (c) => (c.editions ?? []).reduce((s, e) => s + e.qty, 0),
  showToast,
  render,
  createDeckBuild,
  saveDeckBuilds,
  openDeckBuilder,
  addToWishlist,
  elements: {
    list:        el<HTMLDivElement>('deckSuggestionsList'),
    search:      el<HTMLInputElement>('suggestSearchInput'),
    history:     el<HTMLDetailsElement>('deckSuggestionsHistory'),
    historyList: el<HTMLDivElement>('deckSuggestionsHistoryList'),
    historyLabel: el<HTMLSpanElement>('suggestHistoryLabel'),
  },
})
renderDeckSuggestions()

prefetchDeckCards()

// ─── Preact bootstrap (universal CardModal) ─────────────────────────────────
import { render as preactRender } from 'preact'
import { CardModal, wireCardModal } from './components/CardModal/CardModal'
import { langSig } from './app/state'

// Mount universal CardModal portal
const cardModalRoot = document.createElement('div')
cardModalRoot.id = 'cardModalRoot'
document.body.appendChild(cardModalRoot)
preactRender(<CardModal />, cardModalRoot)

// Bridge: archetype/wishlist/search "open card" → legacy collection modal for
// owned cards (richer UI), or the universal CardModal otherwise (handled
// inside CardModal itself).
wireCardModal({
  openLegacyCollection: (id) => openModal(id),
  switchToArchetypes:   () => applyView('archetypes'),
})

// Keep the lang signal in sync with legacy state (used by CardModal labels).
langSig.value = langPref

// ─── Auth UI (top-bar AuthBar) ──────────────────────────────────────────────
import { AuthBar } from './features/auth'
import { installCloudSync } from './auth/cloud-sync'
import { LandingGate } from './features/landing'

const authBarMount = document.getElementById('authBarMount')
if (authBarMount) preactRender(<AuthBar />, authBarMount)

// Landing page (web only, first visit). Mounted as a full-screen overlay.
const landingRoot = document.createElement('div')
landingRoot.id = 'landingRoot'
document.body.appendChild(landingRoot)
preactRender(<LandingGate />, landingRoot)

// Wire cloud sync (no-op until a user logs in). The hooks let cloud-sync
// rehydrate the legacy `collection` / `wishlist` arrays after a merge with
// server state — without this, the next `saveCollection()` would overwrite
// merged server data with the local-only legacy array.
installCloudSync({
  onRemoteCollection: (data) => {
    collection = data as CollectionCard[]
    persistCollection(collection)
    render()
  },
  onRemoteWishlist: (data) => {
    wishlist = data as WishlistCard[]
    persistWishlist(wishlist)
    render()
  },
})

// ─── Banlist (TCG) ──────────────────────────────────────────────────────────
// Loads from localStorage (offline-safe) and refreshes from YGOPRODeck once
// per 24h. After a successful refresh we re-render so badges and warnings
// update without requiring a manual reload.
import { refreshBanlist, hasBanlist } from './lib/banlist'

// Load from localStorage synchronously so first render() already has badges.
// (loadFromStorage is called lazily by getBanStatus; ensureBanlist was
//  doing the same but also fired a redundant concurrent fetch — removed.)
const _hadBanlistCache = hasBanlist()

// Always fetch a fresh copy in the background (once per 24h TTL enforced
// inside refreshBanlist). Re-render unconditionally when done so badges
// appear even when the previous render ran before the fetch completed.
void refreshBanlist().then((ok) => {
  if (ok && !_hadBanlistCache) {
    // First-ever fetch: notify the user so they know restrictions are active.
    showToast('Banlist TCG chargée — badges et filtres actifs')
  }
  render()
}).catch(() => {
  // Network failure: silently keep using the cached banlist (or none).
  render()
})

// ─── CRDT sync ──────────────────────────────────────────────────────────────
// Pulls deltas from the backend, pushes pending local writes. The engine
// dispatches `ygo:sync:remote-update` whenever a remote merge changes the
// localStorage mirror — we reload our in-memory arrays and re-render.
import { getSync } from './sync'

async function bootSync() {
  const sync = getSync()
  try {
    const apiBase = (import.meta as { env?: Record<string,string> }).env?.VITE_API_BASE ?? '/api'
    const me = await fetch(`${apiBase}/auth/me`, { credentials: 'include' })
    sync.setAuthenticated(me.ok)
  } catch { sync.setAuthenticated(false) }
  sync.start(30_000)
}
void bootSync()

window.addEventListener('ygo:sync:remote-update', () => {
  collection = loadCollection()
  wishlist   = loadWishlist()
  deckBuilds = loadDeckBuilds()
  _collectionSig.value = collection.slice()
  _wishlistSig.value   = wishlist.slice()
  render()
})
