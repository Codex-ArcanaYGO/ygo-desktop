// Edition picker: shown after the user adds a card via search. Lets them pick
// one or more editions (qty per edition) before the card is committed to the
// collection. Falls back to a "no edition" prompt if YGOPRODeck has no set data.

import type { YGOCard } from '../types'
import { escapeHtml, deriveFrSets, addEditionTo } from '../utils'
import { appLog } from '../logger'
import { addCardToCollection, addWithoutEdition } from '../collection-crud'
import { deps } from './deps'

interface PickState { setCode: string; setName: string; rarity: string; qty: number }

export function openEditionPicker(frCard: YGOCard, enCard: YGOCard, defaultQty = 1): void {
  const d = deps()
  const allSets = enCard.card_sets ?? frCard.card_sets ?? []
  const frSets  = deriveFrSets(allSets)
  const sets    = frSets.length ? frSets : allSets
  appLog('info', `Picker ouvert pour « ${frCard.name} »`, { frSets: frSets.length, allSets: allSets.length, sets: sets.length })

  if (!sets.length) {
    _renderNoEditionFallback(frCard, enCard)
    return
  }

  const state: PickState[] = sets.map((s, i) => ({
    setCode: s.set_code, setName: s.set_name, rarity: s.set_rarity, qty: i === 0 ? defaultQty : 0,
  }))

  const title = d.langPref() === 'en' ? enCard.name : frCard.name
  const img   = frCard.card_images?.[0]?.image_url_small ?? frCard.card_images?.[0]?.image_url ?? ''

  const paint = (): void => {
    d.pickerBody.innerHTML = `
      <div class="picker-hero">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(frCard.name)}" />
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="muted small">Choisissez la ou les éditions à ajouter.</p>
        </div>
      </div>
      <div class="picker-rows">
        ${state.map((e, i) => `
          <div class="picker-row" data-idx="${i}">
            <div class="picker-row-info">
              <div class="set-code">${escapeHtml(e.setCode)}</div>
              <div class="set-name">${escapeHtml(e.setName)}</div>
              <div class="set-rarity muted small">${escapeHtml(e.rarity)}${(() => { const p = sets[i]?.set_price; return p && Number(p) > 0 ? ` · <span class="set-price">${Number(p).toFixed(2)} €</span>` : '' })()}</div>
            </div>
            <div class="qty-stepper picker-stepper">
              <button class="qty-step-btn" data-pick="dec" data-idx="${i}">−</button>
              <span class="qty-num">${e.qty}</span>
              <button class="qty-step-btn" data-pick="inc" data-idx="${i}">+1</button>
              <button class="qty-step-btn qty-step-small" data-pick="inc2" data-idx="${i}">+2</button>
              <button class="qty-step-btn qty-step-small" data-pick="inc3" data-idx="${i}">+3</button>
            </div>          </div>`).join('')}
      </div>
      <div class="picker-actions">
        <button class="btn-ghost-warn" data-pick="unknown" title="Mon édition n'est pas dans la liste">
          <i class="fa-solid fa-triangle-exclamation"></i> Sans édition
        </button>
        <button class="btn-secondary" data-pick="cancel">Annuler</button>
        <button class="btn-primary" data-pick="confirm">
          <i class="fa-solid fa-check"></i> Ajouter
        </button>
      </div>`

    d.pickerBody.querySelectorAll<HTMLElement>('[data-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.pick!
        if (action === 'cancel')  { d.pickerEl.hidden = true; return }
        if (action === 'unknown') {
          d.pickerEl.hidden = true
          appLog('warn', `Ajout sans édition (choix utilisateur) : « ${frCard.name} »`)
          addWithoutEdition(frCard, enCard)
          return
        }
        if (action === 'confirm') {
          _confirmPicks(frCard, enCard, state)
          return
        }
        const idx = Number(btn.dataset.idx)
        if (action === 'inc')       state[idx].qty += 1
        else if (action === 'inc2') state[idx].qty += 2
        else if (action === 'inc3') state[idx].qty += 3
        else if (action === 'dec' && state[idx].qty > 0) state[idx].qty--
        paint()
      })
    })
  }

  paint()
  d.pickerEl.hidden = false
}

function _renderNoEditionFallback(frCard: YGOCard, enCard: YGOCard): void {
  const d = deps()
  const title = d.langPref() === 'en' ? enCard.name : frCard.name
  const img   = frCard.card_images?.[0]?.image_url_small ?? frCard.card_images?.[0]?.image_url ?? ''
  d.pickerBody.innerHTML = `
    <div class="picker-hero">
      <img src="${escapeHtml(img)}" alt="${escapeHtml(frCard.name)}" />
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p class="muted small">Aucune édition connue pour cette carte.</p>
      </div>
    </div>
    <div class="picker-no-edition-msg">
      <i class="fa-solid fa-triangle-exclamation"></i>
      Impossible de récupérer les éditions disponibles (carte trop récente ou absente de l'API).<br>
      Vous pouvez ajouter la carte <strong>sans édition</strong> et la compléter plus tard.
    </div>
    <div class="picker-actions">
      <button class="btn-secondary" data-pick="cancel">Annuler</button>
      <button class="btn-warning" data-pick="unknown">
        <i class="fa-solid fa-triangle-exclamation"></i> Ajouter sans édition
      </button>
    </div>`
  d.pickerEl.hidden = false
  d.pickerBody.querySelectorAll<HTMLElement>('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      d.pickerEl.hidden = true
      if (btn.dataset.pick === 'unknown') {
        appLog('warn', `Ajout sans édition : « ${frCard.name} »`)
        addWithoutEdition(frCard, enCard)
      }
    })
  })
}

function _confirmPicks(frCard: YGOCard, enCard: YGOCard, state: PickState[]): void {
  const d = deps()
  const picks = state.filter((s) => s.qty > 0)
  if (!picks.length) { d.pickerEl.hidden = true; return }
  let first = true
  for (const p of picks) {
    if (first) {
      addCardToCollection(frCard, enCard, { setCode: p.setCode, setName: p.setName, rarity: p.rarity, qty: p.qty })
      first = false
    } else {
      const existing = d.getCollection().find((c) => c.id === frCard.id)
      if (existing) {
        addEditionTo(existing, { setCode: p.setCode, setName: p.setName, rarity: p.rarity, qty: p.qty })
      }
    }
  }
  d.saveCollection()
  d.pickerEl.hidden = true
}
