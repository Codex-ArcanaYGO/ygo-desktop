// Stable, deterministic JSON hash (FNV-1a 32-bit) used as CRDT tie-breaker.
// Not crypto — only needs determinism and reasonable distribution.

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return '{' + keys.map((k) =>
    JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])
  ).join(',') + '}'
}

export function hashValue(value: unknown, deleted: boolean): string {
  const s = (deleted ? '!' : '') + stableStringify(value)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
