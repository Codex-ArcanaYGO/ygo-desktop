import { describe, it, expect } from 'vitest'
import {
  normalize, totalQty, looseSetCodeEq, mergeUnique, deriveFrSets,
  defaultEditionFromSets, addEditionTo, buildEnCode, isExtraDeckType,
  groupDeckIds, fmtBytes,
} from '@shared/utils'
import type { CollectionCard, YGOCardSet, OwnedEdition } from '@shared/types'

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('Élémentaire')).toBe('elementaire')
    expect(normalize('CYBER')).toBe('cyber')
  })
})

describe('totalQty', () => {
  it('sums all editions qty', () => {
    const c = { editions: [{ qty: 2 }, { qty: 3 }] } as CollectionCard
    expect(totalQty(c)).toBe(5)
  })
  it('handles empty editions', () => {
    expect(totalQty({ editions: [] } as unknown as CollectionCard)).toBe(0)
  })
})

describe('looseSetCodeEq', () => {
  it('matches with zero-padding differences', () => {
    expect(looseSetCodeEq('L26D-S35', 'L26D-S035')).toBe(true)
    expect(looseSetCodeEq('MP25-FR7', 'MP25-FR007')).toBe(true)
  })
  it('case insensitive', () => {
    expect(looseSetCodeEq('mp25-fr007', 'MP25-FR007')).toBe(true)
  })
  it('rejects different prefixes', () => {
    expect(looseSetCodeEq('MP25-FR007', 'MP24-FR007')).toBe(false)
  })
})

describe('mergeUnique', () => {
  it('dedups by id, preserving order from first array', () => {
    const a = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }]
    const b = [{ id: 2, n: 'B' }, { id: 3, n: 'c' }]
    expect(mergeUnique(a, b)).toEqual([
      { id: 1, n: 'a' },
      { id: 2, n: 'b' },
      { id: 3, n: 'c' },
    ])
  })
})

describe('deriveFrSets', () => {
  it('converts EN codes to FR', () => {
    const sets: YGOCardSet[] = [
      { set_code: 'MP25-EN007', set_name: 'X', set_rarity: 'C', set_rarity_code: '', set_price: '0' },
      { set_code: 'OTHER-XX1', set_name: 'Y', set_rarity: 'C', set_rarity_code: '', set_price: '0' },
    ]
    const fr = deriveFrSets(sets)
    expect(fr).toHaveLength(1)
    expect(fr[0].set_code).toBe('MP25-FR007')
  })
})

describe('defaultEditionFromSets', () => {
  it('prefers FR sets first', () => {
    const fr: YGOCardSet[] = [{ set_code: 'MP25-FR007', set_name: 'FR', set_rarity: 'C', set_rarity_code: '', set_price: '0' }]
    const all: YGOCardSet[] = [{ set_code: 'MP25-EN007', set_name: 'EN', set_rarity: 'C', set_rarity_code: '', set_price: '0' }]
    expect(defaultEditionFromSets(fr, all)?.setCode).toBe('MP25-FR007')
  })

  it('falls back to allSets', () => {
    const all: YGOCardSet[] = [{ set_code: 'MP25-EN007', set_name: 'EN', set_rarity: 'C', set_rarity_code: '', set_price: '0' }]
    expect(defaultEditionFromSets([], all)?.setCode).toBe('MP25-EN007')
  })

  it('returns null when no info', () => {
    expect(defaultEditionFromSets([], [])).toBe(null)
  })
})

describe('addEditionTo', () => {
  it('adds a new edition when set code is new', () => {
    const c = { editions: [] as OwnedEdition[] } as CollectionCard
    addEditionTo(c, { setCode: 'MP25-FR007', setName: 'X', rarity: 'C', qty: 2 })
    expect(c.editions).toHaveLength(1)
    expect(c.editions[0].qty).toBe(2)
  })

  it('sums qty when set code already exists', () => {
    const c = {
      editions: [{ setCode: 'MP25-FR007', setName: 'X', rarity: 'C', qty: 1 }],
    } as CollectionCard
    addEditionTo(c, { setCode: 'MP25-FR007', setName: 'X', rarity: 'C', qty: 3 })
    expect(c.editions).toHaveLength(1)
    expect(c.editions[0].qty).toBe(4)
  })

  it('uses loose comparison (zero padding)', () => {
    const c = {
      editions: [{ setCode: 'MP25-FR7', setName: 'X', rarity: 'C', qty: 1 }],
    } as CollectionCard
    addEditionTo(c, { setCode: 'MP25-FR007', setName: 'X', rarity: 'C', qty: 2 })
    expect(c.editions).toHaveLength(1)
    expect(c.editions[0].qty).toBe(3)
  })
})

describe('buildEnCode', () => {
  it('converts full FR code to EN', () => {
    expect(buildEnCode('MP25-FR007')).toBe('MP25-EN007')
  })
})

describe('isExtraDeckType', () => {
  it('identifies extra deck types', () => {
    expect(isExtraDeckType('Fusion Monster')).toBe(true)
    expect(isExtraDeckType('Synchro Monster')).toBe(true)
    expect(isExtraDeckType('XYZ Monster')).toBe(true)
    expect(isExtraDeckType('Link Monster')).toBe(true)
  })
  it('rejects normal types', () => {
    expect(isExtraDeckType('Normal Monster')).toBe(false)
    expect(isExtraDeckType('Spell Card')).toBe(false)
    expect(isExtraDeckType(undefined)).toBe(false)
  })
})

describe('groupDeckIds', () => {
  it('counts repeats preserving first-occurrence order', () => {
    expect(groupDeckIds([3, 1, 3, 2, 1, 3])).toEqual([
      { id: 3, count: 3 },
      { id: 1, count: 2 },
      { id: 2, count: 1 },
    ])
  })
})

describe('fmtBytes', () => {
  it('formats bytes/KB/MB', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(2048)).toBe('2.0 KB')
    expect(fmtBytes(2 * 1024 * 1024)).toBe('2.00 MB')
  })
})
