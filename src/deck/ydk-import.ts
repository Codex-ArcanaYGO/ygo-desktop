// YDK paste-and-import modal. Imports into an existing deck or creates
// a new one.

import { parseYDK } from '../ydk'
import { appLog } from '../logger'
import { createOverlayModal } from '../lib/overlay-modal'
import { deps, getCardData } from './state'
import { createDeckBuild, openDeckBuilder, getCurrentDeckBuildId } from './lifecycle'
import { renderDeckBuilder } from './builder-view'

export function openYDKImport(deckId?: string): void {
  const targetDeck = deckId ? deps().getDeckBuilds().find((d) => d.id === deckId) : null
  const m = createOverlayModal({ id: 'ydkImportOverlay', maxWidth: 560 })

  m.setContent(`
    <div style="padding:24px">
      <h2 style="margin:0 0 6px"><i class="fa-solid fa-file-import"></i> Importer un deck (.ydk)</h2>
      <p class="muted small" style="margin:0 0 14px">Collez le contenu du fichier YDK ci-dessous.</p>
      ${targetDeck ? '' : `
        <label class="muted small">Nom du deck</label>
        <input id="ydkDeckName" type="text" placeholder="Mon nouveau deck" maxlength="60"
          style="width:100%;padding:10px 12px;margin-bottom:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-elev);color:var(--text)" />`}
      <textarea id="ydkText" rows="14" placeholder="#created by ...&#10;#main&#10;90681088&#10;..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-elev);color:var(--text);font-family:monospace;font-size:12px"></textarea>
      <div class="picker-actions" style="margin-top:14px">
        <button class="btn-secondary" data-overlay-close>Annuler</button>
        <button class="btn-primary" id="ydkConfirmBtn"><i class="fa-solid fa-check"></i> Importer</button>
      </div>
    </div>`)
  m.open()

  m.content.querySelector<HTMLButtonElement>('#ydkConfirmBtn')!.addEventListener('click', () => {
    const ta = m.content.querySelector<HTMLTextAreaElement>('#ydkText')!
    const parsed = parseYDK(ta.value)
    const totalParsed = parsed.main.length + parsed.extra.length + parsed.side.length
    if (!totalParsed) {
      appLog('warn', 'Import YDK : aucun ID trouvé')
      deps().showToast('Aucune carte trouvée dans le YDK', 'error')
      return
    }
    if (targetDeck) {
      targetDeck.main  = parsed.main
      targetDeck.extra = parsed.extra
      targetDeck.side  = parsed.side
      targetDeck.updatedAt = Date.now()
      deps().saveDeckBuilds()
      appLog('info', `Import YDK dans « ${targetDeck.name} » : ${totalParsed} cartes`)
      m.close()
      renderDeckBuilder()
    } else {
      const nameEl = m.content.querySelector<HTMLInputElement>('#ydkDeckName')
      const name = nameEl?.value.trim() || `Deck importé ${new Date().toLocaleDateString('fr-FR')}`
      const dk = createDeckBuild(name)
      dk.main  = parsed.main
      dk.extra = parsed.extra
      dk.side  = parsed.side
      dk.updatedAt = Date.now()
      deps().saveDeckBuilds()
      appLog('info', `Nouveau deck importé : « ${name} » (${totalParsed} cartes)`)
      m.close()
      deps().render()
      openDeckBuilder(dk.id)
    }
    const allIds = [...parsed.main, ...parsed.extra, ...parsed.side]
    const unique = [...new Set(allIds)]
    Promise.all(unique.map((id) => getCardData(id))).then(() => {
      if (getCurrentDeckBuildId()) renderDeckBuilder()
      else deps().render()
    })
    deps().showToast(`${totalParsed} cartes importées`, 'success')
  })
}
