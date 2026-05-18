/**
 * Lightweight fuzzy matching for archetype names.
 *
 * Returns a score (lower = better match) or null if no match at all.
 *   0 — exact substring
 *   1 — subsequence match OR multi-word prefix match OR compact-string match
 *   2 — Levenshtein ≤ floor(queryLen/3) against any word in the target
 *
 * Handles French accents, apostrophes, and multi-word names (e.g. "cyberdrago"
 * matching "Cyber Dragon", "blakwing" matching "Blackwing").
 */

function _normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accent marks
    .replace(/[''`]/g, '')            // strip apostrophes
}

function _isSubsequence(q: string, t: string): boolean {
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

/** Standard DP Levenshtein, short-circuited at maxDist+1. */
function _levenshtein(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist + 1) return maxDist + 2
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = i
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1]
        ? row[j - 1]
        : Math.min(row[j - 1], row[j], prev) + 1
      row[j - 1] = prev
      prev = val
    }
    row[b.length] = prev
  }
  return row[b.length]
}

/**
 * Returns a relevance score (0 best, null = no match).
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = _normalize(query.trim())
  const t = _normalize(target)
  if (!q) return 0

  // 1. Exact substring (normal or compact — "cyberdrago" vs "cyber dragon")
  const tCompact = t.replace(/\s+/g, '')
  const qCompact = q.replace(/\s+/g, '')
  if (t.includes(q) || tCompact.includes(qCompact)) return 0

  const tWords = t.split(/\s+/).filter(Boolean)
  const qWords = q.split(/\s+/).filter(Boolean)

  // 2a. Every query-word matches a target-word by prefix (multi-word aware)
  if (qWords.length > 1) {
    const allMatch = qWords.every((qw) =>
      tWords.some((tw) => tw.startsWith(qw)),
    )
    if (allMatch) return 1
  }

  // 2b. Subsequence on compact strings ("blkwng" → "blackwing")
  if (q.length >= 3 && _isSubsequence(qCompact, tCompact)) return 1

  // 2c. Each query-word is a subsequence of some target-word
  if (qWords.every((qw) => tWords.some((tw) => _isSubsequence(qw, tw)))) return 1

  // 3. Levenshtein per target-word — allows 1 typo per 3 chars
  const maxDist = Math.max(1, Math.floor(q.length / 3))
  for (const tw of tWords) {
    if (_levenshtein(qCompact, tw, maxDist) <= maxDist) return 2
  }
  // Also compare the full query against a prefix-window of the compact target
  if (qCompact.length >= 4) {
    const window = tCompact.slice(0, qCompact.length + 2)
    if (_levenshtein(qCompact, window, maxDist) <= maxDist) return 2
  }

  return null
}

/** Convenience: returns true if the query matches at all. */
export function fuzzyMatch(query: string, target: string): boolean {
  return fuzzyScore(query, target) !== null
}
