import { useEffect, useState } from 'preact/hooks'

import { isTauri } from '../../lib/platform'
import { appLog } from '../../logger'
import styles from './UpdateButton.module.css'

/** Public URL where a user can browse all releases. */
const RELEASES_URL = 'https://gitlab.com/codex-thesaurus/arcanaygo/-/releases'

type Status = 'idle' | 'checking' | 'available' | 'up-to-date' | 'error'

interface UpdateInfo {
  version: string
  body?: string
}

/**
 * Desktop-only "Check for updates" button.
 * Returns null on the web build so callers can mount unconditionally.
 *
 * Uses the Tauri updater plugin if available; otherwise it falls back to
 * opening the public releases page in the system browser.
 */
export function UpdateButton() {
  const [status, setStatus] = useState<Status>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Render nothing in the web build (after hooks to keep order stable).
  if (!isTauri()) return null

  const onClick = async () => {
    if (status === 'available') {
      await installAndRelaunch(setStatus, setToast)
      return
    }
    await checkForUpdate(setStatus, setInfo, setToast)
  }

  const label =
    status === 'checking'   ? 'Vérification…'
    : status === 'available' ? `Installer v${info?.version ?? ''}`
    : status === 'up-to-date' ? 'À jour'
    : status === 'error'     ? 'Réessayer'
    : 'Vérifier les mises à jour'

  const iconClass =
    status === 'checking'
      ? `fa-solid fa-arrows-rotate ${styles.spinning}`
      : status === 'available'
      ? 'fa-solid fa-download'
      : status === 'up-to-date'
      ? 'fa-solid fa-check'
      : 'fa-solid fa-arrow-up'

  return (
    <>
      <button
        class={`${styles.btn} ${status === 'available' ? styles.btnHasUpdate : ''}`}
        onClick={onClick}
        disabled={status === 'checking'}
        title="Mises à jour de l'application desktop"
      >
        <i class={`${iconClass} ${styles.icon}`}></i>
        <span>{label}</span>
      </button>
      {toast && (
        <div class={styles.toast}>
          <p class={styles.toastTitle}>{toast.title}</p>
          <p class={styles.toastBody}>{toast.body}</p>
        </div>
      )}
    </>
  )
}

// ─── Updater logic ───────────────────────────────────────────────────────────

interface TauriUpdate {
  version: string
  body?: string
  downloadAndInstall: () => Promise<void>
}
interface UpdaterApi { check: () => Promise<TauriUpdate | null> }
interface ProcessApi { relaunch: () => Promise<void> }

/** Dynamically import the updater plugin if installed. */
async function loadUpdater(): Promise<UpdaterApi | null> {
  try {
    const spec = '@tauri-apps/plugin-updater'
    return (await import(/* @vite-ignore */ spec)) as unknown as UpdaterApi
  } catch {
    return null
  }
}
async function loadProcess(): Promise<ProcessApi | null> {
  try {
    const spec = '@tauri-apps/plugin-process'
    return (await import(/* @vite-ignore */ spec)) as unknown as ProcessApi
  } catch {
    return null
  }
}
async function loadOpener(): Promise<((url: string) => Promise<void>) | null> {
  try {
    const spec = '@tauri-apps/plugin-opener'
    const m = (await import(/* @vite-ignore */ spec)) as { openUrl?: (u: string) => Promise<void> }
    if (m.openUrl) return m.openUrl
  } catch { /* ignore */ }
  return null
}

async function openExternal(url: string) {
  const opener = await loadOpener()
  if (opener) { await opener(url); return }
  window.open(url, '_blank', 'noopener,noreferrer')
}

async function checkForUpdate(
  setStatus: (s: Status) => void,
  setInfo: (i: UpdateInfo | null) => void,
  setToast: (t: { title: string; body: string } | null) => void,
) {
  setStatus('checking')
  const updater = await loadUpdater()
  if (!updater) {
    setStatus('idle')
    setToast({
      title: 'Mises à jour',
      body: 'Consulte la page des releases dans ton navigateur.',
    })
    await openExternal(RELEASES_URL)
    return
  }
  try {
    const update = await updater.check()
    if (update) {
      setInfo({ version: update.version, body: update.body })
      setStatus('available')
      setToast({
        title: `Version ${update.version} disponible`,
        body: 'Clique sur le bouton pour installer.',
      })
      ;(window as Window & { __ygoUpdate?: TauriUpdate }).__ygoUpdate = update
    } else {
      setStatus('up-to-date')
      setToast({ title: 'Aucune mise à jour', body: 'Tu es déjà sur la dernière version.' })
      setTimeout(() => setStatus('idle'), 3000)
    }
  } catch (err) {
    appLog('warn', 'updater.check failed', String(err))
    setStatus('error')
    setToast({ title: 'Erreur', body: 'Impossible de vérifier les mises à jour.' })
  }
}

async function installAndRelaunch(
  setStatus: (s: Status) => void,
  setToast: (t: { title: string; body: string } | null) => void,
) {
  const update = (window as Window & { __ygoUpdate?: TauriUpdate }).__ygoUpdate
  if (!update) return
  setStatus('checking')
  try {
    await update.downloadAndInstall()
    const proc = await loadProcess()
    if (proc) {
      await proc.relaunch()
    } else {
      setToast({ title: 'Installé', body: 'Relance manuellement l\'application.' })
    }
  } catch (err) {
    appLog('warn', 'updater.install failed', String(err))
    setStatus('error')
    setToast({ title: 'Erreur', body: 'L\'installation a échoué.' })
  }
}
