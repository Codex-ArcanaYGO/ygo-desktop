import type { YGOCard, CollectionCard, OwnedEdition, View } from './types'
import { UNKNOWN_EDITION_CODE, SET_CODE_RE, SET_CODE_SHORT_RE } from './constants'
import { normalize, deriveFrSets, looseSetCodeEq, addEditionTo, buildEnCode, defaultEditionFromSets } from './utils'
import { appLog } from './logger'
import { searchCards, fetchById, fetchFrById } from './api'
import { addToWishlist } from './wishlist'
import { openEditionPicker, openModal } from './modal'

export interface CrudDeps {
  getCollection: () => CollectionCard[]
  setCollection: (c: CollectionCard[]) => void
  saveCollection: () => void
  getDecks: () => string[]
  saveDecks: () => void
  render: () => void
  showToast: (msg: string, kind?: 'success' | 'error', withUndo?: boolean) => void
  showError: (msg: string) => void
  hideError: () => void
  pushHistory: (label: string, cardId: number, snapshot: CollectionCard | null) => void
  pushSearchHistory: (q: string) => void
  resetInput: () => void
  fullQuery: () => string
  displayName: (c: CollectionCard) => string
  currentView: () => View
  modalEl: HTMLDivElement
}

let deps!: CrudDeps
let addBtns: HTMLButtonElement[] = []

export function initCollectionCrud(d: CrudDeps): void {
  deps = d
  addBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.btn-add-qty'))
  addBtns.forEach((btn) => {
    btn.addEventListener('click', () => void handleAdd(Number(btn.dataset.qty ?? 1), btn))
  })
}

export async function handleAdd(qty = 1, clickedBtn?: HTMLButtonElement): Promise<void> {
  const q = deps.fullQuery()
  if (!q) return
  deps.pushSearchHistory(q)
  // Disable all add buttons and show spinner on the active one
  const activeBtn = clickedBtn ?? addBtns[0]
  const origHtml = activeBtn?.innerHTML ?? ''
  addBtns.forEach((b) => { b.disabled = true })
  if (activeBtn) activeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'
  deps.hideError()
  appLog('info', `handleAdd: « ${q} » qty=${qty}`)
  try {
    const results = await searchCards(q)
    appLog('info', `handleAdd résultats: ${results.length}`, results.slice(0, 5).map(c => c.name))
    if (!results.length) {
      if (/^\d+$/.test(q)) {
        deps.showError(`Aucune carte trouvée pour l'ID « ${q} ».`)
      } else if (SET_CODE_RE.test(q) || SET_CODE_SHORT_RE.test(q)) {
        deps.showError(`Aucune carte trouvée pour le code « ${q} ».`)
      } else {
        deps.showError(`Aucune carte trouvée pour « ${q} ». Vérifiez l'orthographe.`)
      }
      return
    }
    const setMatch = q.match(SET_CODE_RE) ?? q.match(SET_CODE_SHORT_RE)
    if (setMatch) {
      const candidate = results[0]
      const [frCard, enCard] = await Promise.all([
        fetchFrById(candidate.id).then((c) => c ?? candidate),
        fetchById(candidate.id).then((c) => c ?? candidate),
      ])
      if (deps.currentView() === 'wishlist') {
        addToWishlist(frCard, enCard, qty)
        deps.resetInput()
        return
      }
      const enCode = buildEnCode(q)
      const enSet  = (enCard.card_sets ?? []).find((s) => looseSetCodeEq(s.set_code, enCode))
      const edition: OwnedEdition | undefined = enSet ? {
        setCode: enSet.set_code.replace(/-EN(\w)/i, '-FR$1'),
        setName: enSet.set_name,
        rarity:  enSet.set_rarity,
        qty,
      } : undefined
      addCardToCollection(frCard, enCard, edition)
      deps.resetInput()
      return
    }

    const exact = results.find((c) => normalize(c.name) === normalize(q))
    const candidate = exact ?? results[0]
    const [frCard, enCard] = await Promise.all([
      fetchFrById(candidate.id).then((c) => c ?? candidate),
      fetchById(candidate.id).then((c) => c ?? candidate),
    ])
    if (deps.currentView() === 'wishlist') {
      addToWishlist(frCard, enCard, qty)
      deps.resetInput()
      return
    }
    openEditionPicker(frCard, enCard, qty)
    deps.resetInput()
  } catch (err) {
    appLog('error', 'handleAdd erreur réseau', String(err))
    console.error(err)
    deps.showError('Erreur réseau. Vérifiez votre connexion internet.')
  } finally {
    addBtns.forEach((b) => { b.disabled = false })
    if (activeBtn) activeBtn.innerHTML = origHtml
  }
}

export function addWithoutEdition(card: YGOCard, enCard: YGOCard | undefined): void {
  appLog('warn', `addWithoutEdition: « ${card.name} »`)
  const unknownEdition: OwnedEdition = { setCode: UNKNOWN_EDITION_CODE, setName: '?', rarity: '?', qty: 1 }
  addCardToCollection(card, enCard, unknownEdition)
}

export function addCardToCollection(card: YGOCard, enCard: YGOCard | undefined, edition: OwnedEdition | undefined): void {
  const collection = deps.getCollection()
  const existing = collection.find((c) => c.id === card.id)
  if (existing) {
    const target = edition ?? defaultEditionFromSets(existing.frSets ?? [], existing.allSets ?? [])
    if (!target) { deps.showToast('Aucune édition connue.', 'error'); return }
    const snapshot = structuredClone(existing)
    addEditionTo(existing, target)
    existing.addedAt = Date.now()
    deps.pushHistory(`+${target.qty} « ${deps.displayName(existing)} » (${target.setCode})`, existing.id, snapshot)
    deps.showToast(`+${target.qty} « ${deps.displayName(existing)} » (${target.setCode})`, 'success', true)
  } else {
    const rich = enCard ?? card
    const allSets = rich.card_sets ?? []
    const frSets = deriveFrSets(allSets)
    const cmPrice = rich.card_prices?.[0]?.cardmarket_price
    const finalEdition = edition ?? defaultEditionFromSets(frSets, allSets)
    if (!finalEdition) {
      if (!confirm(`Aucune édition trouvée pour « ${card.name} ».\nAjouter quand même sans édition (à compléter) ?`)) return
      addWithoutEdition(card, enCard)
      return
    }

    collection.unshift({
      id: card.id,
      name: card.name,
      nameEn: enCard?.name ?? card.name,
      type: card.type,
      desc: card.desc,
      descEn: enCard?.desc,
      race: card.race,
      attribute: card.attribute,
      atk: card.atk,
      def: card.def,
      level: card.level,
      image: card.card_images?.[0]?.image_url ?? '',
      imageSmall: card.card_images?.[0]?.image_url_small ?? '',
      editions: [finalEdition],
      addedAt: Date.now(),
      frSets,
      allSets,
      cardmarketPrice: cmPrice && Number(cmPrice) > 0 ? cmPrice : undefined,
      archetype: rich.archetype ?? card.archetype,
    })
    deps.pushHistory(`Ajout « ${card.name} » (${finalEdition.setCode})`, card.id, null)
    deps.showToast(`« ${card.name} » ajoutée (${finalEdition.setCode})`, 'success', true)
  }
  deps.saveCollection()
  deps.render()
}

export function changeEditionQty(cardId: number, setCode: string, delta: number): void {
  const collection = deps.getCollection()
  const c = collection.find((x) => x.id === cardId)
  if (!c) return
  const e = c.editions.find((x) => x.setCode === setCode)
  if (!e) return
  const snapshot = structuredClone(c)
  e.qty += delta
  if (e.qty <= 0) c.editions = c.editions.filter((x) => x.setCode !== setCode)
  if (c.editions.length === 0) {
    deps.pushHistory(`Suppression « ${deps.displayName(c)} »`, cardId, snapshot)
    deps.setCollection(collection.filter((x) => x.id !== cardId))
    deps.showToast(`« ${deps.displayName(c)} » retirée`, 'success', true)
    deps.modalEl.hidden = true
  } else {
    c.addedAt = Date.now()
    const verb = delta > 0 ? `+${delta}` : `${delta}`
    deps.pushHistory(`${verb} « ${deps.displayName(c)} » (${setCode})`, cardId, snapshot)
    deps.showToast(`${verb} « ${deps.displayName(c)} » (${setCode})`, 'success', true)
  }
  deps.saveCollection()
  deps.render()
  if (!deps.modalEl.hidden && deps.getCollection().some((x) => x.id === cardId)) openModal(cardId)
}

export function addEditionFromCatalog(cardId: number, setCode: string): void {
  const c = deps.getCollection().find((x) => x.id === cardId)
  if (!c) return
  const catalog = (c.frSets?.length ? c.frSets : (c.allSets ?? []))
  const fromCatalog = catalog.find((s) => s.set_code === setCode)
  if (!fromCatalog) return
  const snapshot = structuredClone(c)
  addEditionTo(c, {
    setCode: fromCatalog.set_code,
    setName: fromCatalog.set_name,
    rarity:  fromCatalog.set_rarity,
    qty: 1,
  })
  c.addedAt = Date.now()
  deps.pushHistory(`Nouvelle édition « ${deps.displayName(c)} » (${setCode})`, cardId, snapshot)
  deps.saveCollection()
  deps.render()
  if (!deps.modalEl.hidden) openModal(cardId)
}

export function bumpFirstEdition(cardId: number, delta: number): void {
  const c = deps.getCollection().find((x) => x.id === cardId)
  if (!c || !c.editions.length) return
  changeEditionQty(cardId, c.editions[0].setCode, delta)
}

export function removeCard(id: number): void {
  const c = deps.getCollection().find((x) => x.id === id)
  if (!c) return
  if (!confirm(`Supprimer « ${c.name} » de la collection ?`)) return
  deps.setCollection(deps.getCollection().filter((x) => x.id !== id))
  deps.saveCollection()
  deps.showToast(`« ${c.name} » supprimée`, 'success')
  deps.render()
}

export function toggleLike(id: number): void {
  const c = deps.getCollection().find((x) => x.id === id)
  if (!c) return
  c.liked = !c.liked
  deps.saveCollection()
  deps.render()
}

export function setDeck(id: number, deckName: string | null): void {
  const c = deps.getCollection().find((x) => x.id === id)
  if (!c) return
  if (deckName) {
    c.deck = deckName
    const decks = deps.getDecks()
    if (!decks.includes(deckName)) {
      decks.push(deckName)
      deps.saveDecks()
    }
  } else {
    delete c.deck
  }
  deps.saveCollection()
  deps.render()
}
