import { describe, it, expect, beforeEach } from 'vitest'
import { SyncStore, shouldReplace, type SyncRecord } from '../src/sync/store'
import { hashValue } from '../src/sync/hash'

beforeEach(() => { localStorage.clear() })

describe('SyncStore — LWW semantics', () => {
  it('skips redundant put with identical content', () => {
    const s = new SyncStore<{ qty: number }>('test-redundant')
    expect(s.put('k', { qty: 1 })).not.toBeNull()
    expect(s.put('k', { qty: 1 })).toBeNull()
    expect(s.pendingRecords()).toHaveLength(1)
  })

  it('enqueues new content', () => {
    const s = new SyncStore<{ qty: number }>('test-update')
    s.put('k', { qty: 1 })
    s.put('k', { qty: 2 })
    expect(s.get('k')).toEqual({ qty: 2 })
    expect(s.pendingRecords()).toHaveLength(1)
  })

  it('tombstones a key on null put', () => {
    const s = new SyncStore<{ qty: number }>('test-tombstone')
    s.put('k', { qty: 1 })
    s.put('k', null)
    expect(s.get('k')).toBeNull()
    expect(s.values()).toHaveLength(0)
    expect(s.pendingRecords()[0]?.deleted).toBe(true)
  })

  it('shouldReplace prefers higher updated_at', () => {
    const a: SyncRecord = { key: 'k', value: 1, deleted: false, updated_at: 10, hash: 'a' }
    const b: SyncRecord = { key: 'k', value: 2, deleted: false, updated_at: 11, hash: 'a' }
    expect(shouldReplace(b, a)).toBe(true)
    expect(shouldReplace(a, b)).toBe(false)
  })

  it('shouldReplace tie-breaks on hash when timestamps are equal', () => {
    const a: SyncRecord = { key: 'k', value: 1, deleted: false, updated_at: 10, hash: 'aaa' }
    const b: SyncRecord = { key: 'k', value: 2, deleted: false, updated_at: 10, hash: 'bbb' }
    expect(shouldReplace(b, a)).toBe(true)
    expect(shouldReplace(a, b)).toBe(false)
  })

  it('applyRemote rejects strictly older records', () => {
    const s = new SyncStore<{ v: number }>('test-merge')
    s.put('k', { v: 2 })
    const stale: SyncRecord<{ v: number }> = {
      key: 'k', value: { v: 1 }, deleted: false, updated_at: 1, hash: '0',
    }
    expect(s.applyRemote(stale)).toBe(false)
    expect(s.get('k')).toEqual({ v: 2 })
  })

  it('CRDT is commutative: merge order does not matter', () => {
    const a: SyncRecord<{ v: number }> = { key: 'k', value: { v: 1 }, deleted: false, updated_at: 10, hash: 'a' }
    const b: SyncRecord<{ v: number }> = { key: 'k', value: { v: 2 }, deleted: false, updated_at: 20, hash: 'b' }
    const s1 = new SyncStore<{ v: number }>('test-comm-1')
    s1.applyRemote(a); s1.applyRemote(b)
    const s2 = new SyncStore<{ v: number }>('test-comm-2')
    s2.applyRemote(b); s2.applyRemote(a)
    expect(s1.get('k')).toEqual(s2.get('k'))
  })

  it('hashValue is stable across key orderings', () => {
    expect(hashValue({ a: 1, b: 2 }, false)).toBe(hashValue({ b: 2, a: 1 }, false))
    expect(hashValue({ a: 1 }, false)).not.toBe(hashValue({ a: 1 }, true))
  })
})
