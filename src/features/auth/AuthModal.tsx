import { useEffect, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'

import { authApi, ApiError, type ProviderAvailability } from '../../api/client'
import { login, register } from '../../auth/state'
import { appLog } from '../../logger'
import styles from './Auth.module.css'

type Tab = 'login' | 'register'

/**
 * Master switch for OAuth providers in the UI.
 * Set to `false` while we don't ship Google / GitHub / Discord apps yet —
 * keeps the modal lean and avoids querying /api/oauth/providers.
 */
const OAUTH_UI_ENABLED = false

interface Props {
  open: boolean
  onClose(): void
  onSuccess?(): void
}

export function AuthModal({ open, onClose, onSuccess }: Props) {
  const [tab, setTab]         = useState<Tab>('login')
  const [identifier, setId]   = useState('')
  const [email, setEmail]     = useState('')
  const [username, setUser]   = useState('')
  const [password, setPwd]    = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [providers, setProvs] = useState<ProviderAvailability>({ google: false, github: false, discord: false })

  // Fetch OAuth provider availability only when the master switch is on.
  useEffect(() => {
    if (!open || !OAUTH_UI_ENABLED) return
    authApi.providers()
      .then(setProvs)
      .catch((err: unknown) => appLog('warn', 'AuthModal: providers fetch failed', String(err)))
  }, [open])

  // Close on ESC key.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const onSubmit = async (ev: Event) => {
    ev.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (tab === 'login') {
        await login(identifier, password)
      } else {
        await register(email, username, password)
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const showOauth =
    OAUTH_UI_ENABLED && (providers.google || providers.github || providers.discord)

  const modal = (
    <div
      class={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div class={styles.card}>
        <button class={styles.close} onClick={onClose} aria-label="Fermer">×</button>
        <h2 id="auth-modal-title" class={styles.title}>Bienvenue</h2>
        <p class={styles.subtitle}>
          {tab === 'login'
            ? 'Connecte-toi pour synchroniser ta collection.'
            : 'Crée un compte — ta collection actuelle sera sauvegardée dessus.'}
        </p>

        <div class={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'login'}
            class={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => setTab('login')}
          >Connexion</button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'register'}
            class={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => setTab('register')}
          >Créer un compte</button>
        </div>

        <form onSubmit={onSubmit} noValidate>
          {tab === 'login' ? (
            <label class={styles.field}>
              <span class={styles.label}>Email ou nom d'utilisateur</span>
              <input
                class={styles.input}
                value={identifier}
                onInput={(e) => setId((e.target as HTMLInputElement).value)}
                required
                autoComplete="username"
              />
            </label>
          ) : (
            <>
              <label class={styles.field}>
                <span class={styles.label}>Email</span>
                <input
                  class={styles.input}
                  type="email"
                  value={email}
                  onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                  required
                  autoComplete="email"
                />
              </label>
              <label class={styles.field}>
                <span class={styles.label}>Nom d'utilisateur</span>
                <input
                  class={styles.input}
                  value={username}
                  onInput={(e) => setUser((e.target as HTMLInputElement).value)}
                  required
                  minLength={3}
                  maxLength={32}
                  autoComplete="username"
                />
              </label>
            </>
          )}
          <label class={styles.field}>
            <span class={styles.label}>Mot de passe</span>
            <input
              class={styles.input}
              type="password"
              value={password}
              onInput={(e) => setPwd((e.target as HTMLInputElement).value)}
              required
              minLength={8}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <div class={styles.error} role="alert">{error}</div>}

          <button type="submit" class={styles.submit} disabled={busy}>
            {busy ? '…' : tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        {showOauth && (
          <>
            <div class={styles.divider}>ou continuer avec</div>
            <div class={styles.oauthGrid}>
              {providers.google && (
                <a class={styles.oauthBtn} href={authApi.oauthStart('google')}>Google</a>
              )}
              {providers.github && (
                <a class={styles.oauthBtn} href={authApi.oauthStart('github')}>GitHub</a>
              )}
              {providers.discord && (
                <a class={styles.oauthBtn} href={authApi.oauthStart('discord')}>Discord</a>
              )}
            </div>
          </>
        )}

        <p class={styles.footer}>
          Pas envie de créer un compte ? Tu peux continuer en mode invité (données locales uniquement).
        </p>
      </div>
    </div>
  )

  // Render via portal so the overlay escapes the topbar's containing block
  // (which has `backdrop-filter` and traps `position: fixed` children).
  return createPortal(modal, document.body)
}
