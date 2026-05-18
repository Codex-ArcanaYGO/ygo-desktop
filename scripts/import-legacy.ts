// Importe les données utilisateur depuis le dump legacy
// (`.legacy/.temp_manual_dump/data/*.json`) directement dans le localStorage
// de l'app web (en l'exécutant via la console DevTools).
//
// Usage :
//   1. Ouvrir l'app sur http://localhost:5173 (frontend) ou dans Tauri.
//   2. Ouvrir la console (Cmd+Opt+I) et coller le contenu de ce fichier.
//   3. Recharger : les données seront restaurées + poussées au prochain cycle sync.

import { STORAGE_KEY, WISHLIST_KEY, DECK_BUILDS_KEY, CARD_CACHE_KEY } from '../src/constants'

interface LegacyDump {
  ygo_collection_v1?:  unknown[]
  ygo_wishlist_v1?:    unknown[]
  ygo_deckbuilds_v1?:  unknown[]
  ygo_card_cache_v1?:  unknown[]
}

export async function importLegacyFromUrl(baseUrl: string): Promise<void> {
  const files: Array<[keyof LegacyDump, string]> = [
    ['ygo_collection_v1',  STORAGE_KEY],
    ['ygo_wishlist_v1',    WISHLIST_KEY],
    ['ygo_deckbuilds_v1',  DECK_BUILDS_KEY],
    ['ygo_card_cache_v1',  CARD_CACHE_KEY],
  ]
  for (const [name, key] of files) {
    const res = await fetch(`${baseUrl}/${name}.json`)
    if (!res.ok) continue
    const data = await res.text()
    localStorage.setItem(key, data)
    console.log(`[import-legacy] ${name} → ${key} (${data.length} bytes)`)
  }
  alert('Import legacy terminé — rechargez la page.')
}
