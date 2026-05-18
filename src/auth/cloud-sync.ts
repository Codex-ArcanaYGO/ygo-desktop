// Cloud sync layer: when a user is logged in, mirror local data to the
// backend. Guest mode (no user) keeps the existing localStorage-only flow.
//
// Strategy:
//   1. On login → pull server state. Merge with local using a "larger wins"
//      heuristic so we never silently wipe newer client adds with stale
//      server state (or vice-versa). Pull MUST complete before any push.
//   2. After login & after pull → debounce-watch signals and PUT changes.
//   3. On logout → stop syncing (localStorage stays as-is).
//
// Defensive invariants (regression guards — see git blame for context):
//   • The push effect never runs until `pulled` is true. This prevents the
//     race where an empty/stale local signal gets pushed in the 1.2 s window
//     before `pullOnLogin()` returns, wiping the server permanently.
//   • A push is skipped if the in-memory snapshot is empty AND the user
//     previously had data on the server (tracked via `lastKnownNonEmpty`).
//     This is a belt-and-suspenders against accidental wipes from page-load
//     ordering bugs or sign-out flicker.
//
// This module is additive: legacy persistence.ts is untouched.

import { effect } from '@preact/signals'

import { dataApi, ApiError } from '../api/client'
import { currentUserSig } from './state'
import { collectionSig, wishlistSig } from '../app/state'
import { appLog } from '../logger'

const DEBOUNCE_MS = 1200
let stop: (() => void) | null = null

/** Hooks invoked when the cloud merge produces a different value than what
 *  the local signals held. Used by legacy main.tsx code to rehydrate its
 *  shadow `collection`/`wishlist` arrays and re-render. */
export interface CloudSyncHooks {
  onRemoteCollection?: (data: unknown[]) => void
  onRemoteWishlist?:   (data: unknown[]) => void
}
let hooks: CloudSyncHooks = {}

interface Timer { id: ReturnType<typeof setTimeout> | null }

interface SyncGuard {
  pulled: boolean              // has pullOnLogin completed?
  lastKnownNonEmpty: boolean   // did server (or local) ever hold a non-empty value?
}

function debouncePush<T>(
  timer: Timer,
  guard: SyncGuard,
  getter: () => T,
  push: (data: T) => Promise<unknown>,
  label: string,
): void {
  if (timer.id) clearTimeout(timer.id)
  timer.id = setTimeout(() => {
    if (!guard.pulled) {
      appLog('warn', `sync.${label} skipped: pull not complete`)
      return
    }
    const data = getter()
    // Refuse to push an empty array if we ever knew non-empty data — this is
    // almost certainly a bug (cleared cache, sign-out flicker, etc.).
    if (Array.isArray(data) && data.length === 0 && guard.lastKnownNonEmpty) {
      appLog('warn', `sync.${label} skipped: refusing to push empty over non-empty`)
      return
    }
    if (Array.isArray(data) && data.length > 0) guard.lastKnownNonEmpty = true
    void push(data).catch((err) => appLog('warn', `sync.${label} failed`, String(err)))
  }, DEBOUNCE_MS)
}

/**
 * Merge server + local arrays by id. Quantities are taken from the side with
 * more total copies for that card. This is conservative: it never deletes a
 * card the user has locally just because the server lost it (or vice-versa).
 */
function mergeById<T extends { id: number; editions?: Array<{ qty?: number }> }>(
  local: T[],
  server: T[],
): T[] {
  const byId = new Map<number, T>()
  for (const c of server) byId.set(c.id, c)
  for (const c of local) {
    const s = byId.get(c.id)
    if (!s) { byId.set(c.id, c); continue }
    const lt = (c.editions ?? []).reduce((n, e) => n + (e.qty ?? 0), 0)
    const st = (s.editions ?? []).reduce((n, e) => n + (e.qty ?? 0), 0)
    byId.set(c.id, lt >= st ? c : s)
  }
  return Array.from(byId.values())
}

/** Pull server state once on login and merge with local. */
async function pullOnLogin(guard: SyncGuard): Promise<void> {
  try {
    const [coll, wish] = await Promise.all([
      dataApi.getCollection().catch(emptyOn401),
      dataApi.getWishlist().catch(emptyOn401),
    ])

    const localColl = collectionSig.value
    const localWish = wishlistSig.value
    const serverColl = Array.isArray(coll) ? coll as typeof localColl : []
    const serverWish = Array.isArray(wish) ? wish as typeof localWish : []

    if (serverColl.length > 0 || localColl.length > 0) guard.lastKnownNonEmpty = true

    const mergedColl = mergeById(localColl, serverColl)
    const mergedWish = mergeById(localWish, serverWish)

    // Only update signals if the merge actually differs from current — avoids
    // a spurious effect re-trigger that schedules a redundant push.
    if (mergedColl.length !== localColl.length || serverColl.length !== mergedColl.length) {
      collectionSig.value = mergedColl
      hooks.onRemoteCollection?.(mergedColl as unknown[])
    }
    if (mergedWish.length !== localWish.length || serverWish.length !== mergedWish.length) {
      wishlistSig.value = mergedWish
      hooks.onRemoteWishlist?.(mergedWish as unknown[])
    }

    // If the merge produced a different array than the server held, push it.
    if (mergedColl.length !== serverColl.length) {
      await dataApi.putCollection(mergedColl as unknown[])
    }
    if (mergedWish.length !== serverWish.length) {
      await dataApi.putWishlist(mergedWish as unknown[])
    }
  } catch (err) {
    appLog('warn', 'sync.pullOnLogin failed', String(err))
  } finally {
    guard.pulled = true
  }
}

function emptyOn401(err: unknown): unknown[] {
  if (err instanceof ApiError && err.status === 401) return []
  throw err
}

/** Wire up sync effects once a user is present. Returns a stop fn. */
function startSyncing(): () => void {
  const collTimer: Timer = { id: null }
  const wishTimer: Timer = { id: null }
  const guard: SyncGuard = {
    pulled: false,
    lastKnownNonEmpty:
      collectionSig.value.length > 0 || wishlistSig.value.length > 0,
  }

  // Kick off the initial pull. The push effects below are gated on
  // `guard.pulled` so no push can race ahead of the pull result.
  void pullOnLogin(guard)

  const stopColl = effect(() => {
    const v = collectionSig.value
    if (!currentUserSig.value) return
    debouncePush(collTimer, guard, () => v, (d) => dataApi.putCollection(d as unknown[]), 'collection')
  })
  const stopWish = effect(() => {
    const v = wishlistSig.value
    if (!currentUserSig.value) return
    debouncePush(wishTimer, guard, () => v, (d) => dataApi.putWishlist(d as unknown[]), 'wishlist')
  })

  return () => {
    stopColl(); stopWish()
    if (collTimer.id) clearTimeout(collTimer.id)
    if (wishTimer.id) clearTimeout(wishTimer.id)
  }
}

/**
 * Install a top-level subscription: starts/stops sync as the user logs
 * in or out. Call once at app startup. Optional hooks let legacy code
 * react to remote updates (rehydrate its private state + re-render).
 */
export function installCloudSync(h: CloudSyncHooks = {}): void {
  hooks = h
  effect(() => {
    const user = currentUserSig.value
    if (user) {
      stop?.()
      stop = startSyncing()
    } else if (stop) {
      stop()
      stop = null
    }
  })
}
