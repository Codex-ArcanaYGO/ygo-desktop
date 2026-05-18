import { useState } from 'preact/hooks'

import { detectOS, type DesktopOS } from '../../lib/platform'
import styles from './LandingPage.module.css'

const LANDING_DISMISSED_KEY = 'arcana.landingDismissed.v1'
const RELEASES_BASE = 'https://gitlab.com/codex-thesaurus/arcanaygo/-/releases'

interface Props {
  onEnter(): void
}

const PLATFORM_LABELS: Record<DesktopOS, string> = {
  macos:   'macOS',
  windows: 'Windows',
  linux:   'Linux',
  unknown: 'votre ordinateur',
}

export function LandingPage({ onEnter }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const os = detectOS()

  const enter = () => {
    try { localStorage.setItem(LANDING_DISMISSED_KEY, '1') } catch { /* ignore */ }
    onEnter()
  }

  return (
    <div class={styles.root}>
      <div class={styles.container}>
        <nav class={styles.nav}>
          <div class={styles.brand}>
            <span class={styles.brandLogo}><i class="fa-solid fa-wand-magic-sparkles"></i></span>
            <span>Arcana YGO</span>
          </div>
          <button class={styles.skipLink} onClick={enter}>
            Continuer sur le web →
          </button>
        </nav>

        <section class={styles.hero}>
          <span class={styles.eyebrow}>Application desktop disponible</span>
          <h1 class={styles.title}>
            Ta collection Yu-Gi-Oh,<br />partout avec toi.
          </h1>
          <p class={styles.subtitle}>
            Recherche, organise et construis tes decks. Synchronise tes cartes entre
            le web et l'application desktop, avec un mode invité 100% local si tu
            préfères.
          </p>

          <div class={styles.ctaRow}>
            <div class={styles.dropdown}>
              <button
                class={`${styles.cta} ${styles.ctaPrimary}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <i class={`fa-solid fa-download ${styles.ctaIcon}`}></i>
                Télécharger pour {PLATFORM_LABELS[os]}
                <i class="fa-solid fa-chevron-down" style={{ fontSize: '0.8rem' }}></i>
              </button>
              {menuOpen && <DownloadMenu onClose={() => setMenuOpen(false)} />}
            </div>

            <button class={`${styles.cta} ${styles.ctaSecondary}`} onClick={enter}>
              <i class={`fa-solid fa-globe ${styles.ctaIcon}`}></i>
              Lancer la version web
            </button>
          </div>

          <p class={styles.platformHint}>
            Disponible sur macOS, Windows et Linux · Mode invité ou compte synchronisé
          </p>
        </section>

        <section class={styles.features}>
          <Feature
            icon="fa-solid fa-layer-group"
            title="Catalogue complet"
            body="Recherche dans toute la base Yu-Gi-Oh avec auto-complétion intelligente et filtres avancés."
          />
          <Feature
            icon="fa-solid fa-cubes-stacked"
            title="Constructeur de decks"
            body="Construis tes decks main / extra / side, importe et exporte au format YDK."
          />
          <Feature
            icon="fa-solid fa-cloud-arrow-up"
            title="Sync multi-appareils"
            body="Crée un compte (ou connecte-toi via Google, GitHub, Discord) pour synchroniser web et desktop."
          />
          <Feature
            icon="fa-solid fa-user-secret"
            title="Mode invité"
            body="Pas envie de compte ? Tout reste dans ton navigateur. Aucune donnée n'est envoyée."
          />
          <Feature
            icon="fa-solid fa-bolt"
            title="Hors ligne"
            body="L'app desktop fonctionne sans connexion une fois ta collection chargée."
          />
          <Feature
            icon="fa-solid fa-shield-halved"
            title="Open source"
            body="Code transparent, données chez toi ou sur ton serveur. Pas de tracking."
          />
        </section>
      </div>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <article class={styles.feature}>
      <span class={styles.featureIcon}><i class={icon}></i></span>
      <h3 class={styles.featureTitle}>{title}</h3>
      <p class={styles.featureBody}>{body}</p>
    </article>
  )
}

function DownloadMenu({ onClose }: { onClose(): void }) {
  const items: Array<{ os: DesktopOS; label: string; icon: string }> = [
    { os: 'macos',   label: 'macOS (Apple Silicon / Intel)', icon: 'fa-brands fa-apple' },
    { os: 'windows', label: 'Windows (.msi)',               icon: 'fa-brands fa-windows' },
    { os: 'linux',   label: 'Linux (.AppImage / .deb)',     icon: 'fa-brands fa-linux' },
  ]
  return (
    <div class={styles.menu} role="menu">
      {items.map((it) => (
        <a
          key={it.os}
          class={styles.menuItem}
          href={`${RELEASES_BASE}?platform=${it.os}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          role="menuitem"
        >
          <i class={it.icon}></i>
          <span>{it.label}</span>
        </a>
      ))}
    </div>
  )
}

/** Returns true if the landing was previously dismissed. */
export function landingDismissed(): boolean {
  try { return localStorage.getItem(LANDING_DISMISSED_KEY) === '1' } catch { return false }
}
