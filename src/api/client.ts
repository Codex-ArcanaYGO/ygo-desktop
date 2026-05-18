// API client for the arcana-ygo Rust backend.
// All endpoints live behind `/api`. Cookies (session) are sent automatically
// via `credentials: 'include'`.

import { appLog } from '../logger'

/** Resolve the API base URL.
 * - In production (same-origin SPA + backend behind Ingress), use `/api`.
 * - In dev (Vite at :5173), the user can override with `VITE_API_BASE_URL`.
 * - Tauri desktop builds set this at build-time to the public URL.
 */
export const API_BASE: string =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL ||
  '/api'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
    this.name = 'ApiError'
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers)
  let body: BodyInit | undefined = init?.body as BodyInit | undefined
  if (init?.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      body,
      credentials: 'include',
    })
  } catch (err) {
    appLog('error', `api: network error on ${path}`, String(err))
    throw new ApiError(0, 'network', 'network error')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const parsed: unknown = text ? safeJsonParse(text) : null

  if (!res.ok) {
    const e = (parsed as ApiErrorBody)?.error ?? {}
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? res.statusText)
  }
  return parsed as T
}

function safeJsonParse(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

export const api = {
  get:    <T>(path: string)              => request<T>(path, { method: 'GET' }),
  post:   <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  put:    <T>(path: string, json?: unknown) => request<T>(path, { method: 'PUT', json }),
  patch:  <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string)              => request<T>(path, { method: 'DELETE' }),
}

// ─── Typed endpoints ─────────────────────────────────────────────────────────

export interface CurrentUser {
  id: string
  email: string
  username: string
  display_name: string | null
  avatar_url: string | null
  has_password: boolean
  email_verified: boolean
}

export interface Profile extends CurrentUser {
  has_secret_question: boolean
}

export interface LinkedAccount {
  provider: string
  provider_account_id: string
  created_at: string
}

export interface SessionInfo {
  id: string
  user_agent: string | null
  ip_address: string | null
  created_at: string
  last_used_at: string
  expires_at: string
}

export interface ProviderAvailability {
  google: boolean
  github: boolean
  discord: boolean
}

export const authApi = {
  me:       ()                                  => api.get<CurrentUser>('/auth/me'),
  register: (email: string, username: string, password: string) =>
              api.post<CurrentUser>('/auth/register', { email, username, password }),
  login:    (identifier: string, password: string) =>
              api.post<CurrentUser>('/auth/login', { identifier, password }),
  logout:   ()                                  => api.post<void>('/auth/logout'),
  providers: ()                                 => api.get<ProviderAvailability>('/oauth/providers'),
  oauthStart: (provider: 'google' | 'github' | 'discord', link = false) =>
              `${API_BASE}/auth/oauth/${provider}/start${link ? '?link=true' : ''}`,
}

export const profileApi = {
  get:    ()                                            => api.get<Profile>('/profile/'),
  update: (p: Partial<Pick<Profile, 'display_name' | 'avatar_url' | 'username'>>) =>
            api.patch<Profile>('/profile/', p),
  setPassword:    (new_password: string)                => api.post<void>('/profile/password', { new_password }),
  changePassword: (current_password: string, new_password: string) =>
            api.patch<void>('/profile/password', { current_password, new_password }),
  setSecretQuestion: (question: string, answer: string) =>
            api.patch<void>('/profile/secret-question', { question, answer }),
  listAccounts:    ()                                   => api.get<LinkedAccount[]>('/profile/accounts'),
  unlinkAccount:   (provider: string)                   => api.delete<void>(`/profile/accounts/${provider}`),
  listSessions:    ()                                   => api.get<SessionInfo[]>('/profile/sessions'),
  revokeSession:   (id: string)                         => api.delete<void>(`/profile/sessions/${id}`),
}

export const dataApi = {
  getCollection: () => api.get<unknown[]>('/collection/'),
  putCollection: (data: unknown[]) => api.put<unknown[]>('/collection/', data),
  getWishlist:   () => api.get<unknown[]>('/wishlist/'),
  putWishlist:   (data: unknown[]) => api.put<unknown[]>('/wishlist/', data),
  getDecks:      () => api.get<unknown>('/decks/'),
  putDecks:      (data: unknown) => api.put<unknown>('/decks/', data),
  getSettings:   () => api.get<unknown>('/settings/'),
  putSettings:   (data: unknown) => api.put<unknown>('/settings/', data),
  getHistory:    () => api.get<unknown[]>('/history/'),
  putHistory:    (data: unknown[]) => api.put<unknown[]>('/history/', data),
}
