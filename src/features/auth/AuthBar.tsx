import { useEffect, useState } from 'preact/hooks'

import { currentUserSig, refreshCurrentUser } from '../../auth/state'
import { AuthModal } from './AuthModal'
import { ProfilePage } from './ProfilePage'
import { UpdateButton } from '../update/UpdateButton'
import styles from './Auth.module.css'

/**
 * Top-bar widget: shows "Connexion" when logged-out (opens auth modal) or
 * the current user's avatar+name when logged-in (opens profile page).
 *
 * Subscribes to `currentUserSig`; safe to mount unconditionally.
 */
export function AuthBar() {
  const [authOpen, setAuthOpen] = useState(false)
  const [profOpen, setProfOpen] = useState(false)
  const user = currentUserSig.value

  useEffect(() => { void refreshCurrentUser() }, [])

  return (
    <div class={styles.bar}>
      <UpdateButton />
      {user ? (
        <button class={styles.userPill} onClick={() => setProfOpen(true)} title="Profil">
          {user.avatar_url
            ? <img class={styles.avatar} src={user.avatar_url} alt="" />
            : <span class={styles.avatar}>{user.username.charAt(0).toUpperCase()}</span>}
          <span>{user.display_name || user.username}</span>
        </button>
      ) : (
        <button class={styles.btnPrimary} onClick={() => setAuthOpen(true)}>
          Connexion
        </button>
      )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <ProfilePage open={profOpen} onClose={() => setProfOpen(false)} />
    </div>
  )
}
