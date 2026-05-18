// Archetypes feature — pure data layer (no DOM, no JSX).
//
// Responsibilities:
//   • Maintain the canonical list of archetypes (signal `archetypeListSig`).
//   • Cache archetype → cards in memory for the session + localStorage (TTL 24h).
//   • Cache archetype → cover image URL in memory + localStorage.
//   • On every successful fetch, opportunistically backfill `archetype` on
//     matching collection cards (then notify caller via `onCollectionMutated`).
//
// Image fetching is intentionally NOT triggered here in batch — the
// <ArchetypeCard /> component triggers `ensureCards(name)` when its
// IntersectionObserver fires it into view (lazy + bandwidth-friendly).

import { signal } from '@preact/signals'
import type { CollectionCard, YGOCard } from '../../types'
import { fetchByArchetype } from '../../api'
import { appLog } from '../../logger'
import { runSafe, safeStorageRemove, safeStorageSet } from '../../lib/safe'
import { preloadImage, preloadImages } from '../../lib/image-cache'
import { fetchWithRetry } from '../../lib/retry'

const ARCHETYPES_URL          = 'https://db.ygoprodeck.com/api/v7/archetypes.php'
const ARCHETYPES_CACHE_KEY    = 'ygoArchetypesV2'
const ARCHETYPES_CACHE_TTL_MS = 24 * 3_600_000
const ARCHETYPE_IMG_CACHE_KEY = 'ygoArchetypeCoversV1'
const ARCHETYPE_CARDS_CACHE_KEY = 'ygoArchetypeCardsV2'
/** Maximum archetypes stored in localStorage to avoid quota overflow (~3-4 MB). */
const CARDS_CACHE_MAX_ENTRIES = 200

interface ArchetypeRaw { archetype_name: string }

/** Stripped version of YGOCard stored in localStorage (no desc, no card_prices,
 *  only first card_image to save space). Cast back to YGOCard on restore. */
type SlimCard = Omit<YGOCard, 'desc' | 'card_prices' | 'card_images'> & {
  card_images: Array<{ image_url_small: string; image_url: string }>
}

interface CardsCacheEntry { at: number; cards: SlimCard[] }

// ─── Load cards cache from localStorage at module init (before any render) ───

function _hydrateCardsCache(): Map<string, YGOCard[]> {
  return runSafe('archetypes.hydrateCardsCache', () => {
    const raw = localStorage.getItem(ARCHETYPE_CARDS_CACHE_KEY)
    if (!raw) return new Map<string, YGOCard[]>()
    const obj = JSON.parse(raw) as Record<string, CardsCacheEntry>
    const now = Date.now()
    const result = new Map<string, YGOCard[]>()
    for (const [k, v] of Object.entries(obj)) {
      if (now - v.at < ARCHETYPES_CACHE_TTL_MS) {
        // Cast: SlimCard is structurally compatible for all code paths we use
        result.set(k, v.cards as unknown as YGOCard[])
      }
    }
    return result
  }, new Map<string, YGOCard[]>())
}

// ─── Signals ─────────────────────────────────────────────────────────────────

export const archetypeListSig = signal<string[]>([])
/** Bumped whenever any per-archetype cache changes — components subscribe to re-render. */
export const archetypeCacheVersionSig = signal(0)
/** Number of in-flight card fetches (0 = idle). */
export const inflightCountSig = signal(0)

// ─── Internal caches ─────────────────────────────────────────────────────────

// Seeded from localStorage so images and stats are instant on page reload.
const _cardsCache  = _hydrateCardsCache()
const _imageCache  = new Map<string, string>()
/** archetypes whose fetch is currently in-flight — dedupe concurrent requests. */
const _inflight    = new Map<string, Promise<YGOCard[]>>()
/** Archetypes that completed fetching but had no cover image — queued for retry. */
const _noCoversQueue = new Set<string>()
let _retryTimer: ReturnType<typeof setTimeout> | null = null

let _wired = false
let _getCollection: (() => CollectionCard[]) | null = null
let _onCollectionMutated: (() => void) | null = null

// ─── Wiring ──────────────────────────────────────────────────────────────────

export interface ArchetypeStateDeps {
  getCollection:        () => CollectionCard[]
  onCollectionMutated:  () => void
}

export function initArchetypeState(deps: ArchetypeStateDeps): void {
  if (_wired) return
  _wired = true
  _getCollection       = deps.getCollection
  _onCollectionMutated = deps.onCollectionMutated

  // Drop the v1 key (legacy) and hydrate the v1 image cache.
  safeStorageRemove('ygoArchetypesV1', 'archetypes.dropLegacyV1')
  runSafe('archetypes.hydrateImageCache', () => {
    const raw = localStorage.getItem(ARCHETYPE_IMG_CACHE_KEY)
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string>
      for (const [k, v] of Object.entries(obj)) _imageCache.set(k, v)
    }
    return null
  }, null)

  // Backfill: extract covers from hydrated card data for archetypes whose cover
  // URL was never stored separately (e.g. they were cached before this logic existed).
  let newCovers = false
  for (const [name, cards] of _cardsCache) {
    if (_imageCache.has(name)) continue
    const cover = cards.find((c) => c.card_images?.[0]?.image_url_small)
                       ?.card_images?.[0]?.image_url_small
    if (cover) { _imageCache.set(name, cover); newCovers = true }
    else       { _noCoversQueue.add(name) }   // still missing — schedule retry when idle
  }
  if (newCovers) {
    _persistImageCache()
    archetypeCacheVersionSig.value++
  }
  // Warm CacheStorage with all known cover URLs (noop if already cached, noop offline).
  preloadImages([..._imageCache.values()])
}

// ─── Public read API (synchronous, used by components in JSX) ────────────────

export function getCachedCards(name: string): YGOCard[] | null {
  return _cardsCache.get(name) ?? null
}
export function getCoverImage(name: string): string | null {
  return _imageCache.get(name) ?? null
}

/**
 * Module-level Set of cover image URLs that have fired `onLoad` this session.
 * Used by <ArchetypeCard /> to skip the opacity-0→1 transition on remount
 * (e.g. after a sort change) when the browser already has the image in cache.
 */
export const _loadedCoverUrls = new Set<string>()

export interface ArchetypeStats {
  totalUnique:      number
  ownedUnique:      number
  totalAllEditions: number
  ownedAllEditions: number
}

export function computeStats(cards: YGOCard[] | null): ArchetypeStats | null {
  if (!cards || !_getCollection) return null
  const byId = new Map(_getCollection().map((c) => [c.id, c] as const))
  let ownedUnique = 0
  let ownedAllEditions = 0
  let totalAllEditions = 0
  for (const card of cards) {
    totalAllEditions += card.card_sets?.length ?? 0
    const owned = byId.get(card.id)
    if (owned) {
      ownedUnique++
      ownedAllEditions += owned.editions?.reduce((s, e) => s + (e.qty || 0), 0) ?? 0
    }
  }
  return { totalUnique: cards.length, ownedUnique, totalAllEditions, ownedAllEditions }
}

export function ownedFromCollectionOnly(name: string): number {
  if (!_getCollection) return 0
  return _getCollection().filter((c) => c.archetype === name).length
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

export async function loadArchetypeList(force = false): Promise<void> {
  if (archetypeListSig.value.length && !force) return
  if (!force) {
    const cached = runSafe('archetypes.loadList.cache', () => {
      const raw = localStorage.getItem(ARCHETYPES_CACHE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { at: number; data: string[] }
      if (Date.now() - parsed.at < ARCHETYPES_CACHE_TTL_MS && parsed.data?.length) {
        return parsed.data
      }
      return null
    }, null)
    if (cached) { archetypeListSig.value = cached; return }
  }
  try {
    const resp = await fetchWithRetry(ARCHETYPES_URL, undefined, { context: 'archetypes.loadList' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = (await resp.json()) as ArchetypeRaw[]
    const names = data
      .map((a) => a?.archetype_name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
      .sort((a, b) => a.localeCompare(b))
    archetypeListSig.value = names
    safeStorageSet(
      ARCHETYPES_CACHE_KEY,
      JSON.stringify({ at: Date.now(), data: names }),
      'archetypes.saveList',
    )
    appLog('info', `Archétypes chargés (${names.length})`)
  } catch (e) {
    appLog('error', 'Échec chargement archétypes', String(e))
    throw e
  }
}

/**
 * Lazy-fetch + cache cards for a single archetype. Safe to call repeatedly:
 * concurrent calls share the in-flight promise.
 */
export function ensureCards(name: string): Promise<YGOCard[]> {
  const cached = _cardsCache.get(name)
  if (cached) return Promise.resolve(cached)
  const inflight = _inflight.get(name)
  if (inflight) return inflight

  const p = fetchByArchetype(name)
    .then((cards) => {
      _setCachedCards(name, cards)
      return cards
    })
    .finally(() => {
      _inflight.delete(name)
      inflightCountSig.value = _inflight.size
      // When everything is idle and some archetypes still have no cover, retry them.
      if (_inflight.size === 0 && _noCoversQueue.size > 0) _scheduleCoversRetry()
    })
  _inflight.set(name, p)
  inflightCountSig.value = _inflight.size
  return p
}

/**
 * Debounced retry for archetypes that completed fetching but had no cover image.
 * Clears the queue first so a second failure is not retried again (avoid loops).
 * Capped at 30 archetypes per wave to avoid API spam.
 */
function _scheduleCoversRetry(): void {
  if (_retryTimer !== null) return
  _retryTimer = setTimeout(() => {
    _retryTimer = null
    const toRetry = [..._noCoversQueue].slice(0, 30)
    _noCoversQueue.clear()
    for (const name of toRetry) {
      if (_imageCache.has(name)) continue   // got it in the meantime
      _cardsCache.delete(name)              // force a fresh fetch
      ensureCards(name).catch((err) => {
        appLog('warn', `archetypes.coversRetry: échec pour « ${name} »`, String(err))
      })
    }
  }, 1_000)
}

function _setCachedCards(name: string, cards: YGOCard[]): void {
  _cardsCache.set(name, cards)
  // Cover image — first card with a thumbnail.
  if (!_imageCache.has(name)) {
    const cover = cards.find((c) => c.card_images?.[0]?.image_url_small)
                       ?.card_images?.[0]?.image_url_small
    if (cover) {
      _imageCache.set(name, cover)
      _persistImageCache()
      preloadImage(cover)
    } else {
      // No image URL in card data — queue for retry once the inflight queue drains.
      _noCoversQueue.add(name)
    }
  }
  // Proactively cache all card thumbnails so the archetype modal works offline.
  preloadImages(
    cards
      .map((c) => c.card_images?.[0]?.image_url_small ?? '')
      .filter(Boolean),
  )
  // Backfill `archetype` on collection cards & notify.
  if (_getCollection && _onCollectionMutated) {
    const ids = new Set(cards.map((c) => c.id))
    let dirty = false
    for (const c of _getCollection()) {
      if (!c.archetype && ids.has(c.id)) { c.archetype = name; dirty = true }
    }
    if (dirty) _onCollectionMutated()
  }
  _persistCardsCache()
  archetypeCacheVersionSig.value++
}

function _persistImageCache(): void {
  const obj: Record<string, string> = {}
  for (const [k, v] of _imageCache.entries()) obj[k] = v
  safeStorageSet(ARCHETYPE_IMG_CACHE_KEY, JSON.stringify(obj), 'archetypes.persistImageCache')
}

function _persistCardsCache(): void {
  const now = Date.now()
  // Keep only the most recent CARDS_CACHE_MAX_ENTRIES (Map preserves insertion order).
  const entries = [..._cardsCache.entries()]
  const toKeep = entries.slice(-CARDS_CACHE_MAX_ENTRIES)
  const obj: Record<string, CardsCacheEntry> = {}
  for (const [name, cards] of toKeep) {
    // Strip heavy fields: keep only first card_image (url + url_small), drop desc and prices.
    const slim: SlimCard[] = cards.map((c) => ({
      id:        c.id,
      name:      c.name,
      type:      c.type,
      race:      c.race,
      attribute: c.attribute,
      atk:       c.atk,
      def:       c.def,
      level:     c.level,
      archetype: c.archetype,
      card_sets:    c.card_sets,
      card_images: c.card_images?.slice(0, 1).map((img) => ({
        image_url_small: img.image_url_small,
        image_url:       img.image_url,
      })) ?? [],
    }))
    obj[name] = { at: now, cards: slim }
  }
  safeStorageSet(ARCHETYPE_CARDS_CACHE_KEY, JSON.stringify(obj), 'archetypes.persistCardsCache')
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

import type { ArchetypeSortKey } from '../../types'

export function sortArchetypesByKey(
  names: string[],
  sortKey: ArchetypeSortKey,
  langPref: 'fr' | 'en' = 'fr',
): string[] {
  const sorted = names.slice()

  switch (sortKey) {
    case 'name':
      sorted.sort((a, b) => a.localeCompare(b, langPref === 'en' ? 'en' : 'fr'))
      break
    case 'name-desc':
      sorted.sort((a, b) => b.localeCompare(a, langPref === 'en' ? 'en' : 'fr'))
      break
    case 'cards':
      sorted.sort((a, b) => {
        const cardsA = getCachedCards(a)?.length ?? 0
        const cardsB = getCachedCards(b)?.length ?? 0
        return cardsB - cardsA
      })
      break
    case 'cards-asc':
      sorted.sort((a, b) => {
        const cardsA = getCachedCards(a)?.length ?? 0
        const cardsB = getCachedCards(b)?.length ?? 0
        return cardsA - cardsB
      })
      break
    case 'progress':
      sorted.sort((a, b) => {
        const cardsA = getCachedCards(a)?.length ?? 0
        const cardsB = getCachedCards(b)?.length ?? 0
        const ownedA = ownedFromCollectionOnly(a)
        const ownedB = ownedFromCollectionOnly(b)
        // Sort by percentage owned (desc), then by total cards (desc)
        const pctA = cardsA > 0 ? (ownedA / cardsA) : 0
        const pctB = cardsB > 0 ? (ownedB / cardsB) : 0
        return pctB - pctA || cardsB - cardsA
      })
      break
    case 'progress-asc':
      sorted.sort((a, b) => {
        const cardsA = getCachedCards(a)?.length ?? 0
        const cardsB = getCachedCards(b)?.length ?? 0
        const ownedA = ownedFromCollectionOnly(a)
        const ownedB = ownedFromCollectionOnly(b)
        // Sort by percentage owned (asc), then by total cards (asc)
        const pctA = cardsA > 0 ? (ownedA / cardsA) : 0
        const pctB = cardsB > 0 ? (ownedB / cardsB) : 0
        return pctA - pctB || cardsA - cardsB
      })
      break
  }

  return sorted
}
