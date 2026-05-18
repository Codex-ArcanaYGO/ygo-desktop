import type { DeckBuild } from './types'

interface ParsedYDK {
  main: number[]
  extra: number[]
  side: number[]
}

/**
 * Parse a .ydk file. Tolerates blank lines, `#created by …` and other comments,
 * and is forgiving about the bucket order.
 */
export function parseYDK(text: string): ParsedYDK {
  const out: ParsedYDK = { main: [], extra: [], side: [] }
  let bucket: keyof ParsedYDK | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('#main'))  { bucket = 'main';  continue }
    if (line.startsWith('#extra')) { bucket = 'extra'; continue }
    if (line.startsWith('!side'))  { bucket = 'side';  continue }
    if (line.startsWith('#') || line.startsWith('!')) { bucket = null; continue }
    if (!bucket) continue
    const id = Number(line)
    if (Number.isFinite(id) && id > 0) out[bucket].push(id)
  }
  return out
}

/** Serialize a deck build to the canonical YGOPRO .ydk format. */
export function exportYDK(d: DeckBuild): string {
  return [
    '#created by YGO Collection',
    '#main',
    ...d.main.map(String),
    '#extra',
    ...d.extra.map(String),
    '!side',
    ...d.side.map(String),
    '',
  ].join('\n')
}
