// The deck-builder modal body: top toolbar, add input, three deck sections.

import { escapeHtml, groupDeckIds } from '../utils'
import { banBadgeHtml, banStatusLabel, banStatusClass } from '../lib/ban-badge'
import { validateDeck, getBanStatus } from '../lib/banlist'
import {
  deps, currentDeck, getCardData, ownedCountInCollection, wishlistQty,
  countInOtherDecks, addIdToDeck, removeOneFromDeck,
} from './state'
import { closeDeckBuilder } from './lifecycle'
import { downloadYDK, downloadDeckCardmarket } from './list-view'
import { openYDKImport } from './ydk-import'
import { openDeckWishlistModal } from './wishlist-modal'
import { openDeckCardModal } from './card-modal'
import { wireDeckBuilderAddInput } from './add-input'

export function renderDeckBuilder(): void {
  const d = currentDeck()
  if (!d) { closeDeckBuilder(); return }

  const total = d.main.length + d.extra.length + d.side.length
  const cntById = new Map<number, number>()
  for (const id of [...d.main, ...d.extra, ...d.side]) cntById.set(id, (cntById.get(id) ?? 0) + 1)
  const missingCount = [...cntById.entries()].reduce(
    (s, [id, n]) => s + Math.max(0, n - ownedCountInCollection(id)), 0,
  )
  deps().deckBuilderBody.innerHTML = `
    <div class="deck-builder-head">
      <input class="deck-builder-name" id="dbName" value="${escapeHtml(d.name)}" maxlength="60" />
      <div class="deck-builder-head-stats">
        <span class="muted small">${total} carte${total !== 1 ? 's' : ''}</span>
        <button class="btn-secondary btn-sm" id="dbExportBtn"><i class="fa-solid fa-download"></i> Exporter</button>
        <button class="btn-secondary btn-sm" id="dbExportCmBtn" title="Exporter en .txt Cardmarket"><i class="fa-solid fa-cart-shopping"></i> Cardmarket</button>
        <button class="btn-secondary btn-sm" id="dbImportBtn"><i class="fa-solid fa-file-import"></i> Importer</button>
        <button class="btn-secondary btn-sm" id="dbWishlistBtn"><i class="fa-regular fa-bookmark"></i> Wishlist${missingCount > 0 ? ` <span class="db-missing-badge">${missingCount}</span>` : ''}</button>
      </div>
    </div>
    <div class="deck-builder-add">
      <div class="filter-pill">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="dbAddInput" type="text" placeholder="Ajouter une carte par nom ou ID…" autocomplete="off" />
      </div>
      <select id="dbAddSection" class="db-section-select">
        <option value="auto">Auto</option>
        <option value="main">Main</option>
        <option value="extra">Extra</option>
        <option value="side">Side</option>
      </select>
      <ul id="dbSuggestions" class="suggestions db-suggestions" hidden></ul>
    </div>
    <div id="dbWarnings"></div>
    <div class="deck-sections">
      ${(['main', 'extra', 'side'] as const).map((sec) => `
        <section class="deck-section" data-section="${sec}">
          <h3 class="deck-section-title">
            <i class="fa-solid fa-${sec === 'main' ? 'layer-group' : sec === 'extra' ? 'star' : 'bookmark'}"></i>
            ${sec === 'main' ? 'Main Deck' : sec === 'extra' ? 'Extra Deck' : 'Side Deck'}
            <span class="deck-section-count">${d[sec].length}</span>
          </h3>
          <ul class="deck-section-list" id="dbList-${sec}"></ul>
        </section>`).join('')}
    </div>`

  renderDeckSection('main')
  renderDeckSection('extra')
  renderDeckSection('side')
  renderDeckWarnings()

  const nameInput = document.getElementById('dbName') as HTMLInputElement
  nameInput.addEventListener('change', () => {
    const v = nameInput.value.trim()
    if (v) { d.name = v; d.updatedAt = Date.now(); deps().saveDeckBuilds() }
  })
  ;(document.getElementById('dbExportBtn')   as HTMLButtonElement).addEventListener('click', () => downloadYDK(d.id))
  ;(document.getElementById('dbExportCmBtn') as HTMLButtonElement).addEventListener('click', () => downloadDeckCardmarket(d.id))
  ;(document.getElementById('dbImportBtn')   as HTMLButtonElement).addEventListener('click', () => openYDKImport(d.id))
  ;(document.getElementById('dbWishlistBtn') as HTMLButtonElement).addEventListener('click', () => openDeckWishlistModal())

  wireDeckBuilderAddInput()
}

export function renderDeckSection(section: 'main' | 'extra' | 'side'): void {
  const d = currentDeck()
  if (!d) return
  const listEl = document.getElementById(`dbList-${section}`) as HTMLUListElement | null
  if (!listEl) return
  const groups = groupDeckIds(d[section])
  if (!groups.length) {
    listEl.innerHTML = `<li class="deck-section-empty muted small">— vide —</li>`
    return
  }
  listEl.innerHTML = groups.map((g) => {
    const c = deps().cardCache.get(g.id)
    const name = c?.name ?? `#${g.id}`
    const img  = c?.card_images?.[0]?.image_url_small ?? ''
    const owned = ownedCountInCollection(g.id)
    const inWish = wishlistQty(g.id)
    const ownership: 'owned' | 'partial' | 'missing' =
      owned >= g.count ? 'owned' : owned > 0 ? 'partial' : 'missing'
    const usedElsewhere = countInOtherDecks(g.id, d.id)
    const stealHint = usedElsewhere > 0
      ? `<span class="deck-card-steal-hint" title="Utilisée dans ${usedElsewhere} autre(s) deck(s)"><i class="fa-solid fa-hand-fist"></i></span>`
      : ''
    const ownershipBadge = ownership === 'partial'
      ? `<span class="deck-card-own-badge own-partial" title="Vous possédez ${owned}/${g.count}">${owned}/${g.count}</span>`
      : ownership === 'missing'
      ? `<span class="deck-card-own-badge own-missing" title="Non possédée"><i class="fa-solid fa-circle-xmark"></i></span>`
      : ''
    const wishBadge = inWish > 0
      ? `<span class="deck-card-wish-badge${ownership !== 'owned' ? ' deck-card-wish-badge--tracked' : ''}" title="${inWish} en wishlist"><i class="fa-regular fa-bookmark"></i> ${inWish}</span>`
      : ''
    return `<li class="deck-card-row" data-id="${g.id}" data-ownership="${ownership}">
      <div class="deck-card-thumb-wrap">
        ${banBadgeHtml(g.id, 'sm')}
        <img class="deck-card-thumb" src="${escapeHtml(img)}" alt="" loading="lazy" />
      </div>
      <div class="deck-card-info">
        <div class="deck-card-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="deck-card-id muted small">${g.id}${c?.type ? ' · ' + escapeHtml(c.type) : ''}</div>
      </div>
      ${ownershipBadge}
      ${wishBadge}
      ${stealHint}
      <div class="deck-card-qty" data-noopen>
        <button class="qty-step-btn" data-act="dec" data-id="${g.id}">−</button>
        <span class="qty-num">${g.count}</span>
        <button class="qty-step-btn" data-act="inc" data-id="${g.id}">+</button>
      </div>
    </li>`
  }).join('')

  // Fetch missing cards without triggering cascading re-renders
  const missingIds: number[] = []
  for (const g of groups) {
    if (!deps().cardCache.has(g.id)) {
      missingIds.push(g.id)
    }
  }
  if (missingIds.length) {
    Promise.all(missingIds.map((id) => getCardData(id))).then(() => {
      // Re-render only if we're still viewing this section
      if (currentDeck()) renderDeckSection(section)
    })
  }

  listEl.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = Number(btn.dataset.id)
      const deck = currentDeck()
      if (!deck) return
      if (btn.dataset.act === 'inc') addIdToDeck(deck, section, id)
      else removeOneFromDeck(deck, section, id)
      renderDeckSection(section)
      const titleCount = deps().deckBuilderBody.querySelector(`.deck-section[data-section="${section}"] .deck-section-count`)
      if (titleCount) titleCount.textContent = String(deck[section].length)
      renderDeckWarnings()
      deps().render()
    })
  })

  listEl.querySelectorAll<HTMLLIElement>('.deck-card-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-noopen]')) return
      const id = Number(row.dataset.id)
      if (id) openDeckCardModal(id, section)
    })
  })
}

/** Render warnings panel for banlist violations and copy-rule infractions. */
export function renderDeckWarnings(): void {
  const d = currentDeck()
  const host = document.getElementById('dbWarnings')
  if (!d || !host) return
  const issues = validateDeck(d)
  if (!issues.length) { host.innerHTML = ''; return }

  // Sort: banned first, then over-limit (limited > semi-limited), then too-many
  const order = (k: typeof issues[number]['kind']): number =>
    k === 'banned' ? 0 : k === 'over-limit' ? 1 : 2
  issues.sort((a, b) => order(a.kind) - order(b.kind))

  const rows = issues.map((iss) => {
    const card = deps().cardCache.get(iss.cardId)
    const name = card?.name ?? `#${iss.cardId}`
    const status = getBanStatus(iss.cardId)
    const pill = status
      ? `<span class="deck-warning-status ${banStatusClass(status)}">${banStatusLabel(status)}</span>`
      : `<span class="deck-warning-status ban-toomany">> 3 copies</span>`
    const detail = iss.kind === 'banned'
      ? `interdite — retirer ${iss.count} exemplaire${iss.count > 1 ? 's' : ''}`
      : iss.kind === 'over-limit'
      ? `${iss.count} exemplaires (max ${iss.maxAllowed})`
      : `${iss.count} exemplaires (max 3)`
    return `<li>${pill}<strong>${escapeHtml(name)}</strong> — ${detail}</li>`
  }).join('')

  host.innerHTML = `
    <div class="deck-warnings" role="alert">
      <div class="deck-warnings-head">
        <i class="fa-solid fa-triangle-exclamation"></i>
        ${issues.length} problème${issues.length > 1 ? 's' : ''} détecté${issues.length > 1 ? 's' : ''} (règles TCG)
      </div>
      <ul>${rows}</ul>
    </div>`
}
