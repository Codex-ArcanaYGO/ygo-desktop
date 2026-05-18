import type { CollectionCard, WishlistCard, DeckBuild, SortKey, LangPref, View } from './types'
import { UNKNOWN_EDITION_CODE } from './constants'
import { escapeHtml, totalQty, cardTotalValue, cardMaxUnitPrice, editionPrice } from './utils'
import { openModal, showDeckPopover } from './modal'
import { bumpFirstEdition, removeCard, toggleLike } from './collection-crud'
import { bumpWish, removeFromWishlist, moveWishToCollection } from './wishlist'
import { openCard } from './app/state'
import { banBadgeHtml } from './lib/ban-badge'
import { getBanStatus, hasBanlist, type BanStatus } from './lib/banlist'

/** Filter value for the banlist <select>. */
export type BanFilterValue = '' | 'any' | BanStatus | 'free'

function passesBanFilter(cardId: number, value: BanFilterValue): boolean {
  if (!value) return true
  const status = getBanStatus(cardId)
  if (value === 'any')  return status !== null
  if (value === 'free') return status === null
  return status === value
}

/** Update the ban-filter select's label to show restricted-card count so the
 *  user can immediately see whether the banlist is loaded and relevant. */
function _updateBanFilterLabel(cards: ReadonlyArray<{ id: number }>): void {
  const label = deps.banFilterSelect.previousElementSibling as HTMLElement | null
  if (!label) return
  if (!hasBanlist()) {
    label.title = 'Statut banlist TCG (chargement…)'
    return
  }
  const count = cards.filter((c) => getBanStatus(c.id) !== null).length
  label.title = count > 0
    ? `Statut banlist TCG — ${count} carte${count > 1 ? 's' : ''} restreinte${count > 1 ? 's' : ''} dans votre collection`
    : 'Statut banlist TCG — aucune carte restreinte dans votre collection'
}

export interface RenderDeps {
  getCollection: () => CollectionCard[]
  getWishlist: () => WishlistCard[]
  getDecks: () => string[]
  getDeckBuilds: () => DeckBuild[]
  getDeckFilter: () => string
  setDeckFilter: (v: string) => void
  langPref: () => LangPref
  currentView: () => View
  filterInput: HTMLInputElement
  sortSelect: HTMLSelectElement
  deckFilterSelect: HTMLSelectElement
  banFilterSelect: HTMLSelectElement
  gallery: HTMLElement
  emptyState: HTMLDivElement
  statCount: HTMLSpanElement
  statValue: HTMLSpanElement
  countCollectionEl: HTMLSpanElement
  countWishlistEl: HTMLSpanElement
  countDecksEl: HTMLSpanElement
  renderDecksView: () => void
  renderArchetypesView: () => void
}

let deps!: RenderDeps

export function initRender(d: RenderDeps): void {
  deps = d
  deps.filterInput.addEventListener('input', render)
  deps.sortSelect.addEventListener('change', render)
  deps.banFilterSelect.addEventListener('change', () => {
    try { localStorage.setItem('ygo_banfilter', deps.banFilterSelect.value) } catch { /* ignore */ }
    render()
  })
  // Restore persisted choice.
  try {
    const saved = localStorage.getItem('ygo_banfilter')
    if (saved !== null) deps.banFilterSelect.value = saved
  } catch { /* ignore */ }
  deps.deckFilterSelect.addEventListener('change', () => {
    deps.setDeckFilter(deps.deckFilterSelect.value)
    render()
  })
}

function displayName(c: CollectionCard): string {
  return deps.langPref() === 'en' && c.nameEn ? c.nameEn : c.name
}

export function render(): void {
  if (!deps) return
  const collection = deps.getCollection()
  const wishlist = deps.getWishlist()
  deps.countCollectionEl.textContent = String(collection.reduce((s, c) => s + totalQty(c), 0))
  deps.countWishlistEl.textContent   = String(wishlist.reduce((s, w) => s + w.wantedQty, 0))
  deps.countDecksEl.textContent      = String(deps.getDeckBuilds().length)

  if (deps.currentView() === 'decks')      return deps.renderDecksView()
  if (deps.currentView() === 'archetypes') return deps.renderArchetypesView()
  if (deps.currentView() === 'wishlist')   return renderWishlist()
  renderCollection()
}

export function renderCollection(): void {
  const collection = deps.getCollection()
  const filter = deps.filterInput.value.trim().toLowerCase()
  const sort = deps.sortSelect.value as SortKey
  const deckFilter = deps.getDeckFilter()

  let list = collection.slice()
  if (filter) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(filter) ||
        (c.type ?? '').toLowerCase().includes(filter) ||
        (c.race ?? '').toLowerCase().includes(filter)
    )
  }
  if (deckFilter) {
    list = list.filter((c) => c.deck === deckFilter)
  }
  const banFilter = deps.banFilterSelect.value as BanFilterValue
  if (banFilter) {
    list = list.filter((c) => passesBanFilter(c.id, banFilter))
  }

  // Update the ban-filter label to show restricted-card count in collection.
  _updateBanFilterLabel(collection)

  switch (sort) {
    case 'name':        list.sort((a, b) => a.name.localeCompare(b.name, 'fr')); break
    case 'name-desc':   list.sort((a, b) => b.name.localeCompare(a.name, 'fr')); break
    case 'type':        list.sort((a, b) => (a.type ?? '').localeCompare(b.type ?? '')); break
    case 'qty':         list.sort((a, b) => totalQty(b) - totalQty(a)); break
    case 'qty-asc':     list.sort((a, b) => totalQty(a) - totalQty(b)); break
    case 'price-unit':  list.sort((a, b) => cardMaxUnitPrice(b) - cardMaxUnitPrice(a)); break
    case 'price-total': list.sort((a, b) => cardTotalValue(b) - cardTotalValue(a)); break
    default:            list.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
  }

  const total = collection.reduce((s, c) => s + totalQty(c), 0)
  deps.statCount.textContent = String(total)
  const totalVal = collection.reduce((s, c) => s + cardTotalValue(c), 0)
  deps.statValue.textContent = totalVal > 0 ? totalVal.toFixed(2) + ' €' : '—'

  deps.deckFilterSelect.innerHTML = `<option value="">Tous les decks</option>
    ${deps.getDecks().map((d) => `<option value="${escapeHtml(d)}"${deckFilter === d ? ' selected' : ''}>${escapeHtml(d)}</option>`).join('')}`

  deps.emptyState.hidden = collection.length !== 0
  deps.gallery.hidden    = list.length === 0

  // Show a contextual message when the filter produces 0 results but the
  // collection is not empty (so the user knows the filter IS working).
  if (list.length === 0 && collection.length > 0) {
    deps.emptyState.hidden = false
    const h2 = deps.emptyState.querySelector('h2')
    const p  = deps.emptyState.querySelector('p')
    if (h2) h2.textContent = 'Aucune carte ne correspond au filtre'
    if (p)  p.textContent  = 'Modifiez le filtre texte, deck ou statut banlist.'
  }

  deps.gallery.innerHTML = list
    .map((c) => {
      const firstOwned   = c.editions?.[0]
      const firstSetCode = firstOwned?.setCode ?? ''
      const firstRarity  = firstOwned?.rarity ?? ''
      const ownedCount   = c.editions?.length ?? 0
      const qty          = totalQty(c)
      const editions     = c.editions ?? []
      const totalValue   = cardTotalValue(c)

      // ── Price tag (card-meta) ──────────────────────────────────────────────
      // Single edition: unit price (+ total if qty > 1)
      // Multi-edition: total tag in card-meta, then per-edition detail below
      let priceTag = ''
      if (ownedCount <= 1 && totalValue > 0) {
        const unitP = editionPrice(c, firstSetCode) || Number(c.cardmarketPrice ?? 0)
        priceTag = `<span class="tag tag-price" title="${qty > 1 ? `${unitP.toFixed(2)} € × ${qty}` : 'Prix unitaire'}">
              <i class="fa-solid fa-euro-sign"></i>${unitP.toFixed(2)}
              ${qty > 1 ? `<span class="price-total">= ${totalValue.toFixed(2)} €</span>` : ''}
            </span>`
      } else if (ownedCount > 1 && totalValue > 0) {
        priceTag = `<span class="tag tag-price" title="Total toutes éditions">
              <i class="fa-solid fa-euro-sign"></i>${totalValue.toFixed(2)} <span class="price-label">total</span>
            </span>`
      }

      // ── Editions block (replaces single card-code line for multi) ──────────
      let editionsBlock = ''
      if (c.editions?.some((e) => e.setCode === UNKNOWN_EDITION_CODE)) {
        editionsBlock = `<div class="card-code card-code--unknown"><i class="fa-solid fa-triangle-exclamation"></i> Édition inconnue — cliquez pour compléter</div>`
      } else if (ownedCount > 1) {
        const rows = editions.map((e) => {
          const p = editionPrice(c, e.setCode)
          let priceStr = ''
          if (p > 0) {
            priceStr = e.qty > 1
              ? `<span class="ed-price">${p.toFixed(2)} € × ${e.qty} = <strong>${(p * e.qty).toFixed(2)} €</strong></span>`
              : `<span class="ed-price">${p.toFixed(2)} €</span>`
          } else {
            priceStr = `<span class="ed-price ed-price--none">—</span>`
          }
          return `<div class="card-edition-row">
            <span class="card-code-inline">${escapeHtml(e.setCode)}</span>
            ${e.rarity ? `<span class="card-rarity-inline">· ${escapeHtml(e.rarity)}</span>` : ''}
            ${priceStr}
          </div>`
        }).join('')
        editionsBlock = `<div class="card-editions-list">${rows}</div>`
      } else if (firstSetCode) {
        editionsBlock = `<div class="card-code">${escapeHtml(firstSetCode)}${firstRarity ? ` <span class="card-rarity">· ${escapeHtml(firstRarity)}</span>` : ''}</div>`
      }

      return `
      <article class="card${c.liked ? ' is-liked' : ''}${c.editions?.some((e) => e.setCode === UNKNOWN_EDITION_CODE) ? ' card-incomplete' : ''}" data-id="${c.id}">
        <button class="card-del" data-action="del" title="Supprimer"><i class="fa-solid fa-xmark"></i></button>
        <div class="card-img-wrap">
          ${banBadgeHtml(c.id)}
          <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" loading="lazy" />
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(displayName(c))}</h3>
          <div class="card-meta">
            ${priceTag}
            ${c.deck ? `<span class="tag tag-deck"><i class="fa-solid fa-folder-open"></i>${escapeHtml(c.deck.length > 10 ? c.deck.slice(0, 9) + '\u2026' : c.deck)}</span>` : ''}
          </div>
          ${editionsBlock}
        </div>
        <div class="card-footer">
          <button class="footer-btn like-btn${c.liked ? ' liked' : ''}" data-action="like"
            title="${c.liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
            <i class="fa-${c.liked ? 'solid' : 'regular'} fa-heart"></i>
          </button>
          <div class="qty-stepper">
            <button class="qty-step-btn" data-action="dec" title="Retirer un exemplaire">−</button>
            <span class="qty-num">${totalQty(c)}</span>
            <button class="qty-step-btn" data-action="inc" title="Ajouter un exemplaire">+</button>
          </div>
          <button class="footer-btn deck-btn" data-action="deck"
            title="${c.deck ? escapeHtml(c.deck) : 'Ajouter à un deck'}">
            <i class="fa-solid fa-folder${c.deck ? '-open' : ''}"></i>
          </button>
        </div>
      </article>`
    })
    .join('')

  deps.gallery.querySelectorAll<HTMLElement>('.card').forEach((el) => {
    const id = Number(el.dataset.id)
    el.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest<HTMLElement>('[data-action]')
      if (!btn) { openModal(id); return }
      e.stopPropagation()
      switch (btn.dataset.action) {
        case 'inc':  bumpFirstEdition(id, +1); break
        case 'dec':  bumpFirstEdition(id, -1); break
        case 'del':  removeCard(id); break
        case 'like': toggleLike(id); break
        case 'deck': showDeckPopover(id, btn); break
      }
    })
  })
}

export function renderWishlist(): void {
  const wishlist = deps.getWishlist()
  const filter = deps.filterInput.value.trim().toLowerCase()
  const sort = deps.sortSelect.value as SortKey

  let list = wishlist.slice()
  if (filter) {
    list = list.filter(
      (c) => c.name.toLowerCase().includes(filter) || (c.type ?? '').toLowerCase().includes(filter),
    )
  }
  const banFilter = deps.banFilterSelect.value as BanFilterValue
  if (banFilter) {
    list = list.filter((c) => passesBanFilter(c.id, banFilter))
  }
  switch (sort) {
    case 'name': list.sort((a, b) => a.name.localeCompare(b.name, 'fr')); break
    case 'type': list.sort((a, b) => (a.type ?? '').localeCompare(b.type ?? '')); break
    case 'qty':  list.sort((a, b) => b.wantedQty - a.wantedQty); break
    default:     list.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
  }

  deps.statCount.textContent = String(list.reduce((s, c) => s + c.wantedQty, 0))
  deps.emptyState.hidden = wishlist.length !== 0
  deps.gallery.hidden    = list.length === 0

  if (list.length === 0 && wishlist.length > 0) {
    deps.emptyState.hidden = false
    const h2 = deps.emptyState.querySelector('h2')
    const p  = deps.emptyState.querySelector('p')
    if (h2) h2.textContent = 'Aucune carte ne correspond au filtre'
    if (p)  p.textContent  = 'Modifiez le filtre texte ou le statut banlist.'
  }

  deps.gallery.innerHTML = list
    .map((c) => {
      const name = deps.langPref() === 'en' && c.nameEn ? c.nameEn : c.name
      return `
      <article class="card wishlist-card" data-id="${c.id}">
        <button class="card-del" data-w-action="del" title="Retirer de la wishlist"><i class="fa-solid fa-xmark"></i></button>
        <div class="card-img-wrap">
          ${banBadgeHtml(c.id)}
          <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" loading="lazy" />
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(name)}</h3>
          <div class="card-meta">
            ${c.cardmarketPrice ? `<span class="tag tag-price"><i class="fa-solid fa-euro-sign"></i>${Number(c.cardmarketPrice).toFixed(2)}</span>` : ''}
            <span class="tag tag-wishlist"><i class="fa-regular fa-bookmark"></i>×${c.wantedQty}</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="footer-btn" data-w-action="move" title="Déplacer vers ma collection">
            <i class="fa-solid fa-arrow-right-arrow-left"></i>
          </button>
          <div class="qty-stepper">
            <button class="qty-step-btn" data-w-action="dec" title="Retirer">−</button>
            <span class="qty-num">${c.wantedQty}</span>
            <button class="qty-step-btn" data-w-action="inc" title="Ajouter">+</button>
          </div>
          <button class="footer-btn" data-w-action="info" title="Détails">
            <i class="fa-solid fa-circle-info"></i>
          </button>
        </div>
      </article>`
    })
    .join('')

  deps.gallery.querySelectorAll<HTMLElement>('.card').forEach((el) => {
    const id = Number(el.dataset.id)
    el.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest<HTMLElement>('[data-w-action]')
      if (btn) {
        e.stopPropagation()
        switch (btn.dataset.wAction) {
          case 'inc':  bumpWish(id, +1); break
          case 'dec':  bumpWish(id, -1); break
          case 'del':  removeFromWishlist(id); break
          case 'move': moveWishToCollection(id); break
          case 'info': openCard(id, 'wishlist'); break
        }
        return
      }
      // Empty zone of the card → open universal modal
      openCard(id, 'wishlist')
    })
  })
}
