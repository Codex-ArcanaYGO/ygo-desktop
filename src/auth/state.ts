// Authentication state (Preact signals) + helpers to load/refresh/logout.
//
// Modes:
//   • guest   → no current user; data stays in localStorage only
//   • logged  → currentUser is set; persistence layer should mirror to API
//
// Components subscribe to `currentUserSig`; `isLoggedInSig` is a convenience.

import { computed, signal } from '@preact/signals'

import { authApi, ApiError, type CurrentUser } from '../api/client'
import { appLog } from '../logger'

export const currentUserSig = signal<CurrentUser | null>(null)
export const authReadySig   = signal<boolean>(false)
export const isLoggedInSig  = computed<boolean>(() => currentUserSig.value !== null)

/** Probe `/auth/me` to determine whether we have a session cookie. */
export async function refreshCurrentUser(): Promise<CurrentUser | null> {
  try {
    const me = await authApi.me()
    currentUserSig.value = me
    return me
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      currentUserSig.value = null
      return null
    }
    appLog('warn', 'auth.refreshCurrentUser failed', String(err))
    currentUserSig.value = null
    return null
  } finally {
    authReadySig.value = true
  }
}

export async function login(identifier: string, password: string): Promise<CurrentUser> {
  const me = await authApi.login(identifier, password)
  currentUserSig.value = me
  return me
}

export async function register(email: string, username: string, password: string): Promise<CurrentUser> {
  const me = await authApi.register(email, username, password)
  currentUserSig.value = me
  return me
}

export async function logout(): Promise<void> {
  try { await authApi.logout() } catch (err) { appLog('warn', 'auth.logout failed', String(err)) }
  currentUserSig.value = null
}
