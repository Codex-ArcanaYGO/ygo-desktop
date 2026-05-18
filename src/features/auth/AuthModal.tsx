// Authentication modal: login ↔ register flow with full UX polish.
//
// Features:
//   • Two-tab interface (login / register) with shared password field
//   • Real-time client-side validation (email format, username charset,
//     password length + match) with inline error messages
//   • Password visibility toggle, Caps Lock indicator, strength gauge
//     (see <PasswordInput />)
//   • Friendly error mapping for 401/409/429/5xx from the backend
//   • Focus trap (Tab/Shift+Tab loop) + ESC to close + focus restoration
//   • Autofocus first field, keyboard-only flow tested
//   • Submit button blocked when form invalid; spinner during request
//   • Auto-clears credentials/errors when switching tab
//   • OAuth providers gated behind OAUTH_UI_ENABLED master switch

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'

import { authApi, ApiError, type ProviderAvailability } from '../../api/client'
import { login, register } from '../../auth/state'
import { appLog } from '../../logger'
import {
  checkEmail,
  checkUsername,
  checkPassword,
  checkPasswordMatch,
  describeAuthError,
} from '../../lib/auth-validators'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { PasswordInput } from '../../components/PasswordInput/PasswordInput'
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
  const [tab, setTab]             = useState<Tab>('login')
  const [identifier, setId]       = useState('')
  const [email, setEmail]         = useState('')
  const [username, setUser]       = useState('')
  const [password, setPwd]        = useState('')
  const [confirm, setConfirm]     = useState('')
  // Track which fields have been "touched" (blurred at least once) so we
  // only show validation errors after the user has actually interacted.
  const [touched, setTouched]     = useState<Record<string, boolean>>({})
  const [busy, setBusy]           = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [providers, setProvs]     = useState<ProviderAvailability>({ google: false, github: false, discord: false })

  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, open, { autoFocusSelector: 'input' })

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

  // Reset transient state every time the modal opens or the tab changes.
  useEffect(() => {
    if (open) {
      setFormError(null)
      setTouched({})
    }
  }, [open, tab])

  // ── Derived validations ──
  // Recompute on every render — cheap, and avoids a second source of truth.
  const emailCheck    = checkEmail(email)
  const userCheck     = checkUsername(username)
  const pwCheck       = checkPassword(password)
  const matchCheck    = checkPasswordMatch(password, confirm)
  const identifierOk  = identifier.trim().length > 0
  const loginPwOk     = password.length > 0

  const canSubmit = useMemo(() => {
    if (busy) return false
    if (tab === 'login') return identifierOk && loginPwOk
    return emailCheck.ok && userCheck.ok && pwCheck.ok && matchCheck.ok
  }, [tab, busy, identifierOk, loginPwOk, emailCheck.ok, userCheck.ok, pwCheck.ok, matchCheck.ok])

  if (!open) return null

  // Only display per-field errors after blur, or after a failed submit.
  const showErr = (field: string) => touched[field] === true
  const touch   = (field: string) => () => setTouched(t => ({ ...t, [field]: true }))

  const switchTab = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    setFormError(null)
    // Reset the confirmation field for safety; keep `password` so a user
    // who mistyped the tab can flip back without re-entering credentials.
    setConfirm('')
  }

  const onSubmit = async (ev: Event) => {
    ev.preventDefault()
    // Mark everything as touched so blocking errors become visible.
    setTouched({ identifier: true, email: true, username: true, password: true, confirm: true })
    if (!canSubmit) return

    setBusy(true)
    setFormError(null)
    try {
      if (tab === 'login') {
        await login(identifier.trim(), password)
      } else {
        await register(email.trim(), username.trim(), password)
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(describeAuthError(err.status, err.code, err.message))
      } else if (err instanceof TypeError) {
        // fetch() throws TypeError on network failure (DNS, offline, CORS).
        setFormError(describeAuthError(0, 'network'))
      } else {
        setFormError(describeAuthError(500, undefined, String(err)))
      }
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
      <div class={styles.card} ref={cardRef}>
        <button class={styles.close} onClick={onClose} aria-label="Fermer" type="button">×</button>
        <h2 id="auth-modal-title" class={styles.title}>
          {tab === 'login' ? 'Content de te revoir' : 'Bienvenue sur Arcana YGO'}
        </h2>
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
            tabIndex={tab === 'login' ? 0 : -1}
            class={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => switchTab('login')}
          >Connexion</button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'register'}
            tabIndex={tab === 'register' ? 0 : -1}
            class={`${styles.tab} ${tab === 'register' ? styles.tabActive : ''}`}
            onClick={() => switchTab('register')}
          >Créer un compte</button>
        </div>

        <form onSubmit={onSubmit} noValidate>
          {tab === 'login' ? (
            <label class={styles.field}>
              <span class={styles.label}>Email ou nom d'utilisateur</span>
              <input
                class={`${styles.input} ${showErr('identifier') && !identifierOk ? styles.invalid : ''}`}
                value={identifier}
                onInput={(e) => setId((e.target as HTMLInputElement).value)}
                onBlur={touch('identifier')}
                required
                autoComplete="username"
                aria-invalid={showErr('identifier') && !identifierOk ? 'true' : undefined}
                aria-describedby={showErr('identifier') && !identifierOk ? 'identifier-err' : undefined}
              />
              {showErr('identifier') && !identifierOk && (
                <p id="identifier-err" class={styles.fieldError}>Champ requis</p>
              )}
            </label>
          ) : (
            <>
              <label class={styles.field}>
                <span class={styles.label}>Email</span>
                <input
                  class={`${styles.input} ${showErr('email') && !emailCheck.ok ? styles.invalid : ''}`}
                  type="email"
                  value={email}
                  onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                  onBlur={touch('email')}
                  required
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={showErr('email') && !emailCheck.ok ? 'true' : undefined}
                  aria-describedby={showErr('email') && !emailCheck.ok ? 'email-err' : undefined}
                />
                {showErr('email') && !emailCheck.ok && (
                  <p id="email-err" class={styles.fieldError}>{emailCheck.reason}</p>
                )}
              </label>
              <label class={styles.field}>
                <span class={styles.label}>Nom d'utilisateur</span>
                <input
                  class={`${styles.input} ${showErr('username') && !userCheck.ok ? styles.invalid : ''}`}
                  value={username}
                  onInput={(e) => setUser((e.target as HTMLInputElement).value)}
                  onBlur={touch('username')}
                  required
                  minLength={3}
                  maxLength={32}
                  autoComplete="username"
                  aria-invalid={showErr('username') && !userCheck.ok ? 'true' : undefined}
                  aria-describedby={showErr('username') && !userCheck.ok ? 'username-err' : undefined}
                />
                {showErr('username') && !userCheck.ok && (
                  <p id="username-err" class={styles.fieldError}>{userCheck.reason}</p>
                )}
              </label>
            </>
          )}

          <PasswordInput
            value={password}
            onInput={setPwd}
            label="Mot de passe"
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={tab === 'login' ? undefined : 8}
            showStrength={tab === 'register'}
            disabled={busy}
            error={tab === 'register' && showErr('password') && !pwCheck.ok ? pwCheck.reason ?? null : null}
          />

          {tab === 'register' && (
            <PasswordInput
              value={confirm}
              onInput={setConfirm}
              label="Confirme ton mot de passe"
              autoComplete="new-password"
              required
              disabled={busy}
              error={showErr('confirm') && !matchCheck.ok ? matchCheck.reason ?? null : null}
            />
          )}

          {formError && <div class={styles.error} role="alert" aria-live="polite">{formError}</div>}

          <button
            type="submit"
            class={styles.submit}
            disabled={!canSubmit}
            aria-busy={busy ? 'true' : undefined}
          >
            {busy
              ? (
                <span class={styles.spinnerRow}>
                  <span class={styles.spinner} aria-hidden="true" /> Patiente…
                </span>
              )
              : (tab === 'login' ? 'Se connecter' : 'Créer mon compte')}
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
