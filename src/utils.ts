import type { YGOCardSet, CollectionCard, OwnedEdition } from './types'
import { SET_CODE_RE, SET_CODE_SHORT_RE } from './constants'

/** Escape unsafe characters for HTML interpolation. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m] ?? m
  )
}

/** Strip accents and lowercase — for fuzzy comparison. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Simple edit distance — used to rank suggestions by relevance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/** Score a card name against the raw query (lower = better match). */
export function relevanceScore(cardName: string, query: string): number {
  const normName  = normalize(cardName)
  const normQuery = normalize(query)

  if (normName === normQuery) return 0
  if (normName.startsWith(normQuery)) return 1
  if (normName.includes(normQuery)) return 2

  // word-level containment
  const words = normQuery.split(' ').filter(Boolean)
  const matchedWords = words.filter((w) => normName.includes(w))
  if (matchedWords.length === words.length) return 3
  if (matchedWords.length > 0) return 4

  // edit distance on first 20 chars
  return 5 + levenshtein(normName.slice(0, 20), normQuery.slice(0, 20))
}

// ─── Cardmarket helpers ───────────────────────────────────────────────────────

/** Slug for Cardmarket URLs: "Dark Magician, the Dragon Knight" → "Dark-Magician-the-Dragon-Knight". */
export function cmSlug(s: string): string {
  return s
    .replace(/[,.'!?:;()&/]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Build a Cardmarket FR product URL. Falls back to search URL if no set name. */
export function cardmarketUrl(nameEn: string, setNameEn?: string): string {
  if (setNameEn) {
    return `https://www.cardmarket.com/fr/YuGiOh/Products/Singles/${cmSlug(setNameEn)}/${cmSlug(nameEn)}`
  }
  return `https://www.cardmarket.com/fr/YuGiOh/Products/Search?searchString=${encodeURIComponent(nameEn)}`
}

/**
 * Derive FR set codes from EN codes: "MP25-EN400" → "MP25-FR400".
 * Only works for EN-coded prints (reliable derivation).
 */
export function deriveFrSets(sets: YGOCardSet[]): YGOCardSet[] {
  return sets
    .filter((s) => /-EN\d/i.test(s.set_code))
    .map((s) => ({ ...s, set_code: s.set_code.replace(/-EN(\d)/i, '-FR$1') }))
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

/** Generate a short random id (used for new decks). */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** Human-readable byte count: 512 → "512 B", 2048 → "2.0 KB". */
export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

/** True if the card type is Fusion / Synchro / Xyz / Link (i.e. Extra Deck). */
export function isExtraDeckType(type: string | undefined): boolean {
  if (!type) return false
  const t = type.toLowerCase()
  return t.includes('fusion') || t.includes('synchro') || t.includes('xyz') || t.includes('link')
}

/** Group repeated IDs into { id, count } pairs (order preserved by first occurrence). */
export function groupDeckIds(ids: number[]): Array<{ id: number; count: number }> {
  const map = new Map<number, number>()
  for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1)
  return [...map.entries()].map(([id, count]) => ({ id, count }))
}

/**
 * Loose comparison of two set codes, ignoring zero-padding and region-code length.
 * "L26D-S35" matches "L26D-S035"; "MP25-FR7" matches "MP25-FR007".
 */
export function looseSetCodeEq(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toUpperCase().replace(/-([A-Z]{1,2})0*(\d+)/, (_m, lc: string, n: string) => `-${lc}${n}`)
  return norm(a) === norm(b)
}

/** Deduplicate cards by id, preserving order from `a`. */
export function mergeUnique<T extends { id: number }>(a: T[], b: T[]): T[] {
  const seen = new Set(a.map((c) => c.id))
  return [...a, ...b.filter((c) => !seen.has(c.id))]
}

// ─── Collection helpers ──────────────────────────────────────────────────────

/** Total owned quantity across all editions of a card. */
export function totalQty(c: CollectionCard): number {
  return (c.editions ?? []).reduce((s, e) => s + e.qty, 0)
}

/** Catalog sets — prefer French if available, else fall back to all sets. */
export function catalogSets(c: { frSets?: YGOCardSet[]; allSets?: YGOCardSet[] }): YGOCardSet[] {
  return (c.frSets?.length ? c.frSets : (c.allSets ?? []))
}

/** Default edition: take first FR, else first set; null when no info at all. */
export function defaultEditionFromSets(frSets: YGOCardSet[], allSets: YGOCardSet[]): OwnedEdition | null {
  const s = frSets[0] ?? allSets[0]
  return s ? { setCode: s.set_code, setName: s.set_name, rarity: s.set_rarity, qty: 1 } : null
}

/** Merge an edition into a card's editions array (sums qty if code already present). */
export function addEditionTo(c: CollectionCard, ed: OwnedEdition): void {
  const existing = c.editions.find((e) => looseSetCodeEq(e.setCode, ed.setCode))
  if (existing) existing.qty += ed.qty
  else c.editions.push({ ...ed })
}

/** Build EN code from any user input (full or short). "L26D-FRS33" → "L26D-ENS33". */
export function buildEnCode(q: string): string {
  const m = q.match(SET_CODE_RE)
  if (m) return `${m[1].toUpperCase()}-EN${m[3].toUpperCase()}`
  const ms = q.match(SET_CODE_SHORT_RE)!
  return `${ms[1].toUpperCase()}-EN${ms[2].toUpperCase()}`
}

// ─── Per-edition price helpers ───────────────────────────────────────────────

/**
 * Look up the Cardmarket price for a specific edition of a card.
 * Searches frSets then allSets using loose set-code matching.
 */
export function editionPrice(c: CollectionCard, setCode: string): number {
  const setsLookup = [...(c.frSets ?? []), ...(c.allSets ?? [])]
  const sp = setsLookup.find((s) => looseSetCodeEq(s.set_code, setCode))?.set_price
  return sp && Number(sp) > 0 ? Number(sp) : 0
}

/**
 * Total market value of a card: sum of (edition_price × qty) for every owned edition.
 * Falls back to cardmarketPrice × totalQty when no per-edition prices are available.
 */
export function cardTotalValue(c: CollectionCard): number {
  const perEdition = (c.editions ?? []).reduce((sum, e) => {
    const p = editionPrice(c, e.setCode)
    return sum + p * e.qty
  }, 0)
  if (perEdition > 0) return perEdition
  const fallback = Number(c.cardmarketPrice ?? 0)
  return fallback > 0 ? fallback * totalQty(c) : 0
}

/**
 * Highest unit price among all owned editions.
 * Used for "sort by unit price": bubbles up the card's most valuable edition.
 * Falls back to cardmarketPrice when no per-edition prices are available.
 */
export function cardMaxUnitPrice(c: CollectionCard): number {
  const max = (c.editions ?? []).reduce((m, e) => Math.max(m, editionPrice(c, e.setCode)), 0)
  if (max > 0) return max
  return Number(c.cardmarketPrice ?? 0)
}
