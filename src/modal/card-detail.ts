// Card detail modal: shown when the user clicks on a card in the collection grid.
// Renders owned editions (with qty steppers), catalog of unowned editions (add
// buttons), Cardmarket link, "voir l'archétype" CTA, and the card description.

import { escapeHtml, cardmarketUrl, looseSetCodeEq, totalQty, catalogSets, cardTotalValue } from '../utils'
import { changeEditionQty, addEditionFromCatalog } from '../collection-crud'
import { fetchById } from '../api'
import { banBadgeHtml } from '../lib/ban-badge'
import { deps, displayName } from './deps'

export function openModal(id: number): void {
  const d = deps()
  const c = d.getCollection().find((x) => x.id === id)
  if (!c) return

  const dn = displayName(c)
  const altName = d.langPref() === 'en' ? c.name : (c.nameEn && c.nameEn !== c.name ? c.nameEn : null)
  const displayDesc = d.langPref() === 'en' && c.descEn ? c.descEn : c.desc

  const ownedEditions = c.editions ?? []
  const ownedCodes = new Set(ownedEditions.map((e) => e.setCode))
  const catalog = catalogSets(c).filter((s) => !ownedCodes.has(s.set_code)).slice(0, 12)

  const setsHtml = `
    <div class="modal-sets">
      <div class="sets-label"><i class="fa-solid fa-layer-group"></i> Éditions possédées</div>
      <div class="sets-table-wrap">
      <table class="sets-table editions-owned">
        ${ownedEditions.map((e) => {
          const setsLookup = [...(c.frSets ?? []), ...(c.allSets ?? [])]
          const sp = setsLookup.find((s) => looseSetCodeEq(s.set_code, e.setCode))?.set_price
          const unitP = sp && Number(sp) > 0 ? Number(sp) : 0
          const lineTotal = unitP * e.qty
          const priceCell = unitP > 0
            ? `<span class="set-price">${unitP.toFixed(2)} €${e.qty > 1 ? ` × ${e.qty} = <strong>${lineTotal.toFixed(2)} €</strong>` : ''}</span>`
            : '—'
          return `
        <tr>
          <td class="set-code">${escapeHtml(e.setCode)}</td>
          <td class="set-name">${escapeHtml(e.setName)}</td>
          <td class="set-rarity">${escapeHtml(e.rarity)}</td>
          <td class="set-price-cell">${priceCell}</td>
          <td class="set-qty">
            <div class="qty-stepper">
              <button class="qty-step-btn" data-edit-action="dec" data-set-code="${escapeHtml(e.setCode)}" title="Retirer">−</button>
              <span class="qty-num">${e.qty}</span>
              <button class="qty-step-btn" data-edit-action="inc" data-set-code="${escapeHtml(e.setCode)}" title="Ajouter">+</button>
            </div>
          </td>
        </tr>`}).join('')}
        ${(() => {
          const total = cardTotalValue(c)
          if (total <= 0 || ownedEditions.length < 2) return ''
          return `<tr class="sets-total-row">
            <td colspan="3" class="sets-total-label"><i class="fa-solid fa-sigma"></i> Total collection</td>
            <td class="set-price-cell"><span class="set-price sets-total-price">${total.toFixed(2)} €</span></td>
            <td></td>
          </tr>`
        })()}
      </table>
      </div>
      ${catalog.length ? `
        <div class="sets-label sets-label-add"><i class="fa-solid fa-plus"></i> Ajouter une édition</div>
        <div class="sets-table-wrap">
        <table class="sets-table editions-catalog">
          ${catalog.map((s) => `
          <tr>
            <td class="set-code">${escapeHtml(s.set_code)}</td>
            <td class="set-name">${escapeHtml(s.set_name)}</td>
            <td class="set-rarity">${escapeHtml(s.set_rarity)}</td>
            <td class="set-price-cell">${s.set_price && Number(s.set_price) > 0 ? `<span class="set-price">${Number(s.set_price).toFixed(2)} €</span>` : '—'}</td>
            <td class="set-add">
              <button class="btn-add-edition" data-edit-action="add" data-set-code="${escapeHtml(s.set_code)}" title="Ajouter cette édition">
                <i class="fa-solid fa-plus"></i>
              </button>
            </td>
          </tr>`).join('')}
        </table>
        </div>` : ''}
    </div>`

  const firstSetEn = (c.allSets ?? [])[0]?.set_name
  const cmUrl = cardmarketUrl(c.nameEn || c.name, firstSetEn)

  const totalValue = cardTotalValue(c)
  const priceHtml = totalValue > 0
    ? `<div class="price-row">
        <span class="muted small">Valeur totale estimée</span>
        <span class="price-value">${totalValue.toFixed(2)} €</span>
       </div>`
    : c.cardmarketPrice
      ? `<div class="price-row">
          <span class="muted small">Prix Cardmarket (moy.)</span>
          <span class="price-value">${Number(c.cardmarketPrice).toFixed(2)} €</span>
         </div>`
      : ''

  d.modalBody.innerHTML = `
    <div class="modal-hero">
      <div class="modal-hero-img" style="position:relative;display:inline-block">
        ${banBadgeHtml(c.id, 'lg')}
        <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" />
      </div>
      <div>
        <div class="modal-id muted small">ID Konami : <code>${c.id}</code></div>
        <h2>${escapeHtml(dn)}</h2>
        ${altName ? `<div class="name-en muted small">${escapeHtml(altName)}</div>` : ''}
        <div class="modal-stats">
          ${c.race      ? `<span class="tag"><i class="fa-solid fa-dragon"></i>${escapeHtml(c.race)}</span>` : ''}
          ${c.attribute ? `<span class="tag"><i class="fa-solid fa-fire"></i>${escapeHtml(c.attribute)}</span>` : ''}
          ${c.level != null ? `<span class="tag"><i class="fa-solid fa-star"></i>Niv.&nbsp;${c.level}</span>` : ''}
          ${c.atk != null   ? `<span class="tag"><i class="fa-solid fa-khanda"></i>ATK&nbsp;${c.atk}</span>` : ''}
          ${c.def != null   ? `<span class="tag"><i class="fa-solid fa-shield"></i>DEF&nbsp;${c.def}</span>` : ''}
          <span class="tag"><i class="fa-solid fa-layer-group"></i>×${totalQty(c)}</span>
        </div>
        ${priceHtml}
        ${setsHtml}
        <div class="modal-actions">
          ${c.archetype
            ? `<button class="btn-archetype" data-open-archetype="${escapeHtml(c.archetype)}" title="Voir tout l'archétype">
                 <i class="fa-solid fa-tags"></i> ${escapeHtml(c.archetype)}
               </button>`
            : ''}
          <a href="${escapeHtml(cmUrl)}" target="_blank" rel="noopener noreferrer" class="btn-cm">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Voir sur Cardmarket
          </a>
        </div>
        <p class="desc">${escapeHtml(displayDesc ?? 'Pas de description disponible.')}</p>
      </div>
    </div>`
  d.modalEl.hidden = false

  d.modalBody.querySelectorAll<HTMLElement>('[data-edit-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const setCode = btn.dataset.setCode!
      switch (btn.dataset.editAction) {
        case 'inc': changeEditionQty(c.id, setCode, +1); break
        case 'dec': changeEditionQty(c.id, setCode, -1); break
        case 'add': addEditionFromCatalog(c.id, setCode); break
      }
    })
  })

  // "Voir l'archétype" button (if known) → switch view & open modal
  d.modalBody.querySelector<HTMLButtonElement>('[data-open-archetype]')?.addEventListener('click', (e) => {
    const name = (e.currentTarget as HTMLElement).dataset.openArchetype
    if (!name) return
    d.modalEl.hidden = true
    d.openArchetype(name)
  })

  // Lazy backfill of archetype if missing (one shot per modal open)
  if (!c.archetype) {
    void (async () => {
      const fresh = await fetchById(c.id)
      if (!fresh?.archetype) return
      const live = d.getCollection().find((x) => x.id === c.id)
      if (!live || live.archetype) return
      live.archetype = fresh.archetype
      d.saveCollection()
    })()
  }
}
