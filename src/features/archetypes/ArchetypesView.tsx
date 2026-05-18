// Top-level archetypes view: search + grid + modal management.

import { useEffect } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { ArchetypeCard } from './ArchetypeCard'
import { ArchetypeModal } from './ArchetypeModal'
import { CardSearchResults } from './CardSearchResults'
import { archetypeListSig, loadArchetypeList, sortArchetypesByKey } from './state'
import { archetypeSortSig, langSig, pinnedArchetypesSig } from '../../app/state'
import { fuzzyScore } from '../../lib/fuzzy'
import type { ArchetypeSortKey } from '../../types'
import styles from './ArchetypesView.module.css'

/** Set this to programmatically open an archetype from outside (modal nav). */
let _openExternal: ((name: string) => void) | null = null
export function openArchetypeExternal(name: string): void {
  _openExternal?.(name)
}

export function ArchetypesView(): preact.JSX.Element {
  const filter        = useSignal('')
  const cardQuery     = useSignal('')
  const openName      = useSignal<string | null>(null)
  const loading       = useSignal(false)

  // Wire external opener.
  useEffect(() => {
    _openExternal = (name) => { openName.value = name }
    return () => { _openExternal = null }
  }, [])

  // Load list on first render.
  useEffect(() => {
    if (archetypeListSig.value.length) return
    loading.value = true
    loadArchetypeList()
      .catch(() => { /* showToast handled by caller if needed */ })
      .finally(() => { loading.value = false })
  }, [])

  const all     = archetypeListSig.value
  const pinned  = pinnedArchetypesSig.value
  const fLower  = filter.value.trim()

  // Fuzzy score: 0 = exact substring, 1 = subsequence/multi-word, 2 = typo, null = no match
  const scoreOf = (n: string): number => fLower ? (fuzzyScore(fLower, n) ?? Infinity) : 0
  const matchFn = (n: string): boolean => !fLower || scoreOf(n) < Infinity

  // Pinned always first, sorted by fuzzy score when filtering
  const pinnedFiltered = all
    .filter((n) => pinned.has(n) && matchFn(n))
    .sort((a, b) => scoreOf(a) - scoreOf(b))

  // Unpinned: sort by fuzzy score when filtering, otherwise by selected sort key
  let unpinnedFiltered = all.filter((n) => !pinned.has(n) && matchFn(n))
  if (fLower) {
    unpinnedFiltered = unpinnedFiltered.sort((a, b) => scoreOf(a) - scoreOf(b))
  } else {
    unpinnedFiltered = sortArchetypesByKey(unpinnedFiltered, archetypeSortSig.value, langSig.value)
  }

  const filtered     = [...pinnedFiltered, ...unpinnedFiltered]
  const totalVisible = filtered.length

  return (
    <div class={styles.page}>
      <header class={styles.header}>
        <div class={styles.titleBar}>
          <h2 class={styles.title}>
            <i class={`fa-solid fa-tags ${styles.titleIcon}`} /> Archétypes
            <span class={styles.count}>
              {totalVisible}{totalVisible !== all.length ? ` / ${all.length}` : ''}
            </span>
          </h2>
        </div>

        <div class={styles.controls}>
          <div class={styles.filter}>
            <i class="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Filtrer par nom d'archétype…"
              value={filter.value}
              onInput={(e) => { filter.value = (e.currentTarget as HTMLInputElement).value }}
              autoComplete="off"
              spellcheck={false}
            />
            {filter.value && (
              <button class={styles.clearBtn} onClick={() => { filter.value = '' }} aria-label="Effacer">
                <i class="fa-solid fa-xmark" />
              </button>
            )}
          </div>
          <div class={styles.filter}>
            <i class="fa-solid fa-id-card" />
            <input
              type="text"
              placeholder="Trouver l'archétype d'une carte…"
              value={cardQuery.value}
              onInput={(e) => { cardQuery.value = (e.currentTarget as HTMLInputElement).value }}
              autoComplete="off"
              spellcheck={false}
            />
            {cardQuery.value && (
              <button class={styles.clearBtn} onClick={() => { cardQuery.value = '' }} aria-label="Effacer">
                <i class="fa-solid fa-xmark" />
              </button>
            )}
          </div>
          <CardSearchResults
            query={cardQuery.value}
            onArchetype={(name) => { openName.value = name }}
          />
          <div class={styles.sortGroup}>
            <label class={styles.sortLabel}>Trier</label>
            <select
              value={archetypeSortSig.value}
              onChange={(e) => { archetypeSortSig.value = (e.currentTarget.value as ArchetypeSortKey) }}
              class={styles.sortSelect}
            >
              <option value="name">A → Z</option>
              <option value="name-desc">Z → A</option>
              <option value="cards">Plus de cartes</option>
              <option value="cards-asc">Moins de cartes</option>
              <option value="progress">Plus complétés</option>
              <option value="progress-asc">Moins complétés</option>
            </select>
          </div>
        </div>
      </header>

      {loading.value && !all.length
        ? <div class={styles.loading}><i class="fa-solid fa-spinner fa-spin" /> Chargement…</div>
        : filtered.length
          ? (
            <>
              {pinnedFiltered.length > 0 && (
                <div class={styles.sectionLabel}>
                  <i class="fa-solid fa-thumbtack" /> Épinglés
                </div>
              )}
              <div class={styles.grid}>
                {pinnedFiltered.map((name) => (
                  <ArchetypeCard key={name} name={name} onOpen={(n) => { openName.value = n }} />
                ))}
              </div>
              {unpinnedFiltered.length > 0 && (
                <>
                  {pinnedFiltered.length > 0 && (
                    <div class={styles.sectionLabel}>
                      <i class="fa-solid fa-tags" /> Tous les archétypes
                    </div>
                  )}
                  <div class={styles.grid}>
                    {unpinnedFiltered.map((name) => (
                      <ArchetypeCard key={name} name={name} onOpen={(n) => { openName.value = n }} />
                    ))}
                  </div>
                </>
              )}
            </>
          )
          : (
            <div class={styles.empty}>
              <i class="fa-solid fa-magnifying-glass" />
              <p>Aucun archétype ne correspond à « {filter.value} ».</p>
              <p class={styles.emptyHint}>Essayez un autre mot ou vérifiez l'orthographe.</p>
            </div>
          )}

      {openName.value && (
        <ArchetypeModal
          name={openName.value}
          onClose={() => { openName.value = null }}
        />
      )}
    </div>
  )
}
