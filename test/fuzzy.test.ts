import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzyMatch } from '@shared/lib/fuzzy'

describe('fuzzyScore', () => {
  it('returns 0 for exact substring match', () => {
    expect(fuzzyScore('cyber', 'Cyber Dragon')).toBe(0)
    expect(fuzzyScore('dragon', 'Cyber Dragon')).toBe(0)
  })

  it('returns 0 on empty query', () => {
    expect(fuzzyScore('', 'Anything')).toBe(0)
  })

  it('is case insensitive', () => {
    expect(fuzzyScore('BLACKWING', 'Blackwing')).toBe(0)
  })

  it('strips accents (NFD)', () => {
    // After NFD, 'Élémentaire' → 'elementaire'. 'elemental' is close enough
    // (Levenshtein distance 4 against full word; the prefix window matches).
    expect(fuzzyScore('elementaire', 'Élémentaire')).toBe(0)
    expect(fuzzyScore('ELEMENTAIRE', 'élémentaire')).toBe(0)
  })

  it('strips apostrophes', () => {
    expect(fuzzyScore("dark world", "Dark World")).toBe(0)
    expect(fuzzyScore("dmotion", "D/D'motion")).toBeLessThanOrEqual(1)
  })

  it('handles compact substring (cyberdrago → Cyber Dragon)', () => {
    expect(fuzzyScore('cyberdrago', 'Cyber Dragon')).toBe(0)
  })

  it('returns 1 for multi-word prefix match', () => {
    expect(fuzzyScore('cy dra', 'Cyber Dragon')).toBe(1)
  })

  it('returns 1 for subsequence on compact form', () => {
    expect(fuzzyScore('blkwng', 'Blackwing')).toBe(1)
  })

  it('returns 2 for Levenshtein within tolerance (1 typo)', () => {
    const s = fuzzyScore('blakwing', 'Blackwing')
    expect(s).not.toBeNull()
    expect(s!).toBeLessThanOrEqual(2)
  })

  it('returns null on no match', () => {
    expect(fuzzyScore('xyzzy', 'Cyber Dragon')).toBe(null)
  })

  it('ranks substring above subsequence', () => {
    const exact = fuzzyScore('cyber', 'Cyber Dragon')!
    const fuzzy = fuzzyScore('blkwng', 'Blackwing')!
    expect(exact).toBeLessThan(fuzzy)
  })
})

describe('fuzzyMatch', () => {
  it('true when there is any match', () => {
    expect(fuzzyMatch('cyber', 'Cyber Dragon')).toBe(true)
  })
  it('false when no match', () => {
    expect(fuzzyMatch('xyzzy', 'Cyber Dragon')).toBe(false)
  })
})
