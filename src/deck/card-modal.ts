// Card detail modal opened from inside the deck builder.
// Has two modes: "read" (info + actions) and "steal" (take copies from
// another deck).

import type { DeckBuild } from '../types'
import { escapeHtml, cardmarketUrl } from '../utils'
import { appLog } from '../logger'
import { openModal } from '../modal'
import { addToWishlist } from '../wishlist'
import {
  deps, currentDeck, getCardData, ownedCountInCollection, wishlistQty,
  listOtherDeckUsages,
} from './state'
import { renderDeckSection } from './builder-view'

export function openDeckCardModal(
  id: number,
  section: 'main' | 'extra' | 'side',
  mode: 'read' | 'steal' = 'read',
): void {
  const deck = currentDeck()
  if (!deck) return
  const inDeck = deck[section].filter((x) => x === id).length
  const owned = ownedCountInCollection(id)
  const collected = deps().getCollection().find((x) => x.id === id)
  const cached = deps().cardCache.get(id)

  if (!collected && !cached) {
    getCardData(id).then(() => {
      const modal = document.getElementById('modal') as HTMLDivElement
      if (modal && !modal.hidden) openDeckCardModal(id, section, mode)
    })
  }

  const name      = collected?.name   ?? cached?.name ?? `#${id}`
  const nameEn    = collected?.nameEn ?? cached?.name ?? ''
  const image     = collected?.image  ?? cached?.card_images?.[0]?.image_url ?? ''
  const desc      = collected?.desc   ?? cached?.desc ?? ''
  const type      = collected?.type   ?? cached?.type ?? ''
  const race      = collected?.race   ?? cached?.race
  const attribute = collected?.attribute ?? cached?.attribute
  const atk       = collected?.atk    ?? cached?.atk
  const def       = collected?.def    ?? cached?.def
  const level     = collected?.level  ?? cached?.level

  const usages = listOtherDeckUsages(id, deck.id)
  const stealable = usages.reduce((s, u) => s + u.counts.total, 0)
  const inWish = wishlistQty(id)
  const missingInDeck = Math.max(0, inDeck - owned)
  const cmUrl = cardmarketUrl(nameEn || name)

  if (stealable === 0) mode = 'read'

  const ownershipState: 'owned' | 'partial' | 'missing' =
    owned >= inDeck ? 'owned' : owned > 0 ? 'partial' : 'missing'

  const toggleHtml = stealable > 0 ? `
    <div class="dcm-mode-toggle">
      <button class="dcm-mode-btn${mode === 'read' ? ' active' : ''}" data-dcm-mode="read">
        <i class="fa-solid fa-eye"></i> Info
      </button>
      <button class="dcm-mode-btn${mode === 'steal' ? ' active' : ''}" data-dcm-mode="steal">
        <i class="fa-solid fa-hand-fist"></i> Voler d'un deck
      </button>
    </div>` : ''

  const contentHtml = mode === 'steal'
    ? renderStealContent(deck.name, section, usages, cmUrl)
    : renderReadContent({
        inDeck, owned, inWish, stealable, missingInDeck, cmUrl,
        hasCollected: !!collected, ownershipState, desc,
      })

  const modal = document.getElementById('modal') as HTMLDivElement
  const body = document.getElementById('modalBody') as HTMLDivElement
  body.innerHTML = `
    <div class="modal-hero deck-card-modal" data-ownership="${ownershipState}">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" />
      <div>
        ${toggleHtml}
        <div class="modal-id muted small">ID Konami : <code>${id}</code> · Deck : <b>${escapeHtml(deck.name)}</b> (${section})</div>
        <h2 class="deck-card-modal-title" title="${escapeHtml(name)}">${escapeHtml(name)}</h2>
        ${nameEn && nameEn !== name ? `<div class="name-en muted small">${escapeHtml(nameEn)}</div>` : ''}
        <div class="modal-stats">
          ${type      ? `<span class="tag"><i class="fa-solid fa-tag"></i>${escapeHtml(type)}</span>` : ''}
          ${race      ? `<span class="tag"><i class="fa-solid fa-dragon"></i>${escapeHtml(race)}</span>` : ''}
          ${attribute ? `<span class="tag"><i class="fa-solid fa-fire"></i>${escapeHtml(attribute)}</span>` : ''}
          ${level != null ? `<span class="tag"><i class="fa-solid fa-star"></i>Niv.&nbsp;${level}</span>` : ''}
          ${atk != null   ? `<span class="tag"><i class="fa-solid fa-khanda"></i>ATK&nbsp;${atk}</span>` : ''}
          ${def != null   ? `<span class="tag"><i class="fa-solid fa-shield"></i>DEF&nbsp;${def}</span>` : ''}
        </div>
        ${contentHtml}
      </div>
    </div>`

  modal.hidden = false

  body.querySelectorAll<HTMLButtonElement>('[data-dcm-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openDeckCardModal(id, section, btn.dataset.dcmMode as 'read' | 'steal')
    })
  })

  body.querySelector('#dcmOpenCollection')?.addEventListener('click', () => {
    modal.hidden = true
    openModal(id)
  })
  body.querySelector('#dcmAddWishlist')?.addEventListener('click', async () => {
    const fr = cached ?? (await getCardData(id))
    if (!fr) return
    addToWishlist(fr, fr, missingInDeck)
  })

  body.querySelectorAll<HTMLLIElement>('.steal-deck-row').forEach((row) => {
    const deckId = row.dataset.deckId!
    const u = usages.find((x) => x.deck.id === deckId)!
    const max = u.counts.total
    const qtyEl = row.querySelector<HTMLSpanElement>('[data-steal-qty]')!
    let qty = 1
    const setQty = (v: number): void => { qty = Math.max(1, Math.min(max, v)); qtyEl.textContent = String(qty) }
    row.querySelector<HTMLButtonElement>('[data-steal-act="inc"]')!.addEventListener('click', () => setQty(qty + 1))
    row.querySelector<HTMLButtonElement>('[data-steal-act="dec"]')!.addEventListener('click', () => setQty(qty - 1))
    row.querySelector<HTMLButtonElement>('[data-steal-confirm]')!.addEventListener('click', () => {
      stealCopies(u.deck, id, qty, section)
      openDeckCardModal(id, section, 'read')
    })
  })
}

interface ReadContentParams {
  inDeck: number; owned: number; inWish: number; stealable: number
  missingInDeck: number; cmUrl: string; hasCollected: boolean
  ownershipState: 'owned' | 'partial' | 'missing'; desc: string
}

function renderReadContent(p: ReadContentParams): string {
  return `
    <div class="deck-card-modal-status">
      <div class="status-row">
        <span class="status-label">Dans ce deck</span>
        <span class="status-val"><b>×${p.inDeck}</b></span>
      </div>
      <div class="status-row">
        <span class="status-label">Possédées</span>
        <span class="status-val ${p.ownershipState === 'owned' ? 'status-ok' : p.ownershipState === 'partial' ? 'status-warn' : 'status-bad'}">
          <b>${p.owned}</b> / ${p.inDeck}
        </span>
      </div>
      ${p.inWish > 0 ? `
        <div class="status-row">
          <span class="status-label">En wishlist</span>
          <span class="status-val status-wish">
            <i class="fa-regular fa-bookmark"></i> <b>${p.inWish}</b>
          </span>
        </div>` : ''}
      ${p.stealable > 0 ? `
        <div class="status-row">
          <span class="status-label">Dans d'autres decks</span>
          <span class="status-val"><b>${p.stealable}</b> copie(s)</span>
        </div>` : ''}
    </div>
    <div class="modal-actions deck-card-modal-actions">
      ${p.hasCollected ? `
        <button class="btn-secondary" id="dcmOpenCollection">
          <i class="fa-solid fa-folder-open"></i> Voir dans la collection
        </button>` : ''}
      ${p.missingInDeck > 0 ? `
        <button class="btn-secondary" id="dcmAddWishlist">
          <i class="fa-regular fa-bookmark"></i>
          ${p.inWish > 0
            ? `Wishlist : +${p.missingInDeck} (total → ${p.inWish + p.missingInDeck})`
            : `Ajouter à la wishlist (×${p.missingInDeck})`}
        </button>` : ''}
      <a href="${escapeHtml(p.cmUrl)}" target="_blank" rel="noopener noreferrer" class="btn-cm">
        <i class="fa-solid fa-arrow-up-right-from-square"></i> Cardmarket
      </a>
    </div>
    ${p.desc ? `<p class="desc">${escapeHtml(p.desc)}</p>` : ''}`
}

function renderStealContent(
  deckName: string,
  section: 'main' | 'extra' | 'side',
  usages: ReturnType<typeof listOtherDeckUsages>,
  cmUrl: string,
): string {
  return `
    <p class="muted small dcm-steal-hint">Retirer des copies d'un autre deck et les ajouter à <b>${escapeHtml(deckName)}</b> (${section}).</p>
    <ul class="steal-deck-list">
      ${usages.map((u) => `
        <li class="steal-deck-row" data-deck-id="${u.deck.id}">
          <div class="steal-deck-info">
            <div class="steal-deck-name" title="${escapeHtml(u.deck.name)}">${escapeHtml(u.deck.name)}</div>
            <div class="muted small">
              ${u.counts.main  ? `Main ×${u.counts.main} ` : ''}
              ${u.counts.extra ? `Extra ×${u.counts.extra} ` : ''}
              ${u.counts.side  ? `Side ×${u.counts.side}` : ''}
            </div>
          </div>
          <div class="steal-deck-take">
            <span class="muted small">Prendre</span>
            <div class="qty-stepper">
              <button class="qty-step-btn" data-steal-act="dec">−</button>
              <span class="qty-num" data-steal-qty>1</span>
              <button class="qty-step-btn" data-steal-act="inc">+</button>
            </div>
            <button class="btn-secondary btn-sm" data-steal-confirm>
              <i class="fa-solid fa-hand-fist"></i> Voler
            </button>
          </div>
        </li>`).join('')}
    </ul>
    <div class="modal-actions deck-card-modal-actions">
      <a href="${escapeHtml(cmUrl)}" target="_blank" rel="noopener noreferrer" class="btn-cm">
        <i class="fa-solid fa-arrow-up-right-from-square"></i> Cardmarket
      </a>
    </div>`
}

function stealCopies(from: DeckBuild, id: number, qty: number, targetSection: 'main' | 'extra' | 'side'): void {
  const to = currentDeck()
  if (!to) return
  let remaining = qty
  for (const sec of ['main', 'extra', 'side'] as const) {
    while (remaining > 0) {
      const idx = from[sec].indexOf(id)
      if (idx < 0) break
      from[sec].splice(idx, 1)
      to[targetSection].push(id)
      remaining--
    }
    if (remaining === 0) break
  }
  from.updatedAt = Date.now()
  to.updatedAt = Date.now()
  deps().saveDeckBuilds()
  appLog('info', `${qty} copie(s) de #${id} : « ${from.name} » → « ${to.name} » (${targetSection})`)
  deps().showToast(`Volé : ${qty} copie(s) de « ${from.name} »`, 'success')
  renderDeckSection(targetSection)
  const titleCount = deps().deckBuilderBody.querySelector(`.deck-section[data-section="${targetSection}"] .deck-section-count`)
  if (titleCount) titleCount.textContent = String(to[targetSection].length)
  deps().render()
}
