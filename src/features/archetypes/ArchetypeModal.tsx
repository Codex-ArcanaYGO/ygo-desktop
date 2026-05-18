// Detail modal for a single archetype: header stats + grid of cards.
// Card clicks open the universal <CardModal /> via openCard().

import { useEffect } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import type { CollectionCard, WishlistCard, YGOCard } from '../../types'
import {
  ensureCards,
  computeStats,
  getCachedCards,
} from './state'
import { collectionSig, openCard, wishlistSig } from '../../app/state'
import { useOfflineImage } from '../../lib/image-cache'
import styles from './ArchetypeModal.module.css'

interface Props {
  name:    string
  onClose: () => void
}

export function ArchetypeModal({ name, onClose }: Props): preact.JSX.Element {
  const cards   = useSignal<YGOCard[] | null>(getCachedCards(name))
  const loading = useSignal(!cards.value)

  useEffect(() => {
    cards.value   = getCachedCards(name)
    loading.value = !cards.value
    if (!cards.value) {
      ensureCards(name)
        .then((c) => { cards.value = c })
        .catch(() => { cards.value = [] })
        .finally(() => { loading.value = false })
    }
  }, [name])

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stats = computeStats(cards.value) ?? {
    totalUnique: 0, ownedUnique: 0, totalAllEditions: 0, ownedAllEditions: 0,
  }
  const uniquePct = stats.totalUnique      ? Math.round((stats.ownedUnique      / stats.totalUnique) * 100)      : 0
  const editPct   = stats.totalAllEditions ? Math.round((stats.ownedAllEditions / stats.totalAllEditions) * 100) : 0

  return (
    <div class={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class={styles.modal} role="dialog" aria-modal="true" aria-label={name}>
        <header class={styles.head}>
          <div class={styles.title}>
            <h2><i class="fa-solid fa-tags" /> {name}</h2>
            <p class={styles.subtitle}>
              {stats.totalUnique || (loading.value ? '…' : 0)} carte(s) unique(s)
            </p>
          </div>
          <button class={styles.closeBtn} onClick={onClose} aria-label="Fermer">
            <i class="fa-solid fa-xmark" />
          </button>
        </header>

        <div class={styles.statsRow}>
          <div class={styles.stat}>
            <span class={styles.statLabel}>Cartes uniques</span>
            <span class={styles.statNum}>
              {stats.ownedUnique}
              <span class={styles.statDenom}>/{stats.totalUnique || '–'}</span>
            </span>
            <div class={styles.statBar}>
              <div style={`width:${uniquePct}%`} />
            </div>
          </div>
          <div class={`${styles.stat} ${styles.statStrong}`}>
            <span class={styles.statLabel}>Toutes éditions</span>
            <span class={styles.statNum}>
              {stats.ownedAllEditions}
              <span class={styles.statDenom}>/{stats.totalAllEditions || '–'}</span>
            </span>
            <div class={styles.statBar}>
              <div style={`width:${editPct}%`} />
            </div>
          </div>
        </div>

        <div class={styles.body}>
          {loading.value
            ? (
              <div class={styles.loading}>
                <i class="fa-solid fa-spinner fa-spin" /> Chargement des cartes…
              </div>
            )
            : !cards.value || !cards.value.length
              ? (
                <div class={styles.empty}>
                  <i class="fa-solid fa-circle-exclamation" />
                  <p>Aucune carte trouvée.</p>
                </div>
              )
              : (
                <div class={styles.grid}>
                  {cards.value.map((c) => (
                    <CardTile
                      key={c.id}
                      card={c}
                      collection={collectionSig.value}
                      wishlist={wishlistSig.value}
                    />
                  ))}
                </div>
              )}
        </div>
      </div>
    </div>
  )
}

function CardTile({
  card, collection, wishlist,
}: {
  card:        YGOCard
  collection:  CollectionCard[]
  wishlist:    WishlistCard[]
}): preact.JSX.Element {
  const owned      = collection.find((x) => x.id === card.id)
  const wished     = wishlist.some((x) => x.id === card.id)
  const ownedQty   = owned?.editions?.reduce((s, e) => s + (e.qty || 0), 0) ?? 0
  const imgUrl     = card.card_images?.[0]?.image_url_small ?? ''
  const img        = useOfflineImage(imgUrl || null)

  return (
    <button
      type="button"
      title={card.name}
      class={`${styles.tile} ${owned ? styles.tileOwned : ''} ${wished ? styles.tileWished : ''}`}
      onClick={() => openCard(card.id, 'archetype')}
    >
      <span class={styles.tileImgWrap}>
        {img
          ? <img src={img} alt="" loading="lazy" decoding="async" />
          : <i class="fa-solid fa-image" />}
        {owned
          ? (
            <span class={`${styles.tileFlag} ${styles.tileFlagOwned}`} title={`Possédée ×${ownedQty}`}>
              <i class="fa-solid fa-check" />
              {ownedQty > 1 && <span class={styles.tileQty}>×{ownedQty}</span>}
            </span>
          )
          : wished
            ? (
              <span class={`${styles.tileFlag} ${styles.tileFlagWish}`} title="En wishlist">
                <i class="fa-solid fa-star" />
              </span>
            )
            : null}
      </span>
      <span class={styles.tileName}>{card.name}</span>
    </button>
  )
}
