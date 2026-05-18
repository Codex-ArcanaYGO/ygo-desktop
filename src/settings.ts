import { escapeHtml, fmtBytes } from './utils'
import { clearLogs, getLogs, logsSizeBytes } from './logger'
import { downloadBackup, pickBackupFile, applyBackup, type ImportMode } from './backup'
import { downloadWishlistCardmarket } from './wishlist'
import { convertYdkToCardmarket, downloadCardmarketTxt, pickYdkFile } from './cardmarket'
import { appLog } from './logger'
import { getMetricsSummary, clearMetrics } from './telemetry'
import type { CollectionCard, YGOCard } from './types'

export interface SettingsDeps {
  settingsModal: HTMLDivElement
  settingsBtn: HTMLButtonElement
  showToast: (msg: string, kind?: 'success' | 'error', withUndo?: boolean) => void
  reloadAfterImport: () => void
  wishlistIsEmpty: () => boolean
  getCollection: () => CollectionCard[]
  cardCache: Map<number, YGOCard>
}

let deps: SettingsDeps
let settingsSelectedLogTs: number | null = null

export function initSettings(d: SettingsDeps): void {
  deps = d
  deps.settingsBtn.addEventListener('click', () => {
    renderSettingsModal()
    deps.settingsModal.hidden = false
  })
  deps.settingsModal.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close-settings]')) deps.settingsModal.hidden = true
  })
}

function renderMetricsSection(): string {
  const { counters, histograms } = getMetricsSummary()
  const ms = (v: number) => `${Math.round(v)} ms`

  const counterRows = counters.length
    ? counters.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${c.value}</td></tr>`).join('')
    : '<tr><td colspan="2" class="muted small">Aucune donnée</td></tr>'

  const histoRows = histograms.length
    ? histograms
        .map(
          (h) =>
            `<tr>
              <td>${escapeHtml(h.name)}</td>
              <td>${h.count}</td>
              <td>${ms(h.avg)}</td>
              <td>${ms(h.p50)}</td>
              <td>${ms(h.p95)}</td>
              <td>${ms(h.max)}</td>
            </tr>`,
        )
        .join('')
    : '<tr><td colspan="6" class="muted small">Effectuez une recherche pour voir les latences.</td></tr>'

  return `
    <h4 class="settings-metrics-subtitle">Compteurs</h4>
    <table class="settings-metrics-table">
      <thead><tr><th>Instrument</th><th>Valeur</th></tr></thead>
      <tbody>${counterRows}</tbody>
    </table>
    <h4 class="settings-metrics-subtitle">Latences (ms)</h4>
    <table class="settings-metrics-table">
      <thead><tr><th>Opération</th><th>n</th><th>Moy</th><th>p50</th><th>p95</th><th>Max</th></tr></thead>
      <tbody>${histoRows}</tbody>
    </table>`
}

export function renderSettingsModal(): void {
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const sizeStr = fmtBytes(logsSizeBytes())
  const logs = getLogs()
  if (settingsSelectedLogTs != null && !logs.find((e) => e.ts === settingsSelectedLogTs)) {
    settingsSelectedLogTs = null
  }
  if (settingsSelectedLogTs == null && logs.length) settingsSelectedLogTs = logs[0].ts
  const selected = logs.find((e) => e.ts === settingsSelectedLogTs) ?? null

  const body = deps.settingsModal.querySelector<HTMLDivElement>('.settings-body')!
  body.innerHTML = `
    <aside class="settings-sidebar">
      <div class="settings-sidebar-head">
        <h3><i class="fa-solid fa-scroll"></i> Logs</h3>
        <span class="settings-log-size">${logs.length} · ${sizeStr}</span>
      </div>
      <ul class="settings-log-list" id="settingsLogList">
        ${!logs.length
          ? '<li class="settings-log-empty"><i class="fa-solid fa-inbox"></i> Aucun log</li>'
          : logs.map((e) => `
          <li class="settings-log-entry settings-log-${e.lvl}${e.ts === settingsSelectedLogTs ? ' is-selected' : ''}"
              data-log-ts="${e.ts}">
            <span class="settings-log-badge settings-log-badge-${e.lvl}">${e.lvl.toUpperCase()}</span>
            <span class="settings-log-msg">${escapeHtml(e.msg)}</span>
            <span class="settings-log-time">${fmt.format(new Date(e.ts))}</span>
          </li>`).join('')}
      </ul>
      <div class="settings-sidebar-foot">
        <button class="btn-danger-sm" id="clearLogsBtn"><i class="fa-solid fa-trash"></i> Vider</button>
      </div>
    </aside>
    <section class="settings-main" id="settingsMain">
      ${selected ? `
        <div class="settings-detail-head">
          <span class="settings-log-badge settings-log-badge-${selected.lvl}">${selected.lvl.toUpperCase()}</span>
          <span class="settings-log-time">${fmt.format(new Date(selected.ts))}</span>
        </div>
        <h2 class="settings-detail-title">${escapeHtml(selected.msg)}</h2>
        ${selected.data
          ? `<pre class="settings-detail-data">${escapeHtml(selected.data)}</pre>`
          : '<p class="muted small">Aucune donnée supplémentaire.</p>'}
      ` : `
        <div class="settings-detail-empty">
          <i class="fa-solid fa-circle-info"></i>
          <p>Sélectionnez un log pour le consulter.</p>
        </div>
      `}
      <div class="settings-backup">
        <h3><i class="fa-solid fa-database"></i> Sauvegarde locale</h3>
        <p class="muted small">Exporte ou restaure l'intégralité de tes données (collection, wishlist, decks, cache).</p>
        <div class="settings-backup-actions">
          <button class="btn-primary" id="backupExportBtn"><i class="fa-solid fa-download"></i> Exporter JSON</button>
          <button class="btn-secondary" id="backupImportMergeBtn"><i class="fa-solid fa-code-merge"></i> Importer (fusionner)</button>
          <button class="btn-danger-sm" id="backupImportReplaceBtn"><i class="fa-solid fa-arrows-rotate"></i> Importer (remplacer)</button>
        </div>
        <h3 style="margin-top:18px"><i class="fa-solid fa-cart-shopping"></i> Cardmarket</h3>
        <p class="muted small">Exporte la wishlist au format texte importable dans la want list Cardmarket.</p>
        <div class="settings-backup-actions">
          <button class="btn-secondary" id="wishlistCmExportBtn"${deps.wishlistIsEmpty() ? ' disabled' : ''}>
            <i class="fa-solid fa-file-export"></i> Exporter la wishlist (.txt)
          </button>
          <button class="btn-secondary" id="ydkToCmBtn">
            <i class="fa-solid fa-arrow-right-arrow-left"></i> Convertir un .ydk → Cardmarket
          </button>
        </div>
      </div>
      <div class="settings-metrics">
        <h3><i class="fa-solid fa-chart-simple"></i> Métriques</h3>
        <p class="muted small">Télémétrie en session — réinitialisée au rechargement de la page.</p>
        ${renderMetricsSection()}
        <div class="settings-metrics-actions">
          <button class="btn-danger-sm" id="clearMetricsBtn"><i class="fa-solid fa-trash"></i> Réinitialiser</button>
        </div>
      </div>
    </section>`

  body.querySelector('#clearLogsBtn')?.addEventListener('click', () => {
    clearLogs()
    settingsSelectedLogTs = null
    renderSettingsModal()
    deps.showToast('Logs vidés', 'success')
  })

  body.querySelectorAll<HTMLLIElement>('[data-log-ts]').forEach((li) => {
    li.addEventListener('click', () => {
      settingsSelectedLogTs = Number(li.dataset.logTs)
      renderSettingsModal()
    })
  })

  body.querySelector('#wishlistCmExportBtn')?.addEventListener('click', () => {
    downloadWishlistCardmarket()
    deps.showToast('Wishlist Cardmarket exportée', 'success')
  })

  body.querySelector('#ydkToCmBtn')?.addEventListener('click', async () => {
    const text = await pickYdkFile()
    if (!text) return
    try {
      const r = await convertYdkToCardmarket(text, deps.getCollection(), deps.cardCache)
      if (!r.lines.length) {
        deps.showToast('Aucune carte résolue dans ce .ydk', 'error')
        return
      }
      const ts = new Date().toISOString().slice(0, 10)
      downloadCardmarketTxt(r.lines, `ydk-cardmarket-${ts}.txt`)
      const skipped = r.missing.length
        ? ` (${r.missing.length} ID${r.missing.length > 1 ? 's' : ''} non résolu${r.missing.length > 1 ? 's' : ''})`
        : ''
      deps.showToast(`${r.unique} cartes exportées${skipped}`, 'success')
      if (skipped) appLog('warn', 'YDK → Cardmarket : IDs non résolus', [r.missing.join(', ')])
    } catch (err) {
      appLog('error', 'YDK → Cardmarket échec', [String(err)])
      deps.showToast('Conversion échouée', 'error')
    }
  })

  body.querySelector('#backupExportBtn')?.addEventListener('click', () => {
    try {
      downloadBackup()
      deps.showToast('Sauvegarde exportée', 'success')
    } catch (err) {
      appLog('error', 'Export sauvegarde échec', [String(err)])
      deps.showToast('Erreur à l’export', 'error')
    }
  })

  body.querySelector('#backupImportMergeBtn')?.addEventListener('click', () => void runImport('merge'))
  body.querySelector('#backupImportReplaceBtn')?.addEventListener('click', () => void runImport('replace'))

  body.querySelector('#clearMetricsBtn')?.addEventListener('click', () => {
    clearMetrics()
    renderSettingsModal()
    deps.showToast('Métriques réinitialisées', 'success')
  })
}

async function runImport(mode: ImportMode): Promise<void> {
  if (mode === 'replace') {
    const ok = confirm('Cette action remplace tes données actuelles par celles du fichier. Continuer ?')
    if (!ok) return
  }
  const raw = await pickBackupFile()
  if (!raw) return
  try {
    const r = applyBackup(raw, mode)
    const msg = mode === 'replace'
      ? `Restauré (${r.keysWritten} clés)`
      : `Fusionné — ${r.cardsMerged ?? 0} cartes, ${r.wishlistMerged ?? 0} wishlist, ${r.decksMerged ?? 0} decks`
    deps.showToast(msg, 'success')
    deps.reloadAfterImport()
  } catch (err) {
    appLog('error', 'Import sauvegarde échec', [String(err)])
    deps.showToast(`Import échoué : ${String(err)}`, 'error')
  }
}
