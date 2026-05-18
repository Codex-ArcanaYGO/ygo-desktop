// CRDT sync engine — LWW-Element-Set per logical store.
//
// Two pieces:
//   - SyncStore<T>   : in-memory + localStorage map { key -> SyncRecord<T> }
//                      with O(1) get/put and the LWW merge rule.
//   - SyncEngine     : orchestrates push/pull against the backend.
//
// The frontend continues to read/write its existing localStorage blobs for
// UI compatibility. The sync layer mirrors those blobs as per-record CRDT
// state, so a write triggers exactly one network push per record changed.

import { hashValue } from './hash'

export interface SyncRecord<T = unknown> {
  key:        string
  value:      T | null
  deleted:    boolean
  updated_at: number
  hash:       string
}

export interface SyncStoreState<T = unknown> {
  records:    Record<string, SyncRecord<T>>
  /** Server cursor (greatest server_seq received). */
  serverSeq:  number
  /** Pending records (keys) not yet acknowledged by the server. */
  pending:    string[]
}

const PREFIX = 'ygo_sync_v1::'

function loadState<T>(name: string): SyncStoreState<T> {
  try {
    const raw = localStorage.getItem(PREFIX + name)
    if (!raw) return { records: {}, serverSeq: 0, pending: [] }
    const parsed = JSON.parse(raw) as SyncStoreState<T>
    return {
      records:   parsed.records   ?? {},
      serverSeq: parsed.serverSeq ?? 0,
      pending:   parsed.pending   ?? [],
    }
  } catch {
    return { records: {}, serverSeq: 0, pending: [] }
  }
}

function saveState<T>(name: string, state: SyncStoreState<T>): void {
  try { localStorage.setItem(PREFIX + name, JSON.stringify(state)) }
  catch { /* quota / disabled storage — accept */ }
}

/** Returns true if `incoming` should replace `existing` under LWW rules. */
export function shouldReplace(incoming: SyncRecord, existing: SyncRecord | undefined): boolean {
  if (!existing) return true
  if (incoming.updated_at > existing.updated_at) return true
  if (incoming.updated_at < existing.updated_at) return false
  return incoming.hash > existing.hash
}

export class SyncStore<T> {
  private state: SyncStoreState<T>
  constructor(public readonly name: string) {
    this.state = loadState<T>(name)
  }

  /** All non-deleted values, in insertion order of their keys. */
  values(): T[] {
    const out: T[] = []
    for (const k of Object.keys(this.state.records)) {
      const r = this.state.records[k]
      if (!r.deleted && r.value !== null) out.push(r.value)
    }
    return out
  }

  get(key: string): T | null {
    const r = this.state.records[key]
    return r && !r.deleted ? r.value : null
  }

  /** Local write: tombstones if `value === null`. No-op if hash is unchanged. */
  put(key: string, value: T | null): SyncRecord<T> | null {
    const deleted = value === null
    const hash    = hashValue(value, deleted)
    const existing = this.state.records[key]
    if (existing && existing.hash === hash && existing.deleted === deleted) {
      return null  // identical content — skip, no network needed
    }
    const rec: SyncRecord<T> = {
      key,
      value:      deleted ? null : value,
      deleted,
      updated_at: Date.now(),
      hash,
    }
    this.state.records[rec.key] = rec
    if (!this.state.pending.includes(key)) this.state.pending.push(key)
    saveState(this.name, this.state)
    return rec
  }

  /** Merge a record received from the server (LWW). Returns true if applied. */
  applyRemote(rec: SyncRecord<T>): boolean {
    const existing = this.state.records[rec.key]
    if (!shouldReplace(rec, existing)) return false
    this.state.records[rec.key] = rec
    return true
  }

  /** Records waiting to be pushed. Caller is expected to call markPushed afterwards. */
  pendingRecords(): SyncRecord<T>[] {
    return this.state.pending
      .map((k) => this.state.records[k])
      .filter((r): r is SyncRecord<T> => Boolean(r))
  }

  markPushed(keys: string[]): void {
    if (!keys.length) return
    const set = new Set(keys)
    this.state.pending = this.state.pending.filter((k) => !set.has(k))
    saveState(this.name, this.state)
  }

  setServerSeq(seq: number): void {
    if (seq > this.state.serverSeq) {
      this.state.serverSeq = seq
      saveState(this.name, this.state)
    }
  }

  serverSeq(): number {
    return this.state.serverSeq
  }

  /** Replace all records (used by import / "state" snapshot). */
  resetFrom(records: SyncRecord<T>[]): void {
    this.state.records = {}
    for (const r of records) this.state.records[r.key] = r
    this.state.pending = []
    saveState(this.name, this.state)
  }
}
