// Sync engine: drives push/pull cycles against the backend.
// Online-first but offline-tolerant: pending writes accumulate in SyncStore
// and flush on the next successful push.

import { SyncStore, type SyncRecord } from './store'
import type { CollectionCard, WishlistCard, DeckBuild } from '../types'
import { appLog } from '../logger'
import { mirrorToLocalStorage } from './mirror'

export type StoreName = 'collection' | 'wishlist' | 'decks'

const API_BASE = (() => {
  // Same-origin in prod; configurable for dev via VITE_API_BASE.
  const env = (import.meta as { env?: Record<string, string> }).env
  return env?.VITE_API_BASE ?? '/api'
})()

interface PullResponse<T> {
  records:     SyncRecord<T>[]
  server_seq:  number
  server_time: number
}

interface PushResponse {
  applied:     number
  server_seq:  number
  server_time: number
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`)
  return res.json() as Promise<T>
}

export class SyncEngine {
  readonly collection = new SyncStore<CollectionCard>('collection')
  readonly wishlist   = new SyncStore<WishlistCard>('wishlist')
  readonly decks      = new SyncStore<DeckBuild>('decks')

  private timer: ReturnType<typeof setInterval> | null = null
  private pushing = false
  private listeners: Array<() => void> = []
  private authenticated = false

  /** Subscribe to "data changed locally" events (after remote merge). */
  onChange(cb: () => void): () => void {
    this.listeners.push(cb)
    return () => { this.listeners = this.listeners.filter((c) => c !== cb) }
  }

  private notify() {
    mirrorToLocalStorage()
    for (const c of this.listeners) c()
  }

  setAuthenticated(ok: boolean): void {
    this.authenticated = ok
    if (ok) void this.fullPullThenPush()
  }

  /** Bootstrap on app start (after auth status known). */
  start(intervalMs = 30_000): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => { void this.cycle() }, intervalMs)
    void this.cycle()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  store(name: StoreName): SyncStore<unknown> {
    return name === 'collection' ? this.collection as SyncStore<unknown>
         : name === 'wishlist'   ? this.wishlist   as SyncStore<unknown>
         : this.decks as SyncStore<unknown>
  }

  /** One full pull + push cycle. Safe to call any time. */
  async cycle(): Promise<void> {
    if (!this.authenticated) return
    try {
      await this.pull('collection', this.collection)
      await this.pull('wishlist',   this.wishlist)
      await this.pull('decks',      this.decks)
      await this.pushAll()
    } catch (err) {
      appLog('warn', 'sync.cycle failed', String(err))
    }
  }

  private async fullPullThenPush(): Promise<void> {
    try {
      // If we have no local state yet, fetch the full snapshot.
      if (this.collection.serverSeq() === 0) await this.snapshot('collection', this.collection)
      if (this.wishlist.serverSeq()   === 0) await this.snapshot('wishlist',   this.wishlist)
      if (this.decks.serverSeq()      === 0) await this.snapshot('decks',      this.decks)
      await this.cycle()
    } catch (err) {
      appLog('warn', 'sync.fullPullThenPush failed', String(err))
    }
  }

  private async snapshot<T>(name: StoreName, store: SyncStore<T>): Promise<void> {
    const res = await http<PullResponse<T>>(`/sync/${name}/state`)
    store.resetFrom(res.records)
    store.setServerSeq(res.server_seq)
    this.notify()
  }

  private async pull<T>(name: StoreName, store: SyncStore<T>): Promise<void> {
    const res = await http<PullResponse<T>>(`/sync/${name}/pull`, {
      method: 'POST',
      body:   JSON.stringify({ since: store.serverSeq() }),
    })
    let changed = false
    for (const rec of res.records) {
      if (store.applyRemote(rec)) changed = true
    }
    store.setServerSeq(res.server_seq)
    if (changed) this.notify()
  }

  private async pushAll(): Promise<void> {
    if (this.pushing) return
    this.pushing = true
    try {
      await this.pushOne('collection', this.collection)
      await this.pushOne('wishlist',   this.wishlist)
      await this.pushOne('decks',      this.decks)
    } finally {
      this.pushing = false
    }
  }

  private async pushOne<T>(name: StoreName, store: SyncStore<T>): Promise<void> {
    const pending = store.pendingRecords()
    if (!pending.length) return
    // Backend caps batches at 5000.
    for (let i = 0; i < pending.length; i += 1000) {
      const batch = pending.slice(i, i + 1000)
      const res = await http<PushResponse>(`/sync/${name}/push`, {
        method: 'POST',
        body:   JSON.stringify({ records: batch }),
      })
      store.markPushed(batch.map((r) => r.key))
      store.setServerSeq(res.server_seq)
    }
  }
}

/** Lazy singleton — created on first use, started by main.tsx after auth. */
let _engine: SyncEngine | null = null
export function getSync(): SyncEngine {
  if (!_engine) _engine = new SyncEngine()
  return _engine
}
