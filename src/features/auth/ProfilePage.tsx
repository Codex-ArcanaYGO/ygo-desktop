import { useEffect, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'

import {
  profileApi, authApi, ApiError,
  type LinkedAccount, type Profile, type ProviderAvailability, type SessionInfo,
} from '../../api/client'
import { logout, currentUserSig } from '../../auth/state'
import { appLog } from '../../logger'
import styles from './Auth.module.css'

interface Props {
  open: boolean
  onClose(): void
}

export function ProfilePage({ open, onClose }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [providers, setProviders] = useState<ProviderAvailability>({ google: false, github: false, discord: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err', text: string } | null>(null)

  const reload = async () => {
    try {
      const [p, a, s, prov] = await Promise.all([
        profileApi.get(),
        profileApi.listAccounts(),
        profileApi.listSessions(),
        authApi.providers(),
      ])
      setProfile(p)
      setAccounts(a)
      setSessions(s)
      setProviders(prov)
    } catch (err) {
      appLog('warn', 'ProfilePage.reload failed', String(err))
    }
  }

  useEffect(() => { if (open) void reload() }, [open])

  if (!open || !profile) return null

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const onDoLogout = async () => {
    await logout()
    onClose()
  }

  return createPortal(
    <div
      class={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Profil utilisateur"
    >
      <div class={`${styles.card} ${styles.cardLarge}`}>
        <button class={styles.close} onClick={onClose} aria-label="Fermer">×</button>

        <div class={styles.profileHeader}>
          <Avatar user={profile} large />
          <div>
            <h2 class={styles.profileName}>{profile.display_name || profile.username}</h2>
            <p class={styles.profileEmail}>{profile.email}</p>
          </div>
        </div>

        {msg && <div class={msg.kind === 'ok' ? styles.success : styles.error}>{msg.text}</div>}

        <ProfileSection
          profile={profile}
          onSaved={(p) => { setProfile(p); flash('ok', 'Profil mis à jour') }}
          onError={(t) => flash('err', t)}
          busy={busy} setBusy={setBusy}
        />

        <PasswordSection
          profile={profile}
          onChanged={() => { void reload(); flash('ok', 'Mot de passe mis à jour') }}
          onError={(t) => flash('err', t)}
          busy={busy} setBusy={setBusy}
        />

        <SecretQuestionSection
          onSaved={() => { void reload(); flash('ok', 'Question secrète enregistrée') }}
          onError={(t) => flash('err', t)}
          busy={busy} setBusy={setBusy}
        />

        <AccountsSection
          accounts={accounts}
          providers={providers}
          onChanged={() => { void reload(); flash('ok', 'Comptes mis à jour') }}
          onError={(t) => flash('err', t)}
        />

        <SessionsSection
          sessions={sessions}
          onRevoked={() => { void reload(); flash('ok', 'Session révoquée') }}
          onError={(t) => flash('err', t)}
        />

        <div class={styles.section}>
          <button class={styles.danger} onClick={onDoLogout}>Se déconnecter</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── Subsections ─────────────────────────────────────────────────────────────

function Avatar({ user, large }: { user: { username: string; avatar_url: string | null }, large?: boolean }) {
  const cls = large ? styles.profileAvatar : styles.avatar
  if (user.avatar_url) return <img class={cls} src={user.avatar_url} alt="" />
  return <span class={cls}>{user.username.charAt(0).toUpperCase()}</span>
}

interface SectionProps {
  busy: boolean
  setBusy(b: boolean): void
  onError(t: string): void
}

function ProfileSection({
  profile, onSaved, onError, busy, setBusy,
}: SectionProps & { profile: Profile, onSaved(p: Profile): void }) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [username, setUsername] = useState(profile.username)

  const save = async (ev: Event) => {
    ev.preventDefault()
    setBusy(true)
    try {
      const p = await profileApi.update({ display_name: displayName, username })
      onSaved(p)
      currentUserSig.value = { ...currentUserSig.value!, username: p.username, display_name: p.display_name }
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section class={styles.section}>
      <h3 class={styles.sectionTitle}>Informations</h3>
      <form onSubmit={save}>
        <label class={styles.field}>
          <span class={styles.label}>Nom affiché</span>
          <input class={styles.input} value={displayName}
                 onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)} />
        </label>
        <label class={styles.field}>
          <span class={styles.label}>Nom d'utilisateur</span>
          <input class={styles.input} value={username} minLength={3} maxLength={32}
                 onInput={(e) => setUsername((e.target as HTMLInputElement).value)} required />
        </label>
        <button class={styles.submit} disabled={busy}>Enregistrer</button>
      </form>
    </section>
  )
}

function PasswordSection({
  profile, onChanged, onError, busy, setBusy,
}: SectionProps & { profile: Profile, onChanged(): void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const submit = async (ev: Event) => {
    ev.preventDefault()
    setBusy(true)
    try {
      if (profile.has_password) {
        await profileApi.changePassword(current, next)
      } else {
        await profileApi.setPassword(next)
      }
      setCurrent(''); setNext('')
      onChanged()
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section class={styles.section}>
      <h3 class={styles.sectionTitle}>Mot de passe</h3>
      <p class={styles.sectionDescr}>
        {profile.has_password
          ? 'Modifie ton mot de passe actuel.'
          : 'Définis un mot de passe pour pouvoir te connecter sans OAuth.'}
      </p>
      <form onSubmit={submit}>
        {profile.has_password && (
          <label class={styles.field}>
            <span class={styles.label}>Mot de passe actuel</span>
            <input class={styles.input} type="password" value={current} required
                   onInput={(e) => setCurrent((e.target as HTMLInputElement).value)} />
          </label>
        )}
        <label class={styles.field}>
          <span class={styles.label}>Nouveau mot de passe</span>
          <input class={styles.input} type="password" value={next} required minLength={8}
                 onInput={(e) => setNext((e.target as HTMLInputElement).value)} />
        </label>
        <button class={styles.submit} disabled={busy}>
          {profile.has_password ? 'Changer le mot de passe' : 'Définir un mot de passe'}
        </button>
      </form>
    </section>
  )
}

function SecretQuestionSection({
  onSaved, onError, busy, setBusy,
}: SectionProps & { onSaved(): void }) {
  const [q, setQ] = useState('')
  const [a, setA] = useState('')

  const submit = async (ev: Event) => {
    ev.preventDefault()
    setBusy(true)
    try {
      await profileApi.setSecretQuestion(q, a)
      setQ(''); setA('')
      onSaved()
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section class={styles.section}>
      <h3 class={styles.sectionTitle}>Question secrète</h3>
      <p class={styles.sectionDescr}>
        Méthode de récupération si tu n'utilises ni mot de passe ni OAuth.
      </p>
      <form onSubmit={submit}>
        <label class={styles.field}>
          <span class={styles.label}>Question</span>
          <input class={styles.input} value={q} required
                 onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </label>
        <label class={styles.field}>
          <span class={styles.label}>Réponse</span>
          <input class={styles.input} value={a} required
                 onInput={(e) => setA((e.target as HTMLInputElement).value)} />
        </label>
        <button class={styles.submit} disabled={busy}>Enregistrer</button>
      </form>
    </section>
  )
}

function AccountsSection({
  accounts, providers, onChanged, onError,
}: {
  accounts: LinkedAccount[]
  providers: ProviderAvailability
  onChanged(): void
  onError(t: string): void
}) {
  const linkedSet = new Set(accounts.map((a) => a.provider))
  const list: Array<{ name: 'google' | 'github' | 'discord', label: string }> = [
    { name: 'google',  label: 'Google'  },
    { name: 'github',  label: 'GitHub'  },
    { name: 'discord', label: 'Discord' },
  ]
  const visible = list.filter((p) => providers[p.name] || linkedSet.has(p.name))

  const unlink = async (provider: string) => {
    try {
      await profileApi.unlinkAccount(provider)
      onChanged()
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err))
    }
  }

  return (
    <section class={styles.section}>
      <h3 class={styles.sectionTitle}>Comptes associés</h3>
      {visible.length === 0 && <p class={styles.sectionDescr}>Aucun fournisseur OAuth configuré.</p>}
      {visible.map((p) => {
        const linked = linkedSet.has(p.name)
        return (
          <div class={styles.row} key={p.name}>
            <div class={styles.rowMeta}>
              <span class={styles.rowLabel}>{p.label}</span>
              <span class={styles.rowSubtle}>{linked ? 'Associé' : 'Non associé'}</span>
            </div>
            {linked ? (
              <button class={styles.danger} onClick={() => unlink(p.name)}>Dissocier</button>
            ) : (
              <a class={styles.oauthBtn} href={authApi.oauthStart(p.name, true)}>Associer</a>
            )}
          </div>
        )
      })}
    </section>
  )
}

function SessionsSection({
  sessions, onRevoked, onError,
}: {
  sessions: SessionInfo[]
  onRevoked(): void
  onError(t: string): void
}) {
  const revoke = async (id: string) => {
    try {
      await profileApi.revokeSession(id)
      onRevoked()
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err))
    }
  }

  return (
    <section class={styles.section}>
      <h3 class={styles.sectionTitle}>Sessions actives</h3>
      {sessions.length === 0 && <p class={styles.sectionDescr}>Aucune session active.</p>}
      {sessions.map((s) => (
        <div class={styles.row} key={s.id}>
          <div class={styles.rowMeta}>
            <span class={styles.rowLabel}>{s.user_agent || 'Appareil inconnu'}</span>
            <span class={styles.rowSubtle}>
              {s.ip_address ?? ''} · dernière activité {new Date(s.last_used_at).toLocaleString()}
            </span>
          </div>
          <button class={styles.danger} onClick={() => revoke(s.id)}>Révoquer</button>
        </div>
      ))}
    </section>
  )
}
