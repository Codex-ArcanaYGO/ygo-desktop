// Single archetype card in the grid. Lazy-loads its data when scrolled into view.

import { useEffect, useRef, useState } from 'preact/hooks'
import {
  archetypeCacheVersionSig,
  computeStats,
  ensureCards,
  getCachedCards,
  getCoverImage,
  ownedFromCollectionOnly,
  _loadedCoverUrls,
} from './state'
import { pinnedArchetypesSig, togglePinnedArchetype } from '../../app/state'
import { getCachedObjectUrl, useOfflineImage } from '../../lib/image-cache'
import styles from './ArchetypeCard.module.css'

interface Props {
  name:    string
  onOpen:  (name: string) => void
}

export function ArchetypeCard({ name, onOpen }: Props): preact.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)

  // Subscribe to cache mutations so stats appear once data flows in.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  archetypeCacheVersionSig.value

  const [, force] = useState(0)

  // IntersectionObserver — fetch only when NOT already cached from localStorage.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (getCachedCards(name)) return   // already hydrated from localStorage
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          io.disconnect()
          ensureCards(name).then(() => force((n) => n + 1)).catch(() => { /* ignore */ })
          break
        }
      }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [name])

  const cards      = getCachedCards(name)
  const stats      = computeStats(cards)
  const coverUrl   = getCoverImage(name)
  const resolvedSrc = useOfflineImage(coverUrl)
  const initial    = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase() || '#'
  const isPinned   = pinnedArchetypesSig.value.has(name)

  // Image is "already loaded" if it was seen this session OR is in the offline
  // cache (blob URL available immediately — no HTTP round-trip needed).
  const alreadyLoaded = !!coverUrl &&
    (_loadedCoverUrls.has(coverUrl) || getCachedObjectUrl(coverUrl) !== null)
  const [imgLoaded, setImgLoaded] = useState(alreadyLoaded)

  const completion = stats && stats.totalUnique
    ? Math.round((stats.ownedUnique / stats.totalUnique) * 100)
    : null

  return (
    <div
      ref={ref}
      class={`${styles.card} ${isPinned ? styles.pinned : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(name)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(name) } }}
    >
      <button
        class={`${styles.pinBtn} ${isPinned ? styles.pinBtnActive : ''}`}
        type="button"
        title={isPinned ? `Désépingler « ${name} »` : `Épingler « ${name} »`}
        aria-label={isPinned ? 'Désépingler' : 'Épingler'}
        onClick={(e) => { e.stopPropagation(); togglePinnedArchetype(name) }}
      >
        <i class="fa-solid fa-thumbtack" />
      </button>
      <span class={styles.cover}>
        {resolvedSrc
          ? (
            <img
              src={resolvedSrc}
              alt=""
              loading="lazy"
              class={imgLoaded ? styles.loaded : ''}
              onLoad={(e) => {
                if (coverUrl) _loadedCoverUrls.add(coverUrl)
                setImgLoaded(true)
                ;(e.currentTarget as HTMLImageElement).classList.add(styles.loaded)
              }}
            />
          )
          : <span class={styles.avatar} aria-hidden="true">{initial}</span>}
        {completion != null && (
          <span
            class={`${styles.ring} ${completion >= 100 ? styles.ringFull : ''}`}
            // eslint-disable-next-line react/forbid-dom-props
            style={`--p:${completion}%`}
            title={`${completion}% complet`}
          >
            {completion}%
          </span>
        )}
      </span>
      <span class={styles.body}>
        <span class={styles.title}>{name}</span>
        <span class={styles.stats}>
          {stats
            ? (
              <>
                <span class={styles.stat} title="Cartes uniques possédées / total">
                  <i class="fa-solid fa-clone" /> {stats.ownedUnique}/{stats.totalUnique}
                </span>
                <span class={styles.stat} title="Éditions possédées / impressions totales">
                  <i class="fa-solid fa-layer-group" /> {stats.ownedAllEditions}/{stats.totalAllEditions}
                </span>
              </>
            )
            : (
              <>
                <span class={`${styles.stat} ${styles.statMuted}`} title="Cartes possédées (depuis votre collection)">
                  <i class="fa-solid fa-clone" /> {ownedFromCollectionOnly(name)}
                </span>
                <span class={`${styles.stat} ${styles.statMuted}`} title="Statistiques en cours de chargement…">
                  <i class="fa-solid fa-circle-notch fa-spin" />
                </span>
              </>
            )}
        </span>
      </span>
    </div>
  )
}
