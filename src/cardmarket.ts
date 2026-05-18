// ─── YDK ↔ Cardmarket conversion ─────────────────────────────────────────────
//
// Resolves a list of card IDs to English-named lines compatible with
// Cardmarket's "Mass entry" want-list input.

import type { CollectionCard, YGOCard } from './types'
import { fetchById } from './api'
import { parseYDK } from './ydk'
import { mapWithConcurrency } from './lib/parallel'
import { downloadFile } from './lib/download'

export interface CardmarketConversion {
  lines: string[]
  total: number
  unique: number
  missing: number[]
}

/**
 * Build Cardmarket-style lines (`N CardName`) from a flat list of card IDs.
 * Tries the in-memory collection (English names) first, falls back to the
 * card cache, then to the EN API (parallelized, capped concurrency). Cards
 * that cannot be resolved end up in `missing` (their ids).
 */
export async function buildCardmarketLines(
  ids: number[],
  collection: CollectionCard[],
  cache: Map<number, YGOCard>,
): Promise<CardmarketConversion> {
  // Group by id while preserving first-seen order.
  const counts = new Map<number, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)

  const uniqueIds = [...counts.keys()]
  const resolved = await mapWithConcurrency(
    uniqueIds,
    (id) => resolveEnglishName(id, collection, cache),
    8,
  )

  const lines: string[] = []
  const missing: number[] = []
  uniqueIds.forEach((id, i) => {
    const nameEn = resolved[i]
    if (!nameEn) { missing.push(id); return }
    lines.push(`${counts.get(id)} ${nameEn}`)
  })

  return { lines, total: ids.length, unique: counts.size, missing }
}

async function resolveEnglishName(
  id: number,
  collection: CollectionCard[],
  cache: Map<number, YGOCard>,
): Promise<string | null> {
  const owned = collection.find((c) => c.id === id)
  if (owned?.nameEn) return owned.nameEn

  // Try EN API (authoritative for Cardmarket naming).
  const enCard = await fetchById(id)
  if (enCard?.name) {
    if (!cache.has(id)) cache.set(id, enCard)
    return enCard.name
  }

  // Fallback to whatever is cached (may be FR — better than nothing).
  return cache.get(id)?.name ?? null
}

/** Trigger a .txt download of Cardmarket lines. */
export function downloadCardmarketTxt(lines: string[], filename: string): void {
  downloadFile(lines.join('\n'), filename)
}

/** Convert raw YDK text → Cardmarket .txt content (main+extra+side combined). */
export async function convertYdkToCardmarket(
  ydkText: string,
  collection: CollectionCard[],
  cache: Map<number, YGOCard>,
): Promise<CardmarketConversion> {
  const parsed = parseYDK(ydkText)
  const allIds = [...parsed.main, ...parsed.extra, ...parsed.side]
  return buildCardmarketLines(allIds, collection, cache)
}

/** Open a file picker, read the .ydk content, return text or null on cancel. */
export function pickYdkFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ydk,text/plain'
    input.style.display = 'none'
    input.addEventListener('change', () => {
      const f = input.files?.[0]
      if (!f) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => resolve(null)
      reader.readAsText(f)
    })
    // Cancel detection (best-effort)
    window.addEventListener('focus', () => {
      setTimeout(() => { if (!input.files?.length) resolve(null) }, 300)
    }, { once: true })
    document.body.appendChild(input)
    input.click()
    setTimeout(() => input.remove(), 1000)
  })
}
