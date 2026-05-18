// Debounced "find a card → see its archetype" search.

import { useEffect } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import type { YGOCard } from '../../types'
import { fetchCards } from '../../api'
import { appLog } from '../../logger'
import { openCard } from '../../app/state'
import styles from './CardSearchResults.module.css'

interface Props {
  query:        string
  onArchetype:  (name: string) => void
}

export function CardSearchResults({ query, onArchetype }: Props): preact.JSX.Element | null {
  const results = useSignal<YGOCard[]>([])
  const loading = useSignal(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) { results.value = []; return }
    let cancelled = false
    const t = window.setTimeout(async () => {
      loading.value = true
      try {
        let r = await fetchCards(q, 'fr')
        if (!r.length) r = await fetchCards(q, null)
        if (!cancelled) results.value = r
      } catch (e) {
        appLog('warn', 'Recherche carte échouée', String(e))
        if (!cancelled) results.value = []
      } finally {
        if (!cancelled) loading.value = false
      }
    }, 280)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [query])

  if (!query.trim()) return null
  if (loading.value && !results.value.length) {
    return <div class={`${styles.results} ${styles.empty}`}>Recherche en cours…</div>
  }
  if (!results.value.length) {
    return <div class={`${styles.results} ${styles.empty}`}>Aucune carte trouvée.</div>
  }

  return (
    <ul class={styles.results}>
      {results.value.slice(0, 8).map((c) => (
        <li
          key={c.id}
          class={styles.row}
          onClick={() => openCard(c.id, 'search')}
        >
          <img src={c.card_images?.[0]?.image_url_small ?? ''} alt="" loading="lazy" class={styles.thumb} />
          <div class={styles.body}>
            <span class={styles.name}>{c.name}</span>
            {c.archetype
              ? (
                <button
                  class={styles.chip}
                  onClick={(e) => { e.stopPropagation(); onArchetype(c.archetype!) }}
                >
                  <i class="fa-solid fa-tags" /> {c.archetype}
                  <i class="fa-solid fa-arrow-right-long" />
                </button>
              )
              : <span class={styles.noArchetype}>Aucun archétype</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}
