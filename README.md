# YGO Desktop

Application native (Tauri 2 + Preact + TypeScript) pour gérer sa collection Yu-Gi-Oh!.

**Cible prioritaire : macOS** (Apple Silicon & Intel). Build Windows supporté via `npm run tauri:build` sur une machine Windows ou via GitHub Actions.

## Modes de fonctionnement

| Mode        | Comportement                                                                     |
|-------------|----------------------------------------------------------------------------------|
| Hors-ligne  | UI complète, persistance locale (storage natif Tauri). Les écritures s'accumulent dans la file de sync. |
| En ligne    | Synchronisation CRDT toutes les 30s avec le backend (`VITE_API_BASE`). Pas de conflit possible. |
| Premier login d'un nouvel appareil | Snapshot complet (`GET /api/sync/:store/state`) pour amorçage, puis pulls deltas. |

La couche de synchronisation est un **LWW-Element-Set** ([détails](https://github.com/Codex-ArcanaYGO/ygo-web-backend/blob/main/docs/SYNC.md)).

## Pré-requis

- Rust (`rustup`) — https://rustup.rs
- Node.js 22+
- macOS : Xcode Command Line Tools (`xcode-select --install`)
- Windows : Visual Studio Build Tools 2022 + WebView2

## Démarrage

```bash
make setup        # installe deps Node + .env
make dev          # lance Vite + Tauri (hot reload)
make build        # build natif → src-tauri/target/release/bundle/
```

## Configuration du backend

```bash
cp .env.example .env
# édite .env, par exemple :
#   VITE_API_BASE=https://api.ygo.example.com/api
```

Quand `VITE_API_BASE` n'est pas joignable, l'app passe silencieusement en mode offline : aucune erreur visible, les écritures locales sont conservées et seront poussées au prochain cycle de sync.

## Tests

```bash
make test         # vitest (logique sync, persistance, parsers, etc.)
make typecheck    # tsc --noEmit
make check        # cargo check côté Tauri
```

## Build de release

```bash
make build
```

Artefacts (macOS) :
- `src-tauri/target/release/bundle/dmg/YGO Collection_0.2.1_aarch64.dmg`
- `src-tauri/target/release/bundle/macos/YGO Collection.app`

Pour produire un build Windows depuis macOS : utilisez la pipeline GitHub Actions (`.github/workflows/release.yml`).
