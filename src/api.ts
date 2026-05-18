// ─── YGOPRODeck API layer ─────────────────────────────────────────────────────
//
// Pure-ish fetch helpers. The only side effect outside HTTP is calling
// `appLog` so users can debug set-code lookups from the Settings panel.

import type { YGOCard } from './types'
import { API_BASE, SET_CODE_RE, SET_CODE_SHORT_RE } from './constants'
import { appLog } from './logger'
import { normalize, mergeUnique, relevanceScore } from './utils'
import { startSpan, endSpan, recordCounter } from './telemetry'
import { fetchWithRetry } from './lib/retry'

// ─── Set lookup cache (cardsets.php is a global, language-independent index) ─

let cardSetsCache: Array<{ set_name: string; set_code: string }> | null = null

export async function getCardSets(): Promise<Array<{ set_name: string; set_code: string }>> {
  if (cardSetsCache) { recordCounter('ygo.api.card_sets.cache_hit'); return cardSetsCache }
  const span = startSpan('ygo.api.card_sets')
  recordCounter('ygo.api.card_sets.fetch')
  try {
    const res = await fetchWithRetry('https://db.ygoprodeck.com/api/v7/cardsets.php', undefined, { context: 'api.getCardSets' })
    if (!res.ok) { endSpan(span, { error: `HTTP ${res.status}` }); return [] }
    cardSetsCache = (await res.json()) as Array<{ set_name: string; set_code: string }>
    endSpan(span, { attributes: { 'ygo.set_count': cardSetsCache.length } })
    return cardSetsCache
  } catch (err) {
    endSpan(span, { error: String(err) })
    return []
  }
}

/**
 * Find the card with an exact EN set code (e.g. "MP25-EN207").
 * Looks up the set name from the global set list, fetches all cards in that set,
 * then filters for the exact code match (number comparison is padding-insensitive).
 */
export async function fetchBySetCode(enCode: string, origCode?: string): Promise<YGOCard[]> {
  const prefix  = enCode.split('-')[0].toUpperCase()
  const numPart = enCode.replace(/.*[A-Z](\d+)$/i, '$1').replace(/^0+/, '')
  appLog('info', `fetchBySetCode: enCode=${enCode} origCode=${origCode ?? '—'} prefix=${prefix} num=${numPart}`)

  const filterCards = (cards: YGOCard[]): YGOCard[] =>
    cards.filter((c) =>
      c.card_sets?.some((s) => {
        const upper = s.set_code.toUpperCase()
        if (upper === enCode.toUpperCase()) return true
        if (origCode && upper === origCode.toUpperCase()) return true
        // Also match zero-padded origCode variant (e.g. "L26D-S35" ≡ "L26D-S035")
        if (origCode) {
          const origNorm = origCode.toUpperCase().replace(/-([A-Z]{1,2})0*(\d+)$/, (_, lc, n) => `-${lc}${n}`)
          const upperNorm = upper.replace(/-([A-Z]{1,2})0*(\d+)$/, (_, lc, n) => `-${lc}${n}`)
          if (upperNorm === origNorm) return true
        }
        // Match codes with 1-2 letter region codes and any zero-padding
        const m = upper.match(/^([A-Z0-9]+)-[A-Z]{1,2}0*(\d+)$/)
        return m != null && m[1] === prefix && m[2] === numPart
      }),
    )

  const findSets = (sets: Array<{ set_name: string; set_code: string }>) =>
    sets.filter(
      (s) =>
        s.set_code.toUpperCase() === prefix ||
        s.set_code.toUpperCase().startsWith(prefix + '-'),
    )

  // Collect all matching sets (EN first, then FR). Multiple sets may share a code
  // e.g. "2020 Tin of Lost Memories" (6 cards) AND "2020 Tin of Lost Memories Mega Pack" (246 cards)
  // both have set_code "MP20" — we must try all of them.
  let matchingSets = findSets(await getCardSets())
  appLog('info', `fetchBySetCode: ${matchingSets.length} set(s) EN trouvé(s) pour préfixe « ${prefix} »`)

  if (!matchingSets.length) {
    try {
      const frRes = await fetchWithRetry('https://db.ygoprodeck.com/api/v7/cardsets.php?language=fr', undefined, { context: 'api.fetchBySetCode.fr-cardsets' })
      if (frRes.ok) {
        const frSets = (await frRes.json()) as Array<{ set_name: string; set_code: string }>
        matchingSets = findSets(frSets)
        appLog('info', `fetchBySetCode: ${matchingSets.length} set(s) FR trouvé(s) pour préfixe « ${prefix} »`)
      }
    } catch (err) { appLog('warn', 'fetchBySetCode: FR cardsets fallback échoué', String(err)) }
  }

  // Fallback for new sets not yet in the cardsets index: try the prefix directly
  if (!matchingSets.length) {
    appLog('warn', `fetchBySetCode: préfixe « ${prefix} » absent de l'index, tentative directe par cardset=`)
    for (const lang of [undefined, 'fr'] as const) {
      const params = new URLSearchParams({ cardset: prefix })
      if (lang) params.set('language', lang)
      try {
        const res = await fetchWithRetry(`${API_BASE}?${params}`, undefined, { context: `api.fetchBySetCode.direct.${lang ?? 'en'}` })
        if (res.ok) {
          const data = (await res.json()) as { data?: YGOCard[] }
          const filtered = filterCards(data.data ?? [])
          appLog('info', `fetchBySetCode: fallback direct lang=${lang ?? 'en'} → ${data.data?.length ?? 0} cartes, ${filtered.length} matchent`)
          if (filtered.length) return filtered
        }
      } catch (err) { appLog('warn', `fetchBySetCode: fallback direct lang=${lang ?? 'en'} échoué`, String(err)) }
    }
    appLog('error', `fetchBySetCode: aucun résultat pour ${enCode} (origCode=${origCode ?? '—'})`)
    return []
  }

  // Try each matching set until we find the card
  for (const setInfo of matchingSets) {
    const res = await fetchWithRetry(`${API_BASE}?cardset=${encodeURIComponent(setInfo.set_name)}`, undefined, { context: 'api.fetchBySetCode.byName' })
    if (res.ok) {
      const data = (await res.json()) as { data?: YGOCard[] }
      const filtered = filterCards(data.data ?? [])
      appLog('info', `fetchBySetCode: set « ${setInfo.set_name} » → ${data.data?.length ?? 0} cartes, ${filtered.length} matchent`)
      if (filtered.length) return filtered
    }
  }

  // Fallback: try with language=fr for all matching sets
  for (const setInfo of matchingSets) {
    try {
      const resFr = await fetchWithRetry(`${API_BASE}?cardset=${encodeURIComponent(setInfo.set_name)}&language=fr`, undefined, { context: 'api.fetchBySetCode.byName.fr' })
      if (!resFr.ok) continue
      const dataFr = (await resFr.json()) as { data?: YGOCard[] }
      const filtered = filterCards(dataFr.data ?? [])
      appLog('info', `fetchBySetCode: set FR « ${setInfo.set_name} » → ${dataFr.data?.length ?? 0} cartes, ${filtered.length} matchent`)
      if (filtered.length) return filtered
    } catch (err) { appLog('warn', `fetchBySetCode: set FR « ${setInfo.set_name} » échoué`, String(err)) }
  }

  return []
}

// ─── Basic card lookups ───────────────────────────────────────────────────────

export async function fetchCards(fname: string, lang: 'fr' | null = 'fr'): Promise<YGOCard[]> {
  const params = new URLSearchParams({ fname, num: '30', offset: '0' })
  if (lang) params.set('language', lang)
  const res = await fetchWithRetry(`${API_BASE}?${params}`, undefined, { context: 'api.fetchCards' })
  if (!res.ok) {
    if (res.status === 400) return []
    throw new Error(`API ${res.status}`)
  }
  const data = (await res.json()) as { data?: YGOCard[] }
  return data.data ?? []
}

/** Fetch full card details by Konami ID (always EN — has card_sets + card_prices). */
export async function fetchById(id: number): Promise<YGOCard | null> {
  const span = startSpan('ygo.api.fetch_by_id', { 'ygo.card_id': id })
  recordCounter('ygo.api.request')
  try {
    const res = await fetchWithRetry(`${API_BASE}?id=${id}`, undefined, { context: 'api.fetchById' })
    if (!res.ok) { endSpan(span, { error: `HTTP ${res.status}` }); return null }
    const data = (await res.json()) as { data?: YGOCard[] }
    endSpan(span)
    return data.data?.[0] ?? null
  } catch (err) {
    endSpan(span, { error: String(err) })
    return null
  }
}

/** Fetch French card details by Konami ID (name + desc in French if available). */
export async function fetchFrById(id: number): Promise<YGOCard | null> {
  const span = startSpan('ygo.api.fetch_fr_by_id', { 'ygo.card_id': id })
  recordCounter('ygo.api.request')
  try {
    const res = await fetchWithRetry(`${API_BASE}?id=${id}&language=fr`, undefined, { context: 'api.fetchFrById' })
    if (!res.ok) { endSpan(span, { error: `HTTP ${res.status}` }); return null }
    const data = (await res.json()) as { data?: YGOCard[] }
    endSpan(span)
    return data.data?.[0] ?? null
  } catch (err) {
    endSpan(span, { error: String(err) })
    return null
  }
}

// ─── Archetype + exact-name caches (used by deck suggestions) ────────────────

const archetypeCache: Map<string, YGOCard[]> = new Map()
const exactNameCache: Map<string, YGOCard>   = new Map()

/** Fetch every card belonging to an archetype (cached for the session). */
export async function fetchByArchetype(archetype: string): Promise<YGOCard[]> {
  const cached = archetypeCache.get(archetype)
  if (cached) return cached
  try {
    const url = `${API_BASE}?archetype=${encodeURIComponent(archetype)}`
    const res = await fetchWithRetry(url, undefined, { context: 'api.fetchByArchetype' })
    if (!res.ok) {
      archetypeCache.set(archetype, [])
      return []
    }
    const data = (await res.json()) as { data?: YGOCard[] }
    const list = data.data ?? []
    archetypeCache.set(archetype, list)
    return list
  } catch (err) {
    appLog('warn', `Archetype « ${archetype} » introuvable`, String(err))
    archetypeCache.set(archetype, [])
    return []
  }
}

/** Resolve a single card by *exact* YGOPRODeck name (English). */
export async function fetchByExactName(name: string): Promise<YGOCard | null> {
  const key = name.toLowerCase()
  const cached = exactNameCache.get(key)
  if (cached) return cached
  try {
    const url = `${API_BASE}?name=${encodeURIComponent(name)}`
    const res = await fetchWithRetry(url, undefined, { context: 'api.fetchByExactName' })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: YGOCard[] }
    const card = data.data?.[0]
    if (card) exactNameCache.set(key, card)
    return card ?? null
  } catch (err) {
    appLog('warn', `fetchByExactName échoué pour « ${name} »`, String(err))
    return null
  }
}

/**
 * Multi-strategy search:
 * 1. French name, raw query
 * 2. French name, accent-stripped (handles typos)
 * 3. No language filter (covers cards without FR translation)
 * Results merged, deduplicated, ranked by relevance.
 * EN results used to enrich card_sets + card_prices.
 */
export async function searchCards(query: string): Promise<YGOCard[]> {
  const span = startSpan('ygo.api.search', { 'ygo.query': query.trim().slice(0, 50) })
  recordCounter('ygo.api.search')
  try {
    const result = await _searchCards(query)
    endSpan(span, { attributes: { 'ygo.result_count': result.length } })
    return result
  } catch (err) {
    endSpan(span, { error: String(err) })
    throw err
  }
}

async function _searchCards(query: string): Promise<YGOCard[]> {
  const q = query.trim()

  // ── 1. Konami ID (all digits) ───────────────────────────────────────────
  if (/^\d+$/.test(q)) {
    const idNum = parseInt(q, 10)
    const [frData, enCard] = await Promise.all([
      fetchWithRetry(`${API_BASE}?id=${idNum}&language=fr`, undefined, { context: 'api.searchCards.byId.fr' })
        .then(async (r) => r.ok ? ((await r.json()) as { data?: YGOCard[] }).data?.[0] ?? null : null)
        .catch(() => null),
      fetchById(idNum),
    ])
    if (!enCard && !frData) return []
    const card = frData ?? enCard!
    if (enCard) {
      if (!card.card_sets?.length)   card.card_sets   = enCard.card_sets
      if (!card.card_prices?.length) card.card_prices = enCard.card_prices
    }
    return [card]
  }

  // ── 2. Set code (e.g. MP25-FR207, INFO-EN082, or short MP25-207) ─────────
  const setMatch      = q.match(SET_CODE_RE)
  const setMatchShort = q.match(SET_CODE_SHORT_RE)
  if (setMatch || setMatchShort) {
    let enCode: string
    if (setMatch) {
      const prefix = setMatch[1].toUpperCase()
      const num    = setMatch[3].padStart(3, '0')
      enCode = `${prefix}-EN${num}`
    } else {
      const prefix = setMatchShort![1].toUpperCase()
      const num    = setMatchShort![2].padStart(3, '0')
      enCode = `${prefix}-EN${num}`
    }
    const enResults = await fetchBySetCode(enCode, q)
    if (enResults.length) {
      // Try to get FR name/desc for each result
      const enriched = await Promise.all(
        enResults.map(async (enCard) => {
          const frCard = await fetchWithRetry(`${API_BASE}?id=${enCard.id}&language=fr`, undefined, { context: 'api.searchCards.bySetCode.fr' })
            .then(async (r) => r.ok ? ((await r.json()) as { data?: YGOCard[] }).data?.[0] ?? null : null)
            .catch(() => null)
          if (frCard) {
            if (!frCard.card_sets?.length)   frCard.card_sets   = enCard.card_sets
            if (!frCard.card_prices?.length) frCard.card_prices = enCard.card_prices
            return frCard
          }
          return enCard
        })
      )
      return enriched
    }
    // Fall through to name search if set code yields nothing
  }

  // ── 3. Name-based multi-strategy (FR raw + FR normalised + EN fallback) ──
  const normQuery = normalize(q)
  const [frRaw, frNorm, enRaw] = await Promise.all([
    fetchCards(q, 'fr'),
    normQuery !== q ? fetchCards(normQuery, 'fr') : Promise.resolve<YGOCard[]>([]),
    fetchCards(q, null),
  ])

  let merged = mergeUnique(mergeUnique(frRaw, frNorm), enRaw)

  // ── 4. Word-by-word fallback (handles new cards w/ partial FR translation) ─
  if (!merged.length) {
    const words = q.split(/\s+/).filter((w) => w.length >= 3)
    // Try the longest word first — more selective
    words.sort((a, b) => b.length - a.length)
    for (const w of words) {
      const [frW, frWN, enW] = await Promise.all([
        fetchCards(w, 'fr'),
        fetchCards(normalize(w), 'fr'),
        fetchCards(w, null),
      ])
      merged = mergeUnique(mergeUnique(frW, frWN), enW)
      if (merged.length) break
    }
  }

  const enById = new Map(enRaw.map((c) => [c.id, c]))
  for (const card of merged) {
    const enCard = enById.get(card.id)
    if (enCard) {
      if (!card.card_sets?.length)   card.card_sets   = enCard.card_sets
      if (!card.card_prices?.length) card.card_prices = enCard.card_prices
    }
  }

  merged.sort((a, b) => relevanceScore(a.name, q) - relevanceScore(b.name, q))
  return merged
}
