import type { YGOCard, CollectionCard, DeckBuild } from './types'
import { SUGG_HISTORY_KEY, SUGGESTIONS_VISIBLE } from './constants'
import { escapeHtml, normalize, isExtraDeckType } from './utils'
import { appLog } from './logger'
import { runSafe, safeStorageSet } from './lib/safe'
import { DECK_SUGGESTIONS, type DeckSuggestion } from './deck-suggestions'
import { fetchByArchetype, fetchByExactName } from './api'

const MAX_MAIN_DECK = 40
const MAX_EXTRA_DECK = 15

interface BlueprintEntry {
  card: YGOCard
  needed: number
  section: 'main' | 'extra'
}

interface SuggestionCoverage {
  ownedCopies: number
  totalCopies: number
  missingCards: number
  percent: number
  blueprint: BlueprintEntry[]
}

export interface SuggestionsDeps {
  getCollection: () => CollectionCard[]
  cardCache: Map<number, YGOCard>
  saveCardCache: () => void
  totalQty: (c: CollectionCard) => number
  showToast: (msg: string, kind?: 'success' | 'error') => void
  render: () => void
  createDeckBuild: (name: string) => DeckBuild
  saveDeckBuilds: () => void
  openDeckBuilder: (id: string) => void
  addToWishlist: (card: YGOCard, ed: YGOCard | undefined, qty: number) => void
  elements: {
    list: HTMLDivElement
    search: HTMLInputElement
    history: HTMLDetailsElement
    historyList: HTMLDivElement
    historyLabel: HTMLSpanElement
  }
}

let deps: SuggestionsDeps
const suggestionCoverage: Map<string, SuggestionCoverage> = new Map()
let suggestionSearch = ''
let suggestionHistory: string[] = loadSuggestionHistory()
let visibleSuggestionIds: string[] = pickInitialVisible()

function loadSuggestionHistory(): string[] {
  return runSafe('suggestions.loadHistory', () => {
    const raw = localStorage.getItem(SUGG_HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  }, [])
}
function saveSuggestionHistory(): void {
  safeStorageSet(SUGG_HISTORY_KEY, JSON.stringify(suggestionHistory), 'suggestions.saveHistory')
}

function ownedCopiesMap(): Map<number, number> {
  const m = new Map<number, number>()
  for (const c of deps.getCollection()) m.set(c.id, (m.get(c.id) ?? 0) + deps.totalQty(c))
  return m
}

function sortedSuggestions(): DeckSuggestion[] {
  return [...DECK_SUGGESTIONS].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    return b.estWinrate - a.estWinrate
  })
}

function pickInitialVisible(): string[] {
  return sortedSuggestions().slice(0, SUGGESTIONS_VISIBLE).map((s) => s.id)
}

async function buildBlueprint(s: DeckSuggestion): Promise<BlueprintEntry[]> {
  const archetypeCards = (await Promise.all(s.archetypes.map(fetchByArchetype))).flat()
  const staples = (await Promise.all(s.staples.map(fetchByExactName))).filter((c): c is YGOCard => !!c)

  const seen = new Set<number>()
  const dedup = (arr: YGOCard[]) =>
    arr.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
  const archUnique = dedup(archetypeCards)

  const mainPool  = archUnique.filter((c) => !isExtraDeckType(c.type))
  const extraPool = archUnique.filter((c) => isExtraDeckType(c.type))

  const blueprint: BlueprintEntry[] = []
  let mainCount = 0
  for (const c of mainPool) {
    if (mainCount >= MAX_MAIN_DECK) break
    const take = Math.min(3, MAX_MAIN_DECK - mainCount)
    blueprint.push({ card: c, needed: take, section: 'main' })
    mainCount += take
  }
  for (const c of staples) {
    if (mainCount >= MAX_MAIN_DECK) break
    const take = Math.min(3, MAX_MAIN_DECK - mainCount)
    blueprint.push({ card: c, needed: take, section: 'main' })
    mainCount += take
  }
  let extraCount = 0
  for (const c of extraPool) {
    if (extraCount >= MAX_EXTRA_DECK) break
    blueprint.push({ card: c, needed: 1, section: 'extra' })
    extraCount++
  }

  for (const c of [...archUnique, ...staples]) deps.cardCache.set(c.id, c)
  deps.saveCardCache()

  return blueprint
}

async function evaluateSuggestion(s: DeckSuggestion): Promise<SuggestionCoverage> {
  const cached = suggestionCoverage.get(s.id)
  if (cached) return recomputeOwned(cached)
  const blueprint = await buildBlueprint(s)
  const cov: SuggestionCoverage = {
    ownedCopies: 0, totalCopies: 0, missingCards: 0, percent: 0, blueprint,
  }
  suggestionCoverage.set(s.id, cov)
  return recomputeOwned(cov)
}

function recomputeOwned(cov: SuggestionCoverage): SuggestionCoverage {
  const owned = ownedCopiesMap()
  let oc = 0, tc = 0, missing = 0
  for (const b of cov.blueprint) {
    const have = owned.get(b.card.id) ?? 0
    oc += Math.min(have, b.needed)
    tc += b.needed
    if (have < b.needed) missing++
  }
  cov.ownedCopies = oc
  cov.totalCopies = tc
  cov.missingCards = missing
  cov.percent = tc ? Math.round((oc * 100) / tc) : 0
  return cov
}

function tierLabel(t: DeckSuggestion['tier']): string {
  return t === 1 ? 'Tier 1' : t === 2 ? 'Tier 2' : 'Rogue'
}

function currentVisibleSuggestions(): DeckSuggestion[] {
  const all = visibleSuggestionIds
    .map((id) => DECK_SUGGESTIONS.find((s) => s.id === id))
    .filter((s): s is DeckSuggestion => !!s)
  if (!suggestionSearch) return all
  const q = normalize(suggestionSearch).toLowerCase()
  return all.filter((s) =>
    normalize(s.name).toLowerCase().includes(q) ||
    normalize(s.description).toLowerCase().includes(q) ||
    s.archetypes.some((a) => normalize(a).toLowerCase().includes(q))
  )
}

function renderSuggestionCard(s: DeckSuggestion): string {
  const cov = suggestionCoverage.get(s.id)
  const covHtml = cov
    ? `<div class="sugg-cov">
         <div class="sugg-cov-bar"><div class="sugg-cov-fill" style="width:${cov.percent}%"></div></div>
         <span class="sugg-cov-text">${cov.ownedCopies}/${cov.totalCopies} copies · ${cov.percent}%${cov.missingCards ? ` · <button class="sugg-missing-link" data-sugg-act="missing">${cov.missingCards} carte${cov.missingCards > 1 ? 's' : ''} manquante${cov.missingCards > 1 ? 's' : ''}</button>` : ''}</span>
       </div>`
    : `<div class="sugg-cov sugg-cov-pending muted small">Cliquez sur « Évaluer » pour calculer.</div>`
  return `<article class="sugg-card" data-sugg-id="${s.id}" data-tier="${s.tier}">
    <header class="sugg-card-head">
      <h4 class="sugg-card-title" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</h4>
      <span class="sugg-tier sugg-tier-${s.tier}">${tierLabel(s.tier)}</span>
    </header>
    <div class="sugg-meta">
      <span class="sugg-winrate" title="Win-rate estimé (indicatif)">
        <i class="fa-solid fa-trophy"></i> ${s.estWinrate}%
      </span>
      <span class="sugg-archs muted small" title="${escapeHtml(s.archetypes.join(', '))}">
        ${escapeHtml(s.archetypes.join(' · '))}
      </span>
    </div>
    <p class="sugg-desc">${escapeHtml(s.description)}</p>
    ${covHtml}
    <footer class="sugg-actions">
      <button class="btn-secondary btn-sm" data-sugg-act="eval"><i class="fa-solid fa-calculator"></i> Évaluer</button>
      <button class="btn-primary btn-sm" data-sugg-act="add"><i class="fa-solid fa-plus"></i> Ajouter</button>
    </footer>
  </article>`
}

export function renderDeckSuggestions(): void {
  const visible = currentVisibleSuggestions()
  if (!visible.length) {
    deps.elements.list.innerHTML = `<div class="sugg-empty muted small">Aucun deck ne correspond à « ${escapeHtml(suggestionSearch)} ».</div>`
  } else {
    deps.elements.list.innerHTML = visible.map(renderSuggestionCard).join('')
  }
  wireSuggestionCards(deps.elements.list)
  renderSuggestionHistory()
}

function wireSuggestionCards(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.sugg-card').forEach((card) => {
    const id = card.dataset.suggId!
    const s = DECK_SUGGESTIONS.find((x) => x.id === id)
    if (!s) return
    card.querySelector<HTMLButtonElement>('[data-sugg-act="eval"]')?.addEventListener('click', async (e) => {
      e.stopPropagation()
      const btn = e.currentTarget as HTMLButtonElement
      btn.disabled = true
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calcul…'
      await evaluateSuggestion(s)
      renderDeckSuggestions()
    })
    card.querySelector<HTMLButtonElement>('[data-sugg-act="add"]')?.addEventListener('click', async (e) => {
      e.stopPropagation()
      const btn = e.currentTarget as HTMLButtonElement
      btn.disabled = true
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Création…'
      await addSuggestionAsDeck(s)
      btn.disabled = false
      btn.innerHTML = '<i class="fa-solid fa-plus"></i> Ajouter'
    })
    card.querySelector<HTMLButtonElement>('[data-sugg-act="missing"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      openMissingCardsModal(s)
    })
  })
}

function renderSuggestionHistory(): void {
  const visibleSet = new Set(visibleSuggestionIds)
  const histIds = suggestionHistory.filter((id) => !visibleSet.has(id))
  deps.elements.historyLabel.textContent = `Historique (${histIds.length})`
  if (!histIds.length) {
    deps.elements.history.hidden = true
    deps.elements.historyList.innerHTML = ''
    return
  }
  deps.elements.history.hidden = false
  deps.elements.historyList.innerHTML = histIds.map((id) => {
    const s = DECK_SUGGESTIONS.find((x) => x.id === id)
    if (!s) return ''
    return `<div class="sugg-history-row" data-sugg-id="${s.id}">
      <div class="sugg-history-info">
        <span class="sugg-history-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
        <span class="sugg-tier sugg-tier-${s.tier}">${tierLabel(s.tier)}</span>
        <span class="muted small">${s.estWinrate}%</span>
      </div>
      <button class="btn-secondary btn-sm" data-sugg-act="restore" title="Réafficher dans la bannière">
        <i class="fa-solid fa-arrow-up"></i> Réafficher
      </button>
    </div>`
  }).join('')
  deps.elements.historyList.querySelectorAll<HTMLElement>('.sugg-history-row').forEach((row) => {
    const id = row.dataset.suggId!
    row.querySelector<HTMLButtonElement>('[data-sugg-act="restore"]')?.addEventListener('click', () => {
      restoreSuggestion(id)
    })
  })
}

function restoreSuggestion(id: string): void {
  if (visibleSuggestionIds.includes(id)) return
  const dropped = visibleSuggestionIds[visibleSuggestionIds.length - 1]
  if (dropped) {
    suggestionHistory = [dropped, ...suggestionHistory.filter((x) => x !== dropped)]
  }
  visibleSuggestionIds = [id, ...visibleSuggestionIds.slice(0, SUGGESTIONS_VISIBLE - 1)]
  saveSuggestionHistory()
  renderDeckSuggestions()
}

export function rotateSuggestions(): void {
  for (const id of visibleSuggestionIds) {
    suggestionHistory = [id, ...suggestionHistory.filter((x) => x !== id)]
  }
  const visibleSet = new Set(visibleSuggestionIds)
  const remaining = sortedSuggestions().filter((s) => !visibleSet.has(s.id))
  let next: string[]
  if (remaining.length >= SUGGESTIONS_VISIBLE) {
    next = remaining.slice(0, SUGGESTIONS_VISIBLE).map((s) => s.id)
  } else {
    const fill = suggestionHistory.filter((id) => !remaining.some((s) => s.id === id))
    next = [
      ...remaining.map((s) => s.id),
      ...fill.slice(0, SUGGESTIONS_VISIBLE - remaining.length),
    ]
  }
  visibleSuggestionIds = next
  saveSuggestionHistory()
  renderDeckSuggestions()
  deps.showToast('Suggestions actualisées', 'success')
}

async function addSuggestionAsDeck(s: DeckSuggestion): Promise<void> {
  const cov = await evaluateSuggestion(s)
  const blueprint = cov.blueprint

  const main: number[]  = []
  const extra: number[] = []
  for (const b of blueprint) {
    for (let i = 0; i < b.needed; i++) {
      if (b.section === 'main')  main.push(b.card.id)
      else                       extra.push(b.card.id)
    }
  }

  const d = deps.createDeckBuild(`${s.name} (suggestion)`)
  d.main = main
  d.extra = extra
  d.updatedAt = Date.now()
  deps.saveDeckBuilds()
  appLog('info', `Deck suggestion ajouté : « ${s.name} » (${main.length} main / ${extra.length} extra)`)
  deps.showToast(`Deck « ${s.name} » créé`, 'success')
  deps.render()
  deps.openDeckBuilder(d.id)
}

function openMissingCardsModal(s: DeckSuggestion): void {
  const cov = suggestionCoverage.get(s.id)
  if (!cov) return
  const owned = ownedCopiesMap()
  const missing = cov.blueprint
    .map((b) => ({ ...b, have: owned.get(b.card.id) ?? 0 }))
    .filter((b) => b.have < b.needed)

  let overlay = document.getElementById('missingCardsOverlay') as HTMLDivElement | null
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'missingCardsOverlay'
    overlay.className = 'modal'
    document.body.appendChild(overlay)
    overlay.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-close-missing]')) overlay!.hidden = true
    })
  }
  overlay.hidden = false
  overlay.innerHTML = `
    <div class="modal-backdrop" data-close-missing></div>
    <div class="modal-content missing-modal-content" role="dialog" aria-modal="true">
      <button class="modal-close" data-close-missing aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
      <div class="missing-modal-body">
        <h2 class="missing-title">
          <i class="fa-solid fa-magnifying-glass-minus"></i>
          Cartes manquantes — ${escapeHtml(s.name)}
        </h2>
        <p class="muted small">
          ${missing.length} carte${missing.length > 1 ? 's' : ''} à acquérir
          (${cov.totalCopies - cov.ownedCopies} copie${cov.totalCopies - cov.ownedCopies > 1 ? 's' : ''}).
        </p>
        ${missing.length === 0
          ? `<div class="missing-empty"><i class="fa-solid fa-circle-check"></i> Vous avez toutes les cartes !</div>`
          : `<ul class="missing-list">
              ${missing.map((b) => {
                const img = b.card.card_images?.[0]?.image_url_small ?? ''
                const wantQty = b.needed - b.have
                return `<li class="missing-row" data-card-id="${b.card.id}">
                  <img class="missing-thumb" src="${escapeHtml(img)}" alt="" loading="lazy" />
                  <div class="missing-info">
                    <div class="missing-name" title="${escapeHtml(b.card.name)}">${escapeHtml(b.card.name)}</div>
                    <div class="muted small">
                      ${b.section === 'extra' ? 'Extra' : 'Main'} ·
                      Possédé <b>${b.have}</b> / Requis <b>${b.needed}</b>
                      · <span class="missing-need">+${wantQty} à trouver</span>
                    </div>
                  </div>
                  <button class="btn-secondary btn-sm" data-missing-act="wishlist">
                    <i class="fa-solid fa-heart"></i> Wishlist ×${wantQty}
                  </button>
                </li>`
              }).join('')}
            </ul>`
        }
      </div>
    </div>`

  overlay.querySelectorAll<HTMLElement>('.missing-row').forEach((row) => {
    const id = Number(row.dataset.cardId)
    const entry = missing.find((m) => m.card.id === id)
    if (!entry) return
    row.querySelector<HTMLButtonElement>('[data-missing-act="wishlist"]')?.addEventListener('click', () => {
      const wantQty = entry.needed - entry.have
      deps.addToWishlist(entry.card, undefined, wantQty)
    })
  })
}

export async function evaluateAllSuggestions(): Promise<void> {
  const visible = visibleSuggestionIds
    .map((id) => DECK_SUGGESTIONS.find((s) => s.id === id))
    .filter((s): s is DeckSuggestion => !!s)
  await Promise.all(visible.map(evaluateSuggestion))
  renderDeckSuggestions()
}

export async function buildBestDeckFromCollection(): Promise<void> {
  if (!deps.getCollection().length) {
    deps.showToast('Votre collection est vide — ajoutez des cartes d\u2019abord', 'error')
    return
  }
  await Promise.all(DECK_SUGGESTIONS.map(evaluateSuggestion))
  let best: DeckSuggestion | null = null
  let bestPct = -1
  for (const s of DECK_SUGGESTIONS) {
    const cov = suggestionCoverage.get(s.id)
    if (cov && cov.percent > bestPct) { best = s; bestPct = cov.percent }
  }
  if (!best) { deps.showToast('Aucune suggestion exploitable', 'error'); return }
  appLog('info', `Meilleur match pour votre collection : « ${best.name} » (${bestPct}%)`)
  deps.showToast(`Meilleur match : « ${best.name} » (${bestPct}%)`, 'success')
  renderDeckSuggestions()
  await addSuggestionAsDeck(best)
}

export function setSuggestionSearch(q: string): void {
  suggestionSearch = q
  renderDeckSuggestions()
}

export function initSuggestions(d: SuggestionsDeps): void {
  deps = d
  d.elements.search.addEventListener('input', () => {
    setSuggestionSearch(d.elements.search.value.trim())
  })
}
