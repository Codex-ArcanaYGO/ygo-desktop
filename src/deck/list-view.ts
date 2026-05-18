// "Decks" tab: list of deck cards with quick actions (open / rename /
// export YDK / export Cardmarket / delete).

import { escapeHtml } from '../utils'
import { appLog } from '../logger'
import { exportYDK } from '../ydk'
import { downloadFile, safeFilename, todayIso } from '../lib/download'
import { buildCardmarketLines, downloadCardmarketTxt } from '../cardmarket'
import { deps } from './state'
import { openDeckBuilder, closeDeckBuilder, getCurrentDeckBuildId } from './lifecycle'

export function renderDecksView(): void {
  const d = deps()
  const deckBuilds = d.getDeckBuilds()
  if (!deckBuilds.length) {
    d.deckBuildsListEl.innerHTML = `
      <div class="deck-builds-empty">
        <i class="fa-solid fa-folder-tree"></i>
        <h3>Aucun deck</h3>
        <p>Créez votre premier deck ou importez un fichier <code>.ydk</code>.</p>
      </div>`
    return
  }
  const fmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  d.deckBuildsListEl.innerHTML = deckBuilds.map((deck) => `
    <article class="deck-build-card" data-id="${deck.id}">
      <header class="deck-build-card-head">
        <h3 class="deck-build-name">${escapeHtml(deck.name)}</h3>
        <div class="deck-build-actions">
          <button class="icon-btn-sm" data-act="export" title="Exporter en .ydk"><i class="fa-solid fa-download"></i></button>
          <button class="icon-btn-sm" data-act="rename" title="Renommer"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn-sm icon-btn-danger" data-act="delete" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </header>
      <div class="deck-build-stats">
        <span class="stat-chip"><i class="fa-solid fa-layer-group"></i> Main <b>${deck.main.length}</b></span>
        <span class="stat-chip"><i class="fa-solid fa-star"></i> Extra <b>${deck.extra.length}</b></span>
        <span class="stat-chip"><i class="fa-solid fa-bookmark"></i> Side <b>${deck.side.length}</b></span>
      </div>
      <footer class="deck-build-card-foot">
        <span class="muted small">${fmt.format(new Date(deck.updatedAt))}</span>
        <button class="btn-primary btn-sm" data-act="open">
          <i class="fa-solid fa-folder-open"></i> Ouvrir
        </button>
      </footer>
    </article>`).join('')

  d.deckBuildsListEl.querySelectorAll<HTMLElement>('.deck-build-card').forEach((card) => {
    const id = card.dataset.id!
    card.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const act = btn.dataset.act
        if (act === 'open')   openDeckBuilder(id)
        if (act === 'export') downloadYDK(id)
        if (act === 'rename') renameDeckBuild(id)
        if (act === 'delete') confirmDeleteDeckBuild(id)
      })
    })
  })
}

export function downloadYDK(id: string): void {
  const d = deps().getDeckBuilds().find((x) => x.id === id)
  if (!d) return
  downloadFile(exportYDK(d), `${safeFilename(d.name)}.ydk`)
  appLog('info', `Export YDK : « ${d.name} »`)
}

export async function downloadDeckCardmarket(id: string): Promise<void> {
  const d = deps().getDeckBuilds().find((x) => x.id === id)
  if (!d) return
  const allIds = [...d.main, ...d.extra, ...d.side]
  if (!allIds.length) { deps().showToast('Deck vide', 'error'); return }
  try {
    const r = await buildCardmarketLines(allIds, deps().getCollection(), deps().cardCache)
    if (!r.lines.length) { deps().showToast('Aucune carte résolue', 'error'); return }
    deps().saveCardCache()
    downloadCardmarketTxt(r.lines, `${safeFilename(d.name)}-cardmarket-${todayIso()}.txt`)
    appLog('info', `Export Cardmarket : « ${d.name} » (${r.unique} cartes${r.missing.length ? `, ${r.missing.length} non résolues` : ''})`)
    const skipped = r.missing.length ? ` (${r.missing.length} non résolue${r.missing.length > 1 ? 's' : ''})` : ''
    deps().showToast(`Cardmarket exporté : ${r.unique} cartes${skipped}`, 'success')
  } catch (err) {
    appLog('error', 'Export Cardmarket échec', [String(err)])
    deps().showToast('Export échoué', 'error')
  }
}

function renameDeckBuild(id: string): void {
  const d = deps()
  const deck = d.getDeckBuilds().find((x) => x.id === id)
  if (!deck) return
  const card = d.deckBuildsListEl.querySelector<HTMLElement>(`.deck-build-card[data-id="${id}"]`)
  const h3 = card?.querySelector<HTMLHeadingElement>('.deck-build-name')
  if (!h3) return
  const old = deck.name
  h3.innerHTML = `<input class="deck-rename-input" value="${escapeHtml(old)}" maxlength="60" />`
  const input = h3.querySelector<HTMLInputElement>('input')!
  input.focus()
  input.select()
  const commit = (): void => {
    const v = input.value.trim()
    if (v && v !== old) {
      deck.name = v
      deck.updatedAt = Date.now()
      d.saveDeckBuilds()
      appLog('info', `Deck renommé : « ${old} » → « ${v} »`)
    }
    d.render()
  }
  input.addEventListener('blur', commit)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur()
    if (e.key === 'Escape') d.render()
  })
}

function confirmDeleteDeckBuild(id: string): void {
  const d = deps()
  const deck = d.getDeckBuilds().find((x) => x.id === id)
  if (!deck) return
  d.setDeckBuilds(d.getDeckBuilds().filter((x) => x.id !== id))
  d.saveDeckBuilds()
  appLog('info', `Deck supprimé : « ${deck.name} »`)
  // Close builder if it was viewing the deleted deck
  if (getCurrentDeckBuildId() === id) closeDeckBuilder()
  d.render()
  d.showToast(`Deck « ${deck.name} » supprimé`, 'success')
}
