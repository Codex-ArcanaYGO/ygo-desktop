import type { YGOCard, WishlistCard, CollectionCard, OwnedEdition } from './types'
import { deriveFrSets, defaultEditionFromSets } from './utils'

export interface WishlistDeps {
  getWishlist: () => WishlistCard[]
  setWishlist: (w: WishlistCard[]) => void
  saveWishlist: () => void
  saveCollection: () => void
  render: () => void
  showToast: (msg: string, kind?: 'success' | 'error', withUndo?: boolean) => void
  addCardToCollection: (card: YGOCard, enCard: YGOCard | undefined, edition: OwnedEdition | undefined) => void
}

let deps: WishlistDeps

export function initWishlist(d: WishlistDeps): void { deps = d }

export function addToWishlist(card: YGOCard, enCard: YGOCard | undefined, qty: number): void {
  const wishlist = deps.getWishlist()
  const existing = wishlist.find((w) => w.id === card.id)
  if (existing) {
    existing.wantedQty += qty
    deps.showToast(`Wishlist : « ${existing.name} » ×${existing.wantedQty}`, 'success')
  } else {
    const rich = enCard ?? card
    const allSets = rich.card_sets ?? []
    const frSets  = deriveFrSets(allSets)
    const cmPrice = rich.card_prices?.[0]?.cardmarket_price
    wishlist.unshift({
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
      wantedQty: qty,
      addedAt: Date.now(),
      frSets,
      allSets,
      cardmarketPrice: cmPrice && Number(cmPrice) > 0 ? cmPrice : undefined,
    })
    deps.showToast(`Wishlist : « ${card.name} » ajoutée`, 'success')
  }
  deps.saveWishlist()
  deps.render()
}

export function bumpWish(id: number, delta: number): void {
  const wishlist = deps.getWishlist()
  const w = wishlist.find((x) => x.id === id)
  if (!w) return
  w.wantedQty += delta
  if (w.wantedQty <= 0) deps.setWishlist(wishlist.filter((x) => x.id !== id))
  deps.saveWishlist()
  deps.render()
}

export function removeFromWishlist(id: number): void {
  const w = deps.getWishlist().find((x) => x.id === id)
  if (!w) return
  if (!confirm(`Retirer « ${w.name} » de la wishlist ?`)) return
  deps.setWishlist(deps.getWishlist().filter((x) => x.id !== id))
  deps.saveWishlist()
  deps.showToast(`« ${w.name} » retirée`, 'success')
  deps.render()
}

export function moveWishToCollection(id: number): void {
  const w = deps.getWishlist().find((x) => x.id === id)
  if (!w) return
  const edition = defaultEditionFromSets(w.frSets ?? [], w.allSets ?? [])
  if (!edition) { deps.showToast('Aucune édition connue.', 'error'); return }
  edition.qty = w.wantedQty
  const synth: YGOCard = {
    id: w.id, name: w.name, type: w.type ?? '', desc: w.desc ?? '',
    race: w.race, attribute: w.attribute, atk: w.atk, def: w.def, level: w.level,
    card_images: [{ id: w.id, image_url: w.image, image_url_small: w.imageSmall }],
    card_sets: w.allSets,
    card_prices: w.cardmarketPrice ? [{ cardmarket_price: w.cardmarketPrice, tcgplayer_price: '0' }] : undefined,
  }
  const synthEn: YGOCard = { ...synth, name: w.nameEn ?? w.name, desc: w.descEn ?? w.desc ?? '' }
  deps.addCardToCollection(synth, synthEn, edition)
  deps.setWishlist(deps.getWishlist().filter((x) => x.id !== id))
  deps.saveWishlist()
  deps.render()
}

export async function downloadWishlistCardmarket(): Promise<void> {
  const wishlist = deps.getWishlist()
  if (!wishlist.length) return
  const lines = wishlist.map((w) => `${w.wantedQty} ${w.nameEn ?? w.name}`)
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Clipboard write failed:', err)
  }
}

export function addBatchToWishlist(
  items: Array<{ card: YGOCard; qty: number }>,
  mode: 'accumulate' | 'replace',
): { added: number; updated: number } {
  const wishlist = deps.getWishlist()
  let added = 0
  let updated = 0
  for (const { card, qty } of items) {
    if (qty <= 0) continue
    const existing = wishlist.find((w) => w.id === card.id)
    if (existing) {
      if (mode === 'accumulate') existing.wantedQty += qty
      else existing.wantedQty = qty
      updated++
    } else {
      const allSets = card.card_sets ?? []
      const frSets  = deriveFrSets(allSets)
      const cmPrice = card.card_prices?.[0]?.cardmarket_price
      wishlist.unshift({
        id: card.id,
        name: card.name,
        nameEn: card.name,
        type: card.type,
        desc: card.desc,
        race: card.race,
        attribute: card.attribute,
        atk: card.atk,
        def: card.def,
        level: card.level,
        image: card.card_images?.[0]?.image_url ?? '',
        imageSmall: card.card_images?.[0]?.image_url_small ?? '',
        wantedQty: qty,
        addedAt: Date.now(),
        frSets,
        allSets,
        cardmarketPrice: cmPrice && Number(cmPrice) > 0 ? cmPrice : undefined,
      })
      added++
    }
  }
  deps.saveWishlist()
  deps.render()
  return { added, updated }
}

export function removeBatchFromWishlist(ids: number[]): number {
  const idSet = new Set(ids)
  const wishlist = deps.getWishlist()
  const before = wishlist.length
  deps.setWishlist(wishlist.filter((w) => !idSet.has(w.id)))
  deps.saveWishlist()
  deps.render()
  return before - deps.getWishlist().length
}

// Used to compute the missing edition fallback when moving from wishlist
export type { CollectionCard }
