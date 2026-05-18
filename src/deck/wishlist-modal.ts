// Deck wishlist modal: show what's missing (to add) and what is already
// in the wishlist (to remove).

import { escapeHtml } from '../utils'
import { addBatchToWishlist, removeBatchFromWishlist } from '../wishlist'
import { downloadFile, safeFilename, todayIso } from '../lib/download'
import { createOverlayModal } from '../lib/overlay-modal'
import { deps, currentDeck, ownedCountInCollection, wishlistQty } from './state'

export function openDeckWishlistModal(mode: 'missing' | 'remove' = 'missing'): void {
  const deck = currentDeck()
  if (!deck) return

  const countById = new Map<number, number>()
  for (const id of [...deck.main, ...deck.extra, ...deck.side])
    countById.set(id, (countById.get(id) ?? 0) + 1)

  const collection = deps().getCollection()
  const cache = deps().cardCache

  const missingItems = [...countById.entries()]
    .map(([id, needed]) => ({
      id,
      needed,
      missing: Math.max(0, needed - ownedCountInCollection(id)),
      inWish: wishlistQty(id),
      name: cache.get(id)?.name ?? collection.find((c) => c.id === id)?.name ?? `#${id}`,
    }))
    .filter((item) => item.missing > 0)

  const wishIds = [...countById.keys()].filter((id) => wishlistQty(id) > 0)
  const wishCardItems = wishIds.map((id) => ({
    id,
    inWish: wishlistQty(id),
    name: cache.get(id)?.name ?? collection.find((c) => c.id === id)?.name ?? `#${id}`,
  }))
  const totalMissing = missingItems.reduce((s, i) => s + i.missing, 0)

  if (mode === 'missing' && missingItems.length === 0 && wishIds.length > 0) mode = 'remove'
  if (mode === 'remove'  && wishIds.length === 0) mode = 'missing'

  const m = createOverlayModal({ id: 'deckWishOverlay', contentClass: 'deck-wish-modal-content' })

  const toggleHtml = `
    <div class="dcm-mode-toggle">
      <button class="dcm-mode-btn${mode === 'missing' ? ' active' : ''}" data-dw-mode="missing">
        <i class="fa-solid fa-circle-xmark"></i> Manquantes${missingItems.length > 0 ? ` <span class="db-missing-badge">${totalMissing}</span>` : ''}
      </button>
      <button class="dcm-mode-btn${mode === 'remove' ? ' active' : ''}" data-dw-mode="remove">
        <i class="fa-regular fa-bookmark"></i> En wishlist${wishIds.length > 0 ? ` <span class="db-missing-badge" style="background:color-mix(in srgb, var(--accent) 16%, transparent);color:var(--accent)">${wishIds.length}</span>` : ''}
      </button>
    </div>`

  const missingContent = missingItems.length === 0
    ? `<p class="deck-wish-complete"><i class="fa-solid fa-circle-check"></i> Toutes les cartes sont possédées !</p>`
    : `<p class="muted small"><b>${missingItems.length}</b> carte${missingItems.length > 1 ? 's' : ''} manquante${missingItems.length > 1 ? 's' : ''} · <b>${totalMissing}</b> copie${totalMissing > 1 ? 's' : ''} à acquérir</p>
      <div class="deck-wish-mode">
        <label class="deck-wish-mode-label">
          <input type="radio" name="dwMode" value="accumulate" checked />
          <span><b>Accumuler</b> <span class="muted small">– additionner aux quantités existantes</span></span>
        </label>
        <label class="deck-wish-mode-label">
          <input type="radio" name="dwMode" value="replace" />
          <span><b>Remplacer</b> <span class="muted small">– écraser les quantités existantes</span></span>
        </label>
      </div>
      <ul class="deck-wish-list">
        ${missingItems.map((item) => `
          <li class="deck-wish-item">
            <span class="deck-wish-name">${escapeHtml(item.name)}</span>
            <span class="deck-wish-meta">
              <span class="deck-wish-missing">−${item.missing}</span>
              ${item.inWish > 0 ? `<span class="deck-wish-already">wish: ${item.inWish}</span>` : ''}
            </span>
          </li>`).join('')}
      </ul>
      <div class="deck-wish-actions">
        <button class="btn-primary" id="dwAddBtn">
          <i class="fa-regular fa-bookmark"></i> Ajouter à la wishlist
        </button>
        <button class="btn-secondary btn-sm" id="dwExportBtn" title="Exporter les manquantes (Cardmarket)">
          <i class="fa-solid fa-file-export"></i> Exporter .txt
        </button>
      </div>`

  const removeContent = wishIds.length === 0
    ? `<p class="muted small">Aucune carte du deck n’est en wishlist.</p>`
    : `<p class="muted small"><b>${wishIds.length}</b> carte${wishIds.length > 1 ? 's' : ''} du deck sont dans ta wishlist</p>
      <ul class="deck-wish-list">
        ${wishCardItems.map((item) => `
          <li class="deck-wish-item">
            <span class="deck-wish-name">${escapeHtml(item.name)}</span>
            <span class="deck-wish-meta">
              <span class="deck-wish-already" style="color:var(--accent)">wish: ${item.inWish}</span>
            </span>
          </li>`).join('')}
      </ul>
      <button class="btn-danger btn-sm" id="dwRemoveBtn">
        <i class="fa-solid fa-trash"></i> Retirer les ${wishIds.length} carte${wishIds.length > 1 ? 's' : ''} de la wishlist
      </button>`

  m.setContent(`
    <div class="deck-wish-modal-body">
      <h2 class="steal-title"><i class="fa-regular fa-bookmark"></i> Wishlist · ${escapeHtml(deck.name)}</h2>
      ${toggleHtml}
      ${mode === 'missing' ? missingContent : removeContent}
    </div>`)
  m.open()

  m.content.querySelectorAll<HTMLButtonElement>('[data-dw-mode]').forEach((btn) => {
    btn.addEventListener('click', () => openDeckWishlistModal(btn.dataset.dwMode as 'missing' | 'remove'))
  })

  m.content.querySelector('#dwAddBtn')?.addEventListener('click', () => {
    const addMode = (m.content.querySelector<HTMLInputElement>('input[name="dwMode"]:checked')?.value ?? 'accumulate') as 'accumulate' | 'replace'
    const items = missingItems.flatMap((item) => {
      const card = cache.get(item.id)
      return card ? [{ card, qty: item.missing }] : []
    })
    const skipped = missingItems.length - items.length
    const { added, updated } = addBatchToWishlist(items, addMode)
    const parts: string[] = []
    if (added)   parts.push(`${added} ajoutée${added   > 1 ? 's' : ''}`)
    if (updated) parts.push(`${updated} mise${updated > 1 ? 's' : ''} à jour`)
    if (skipped) parts.push(`${skipped} ignorée${skipped > 1 ? 's' : ''} (données manquantes)`)
    deps().showToast(`Wishlist : ${parts.join(', ')}`, 'success')
    m.close()
  })

  m.content.querySelector('#dwExportBtn')?.addEventListener('click', () => {
    const lines = missingItems.map((item) => `${item.missing} ${item.name}`)
    downloadFile(lines.join('\n'), `${safeFilename(deck.name)}-missing-${todayIso()}.txt`)
    deps().showToast(`Export : ${missingItems.length} cartes manquantes`, 'success')
  })

  m.content.querySelector('#dwRemoveBtn')?.addEventListener('click', () => {
    if (!confirm(`Retirer ${wishIds.length} carte(s) du deck de votre wishlist ?`)) return
    const removed = removeBatchFromWishlist(wishIds)
    deps().showToast(`${removed} carte${removed > 1 ? 's' : ''} retirée${removed > 1 ? 's' : ''} de la wishlist`, 'success')
    m.close()
  })
}
