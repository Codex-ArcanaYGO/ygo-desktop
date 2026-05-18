// Universal card modal — works for ANY YGOCard regardless of source
// (collection, wishlist, archetype, search). For collection cards, defers to
// the legacy edition-editor modal (feature-rich) to avoid duplicating that UX.
//
// Subscribes to `cardModalSig` from app/state. Renders a portal-style backdrop
// when set; a single Preact root in main.tsx hosts this component.

import { useEffect } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import type { YGOCard } from '../../types'
import { fetchById } from '../../api'
import { cardmarketUrl } from '../../utils'
import { getBanStatus, type BanStatus } from '../../lib/banlist'
import {
  cardModalSig,
  closeCard,
  collectionSig,
  langSig,
  openCard as _openCard,
  wishlistSig,
} from '../../app/state'
import { openArchetypeExternal } from '../../features/archetypes/ArchetypesView'
import styles from './CardModal.module.css'

void _openCard // re-export anchor

/**
 * Hook a callback for opening the LEGACY collection-card modal (which has the
 * full edition-editor UI). Wired from main.tsx so we don't import the legacy
 * module here (no circular deps).
 */
let _openLegacyCollectionModal: ((id: number) => void) | null = null
let _switchToArchetypesView:    (() => void)             | null = null
export function wireCardModal(opts: {
  openLegacyCollection: (id: number) => void
  switchToArchetypes:   () => void
}): void {
  _openLegacyCollectionModal = opts.openLegacyCollection
  _switchToArchetypesView    = opts.switchToArchetypes
}

export function CardModal(): preact.JSX.Element | null {
  const ctx = cardModalSig.value
  const card    = useSignal<YGOCard | null>(null)
  const loading = useSignal(false)

  useEffect(() => {
    if (!ctx) { card.value = null; return }
    // Collection source → use legacy modal (richer edition editor) and bail.
    if (ctx.source === 'collection') {
      const id = ctx.cardId
      closeCard()
      _openLegacyCollectionModal?.(id)
      return
    }
    card.value   = null
    loading.value = true
    fetchById(ctx.cardId)
      .then((c) => { card.value = c })
      .catch(() => { card.value = null })
      .finally(() => { loading.value = false })
  }, [ctx?.cardId, ctx?.source])

  // ESC closes
  useEffect(() => {
    if (!ctx) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCard() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctx])

  if (!ctx || ctx.source === 'collection') return null

  return (
    <div
      class={styles.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) closeCard() }}
    >
      <div class={styles.modal} role="dialog" aria-modal="true">
        <header class={styles.head}>
          <span class={styles.headTitle}>
            {ctx.source === 'wishlist'  ? 'Wishlist'
              : ctx.source === 'archetype' ? 'Archétype'
              : 'Carte'}
          </span>
          <button class={styles.closeBtn} onClick={closeCard} aria-label="Fermer">
            <i class="fa-solid fa-xmark" />
          </button>
        </header>

        {loading.value && !card.value
          ? <div class={styles.loading}><i class="fa-solid fa-spinner fa-spin" /> Chargement…</div>
          : !card.value
            ? <div class={styles.loading}>Carte introuvable.</div>
            : <CardBody card={card.value} />}
      </div>
    </div>
  )
}

function CardBody({ card }: { card: YGOCard }): preact.JSX.Element {
  const ownedEntry = collectionSig.value.find((c) => c.id === card.id)
  const owned      = !!ownedEntry
  const ownedQty   = ownedEntry?.editions?.reduce((s, e) => s + (e.qty || 0), 0) ?? 0
  const wished     = wishlistSig.value.find((w) => w.id === card.id)
  const lang       = langSig.value
  const altName    = lang === 'en' ? null : (card.name)
  const desc       = card.desc ?? ''
  const img        = card.card_images?.[0]?.image_url ?? card.card_images?.[0]?.image_url_small ?? ''
  const cmPrice    = card.card_prices?.[0]?.cardmarket_price
  const firstSet   = card.card_sets?.[0]?.set_name
  const cmHref     = cardmarketUrl(card.name, firstSet)

  return (
    <div class={styles.hero}>
      <div style="position:relative;display:inline-block">
        <BanBadge cardId={card.id} />
        <img src={img} alt={card.name} />
      </div>
      <div class={styles.info}>
        <div class={styles.id}>ID Konami : <code>{card.id}</code></div>
        <h2 class={styles.name}>{card.name}</h2>
        {altName && altName !== card.name && (
          <div class={styles.altName}>{altName}</div>
        )}

        <div class={styles.tagsRow}>
          {card.race      && <span class={styles.tag}><i class="fa-solid fa-dragon" />{card.race}</span>}
          {card.attribute && <span class={styles.tag}><i class="fa-solid fa-fire" />{card.attribute}</span>}
          {card.level != null && <span class={styles.tag}><i class="fa-solid fa-star" />Niv.&nbsp;{card.level}</span>}
          {card.atk != null   && <span class={styles.tag}><i class="fa-solid fa-khanda" />ATK&nbsp;{card.atk}</span>}
          {card.def != null   && <span class={styles.tag}><i class="fa-solid fa-shield" />DEF&nbsp;{card.def}</span>}
          {card.archetype && <span class={styles.tag}><i class="fa-solid fa-tags" />{card.archetype}</span>}
        </div>

        <div class={styles.statusRow}>
          {owned && (
            <span class={`${styles.statusBadge} ${styles.statusOwned}`}>
              <i class="fa-solid fa-check" /> Possédée ×{ownedQty}
            </span>
          )}
          {wished && (
            <span class={`${styles.statusBadge} ${styles.statusWish}`}>
              <i class="fa-solid fa-bookmark" /> Wishlist ×{wished.wantedQty}
            </span>
          )}
          {!owned && !wished && (
            <span class={`${styles.statusBadge}`} style="background:var(--border);color:var(--text-muted)">
              Pas encore dans votre collection
            </span>
          )}
        </div>

        {cmPrice && Number(cmPrice) > 0 && (
          <div class={styles.priceRow}>
            <span class="muted small">Prix Cardmarket (moy.)</span>
            <span class={styles.priceValue}>{Number(cmPrice).toFixed(2)} €</span>
          </div>
        )}

        <div class={styles.actions}>
          {card.archetype && (
            <button
              class={styles.btn}
              onClick={() => {
                const name = card.archetype!
                closeCard()
                _switchToArchetypesView?.()
                openArchetypeExternal(name)
              }}
            >
              <i class="fa-solid fa-tags" /> Voir l'archétype « {card.archetype} »
            </button>
          )}
          {owned && (
            <button
              class={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => {
                const id = card.id
                closeCard()
                _openLegacyCollectionModal?.(id)
              }}
            >
              <i class="fa-solid fa-pen-to-square" /> Modifier mes éditions
            </button>
          )}
          <a href={cmHref} target="_blank" rel="noopener noreferrer" class={styles.btn}>
            <i class="fa-solid fa-arrow-up-right-from-square" /> Cardmarket
          </a>
        </div>

        <p class={styles.desc}>{desc || 'Pas de description disponible.'}</p>
      </div>
    </div>
  )
}

function BanBadge({ cardId }: { cardId: number }): preact.JSX.Element | null {
  const status = getBanStatus(cardId)
  if (!status) return null
  const cls: Record<BanStatus, string> = {
    'Banned': 'ban-banned',
    'Limited': 'ban-limited',
    'Semi-Limited': 'ban-semi-limited',
  }
  const title: Record<BanStatus, string> = {
    'Banned': 'Interdite (TCG) — 0 exemplaire autorisé',
    'Limited': 'Limitée (TCG) — 1 exemplaire max',
    'Semi-Limited': 'Semi-limitée (TCG) — 2 exemplaires max',
  }
  return <span class={`ban-badge ban-badge-lg ${cls[status]}`} title={title[status]} aria-label={title[status]} />
}
