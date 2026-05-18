// ─── Curated meta deck templates ──────────────────────────────────────────────
//
// These are skeleton recipes for popular competitive decks. Each suggestion
// references one or more YGOPRODeck *archetypes* (which we fetch dynamically
// via the public API) plus a small list of generic *staples* (resolved by
// exact card name). The runtime builds an actual deck list when the user
// clicks "Ajouter à mes decks".
//
// Tiers and win-rate values are approximate community estimates — they exist
// to give the user a relative ranking, not as authoritative numbers.

export interface DeckSuggestion {
  /** Stable id used to dedup suggestions across renders. */
  id: string
  /** Display name for the suggestion card. */
  name: string
  /** Short pitch shown below the title. */
  description: string
  /** Tier 1 = top meta, 2 = competitive, 3 = rogue/fun. */
  tier: 1 | 2 | 3
  /** Community-estimated win rate (0–100). Indicative only. */
  estWinrate: number
  /** Archetype names exactly as referenced by YGOPRODeck's API. */
  archetypes: string[]
  /** Generic staple card names to include (exact YGOPRODeck names). */
  staples: string[]
  /** Optional notes about the playstyle. */
  notes?: string
}

/**
 * Generic hand-trap and board-breaker staples used by virtually every
 * competitive deck in the current format. Resolved by exact name.
 */
export const GENERIC_STAPLES: readonly string[] = [
  'Ash Blossom & Joyous Spring',
  'Maxx "C"',
  'Effect Veiler',
  'Nibiru, the Primal Being',
  'Ghost Belle & Haunted Mansion',
  'Droll & Lock Bird',
  'Triple Tactics Talent',
  'Called by the Grave',
  'Crossout Designator',
  'Infinite Impermanence',
] as const

export const DECK_SUGGESTIONS: readonly DeckSuggestion[] = [
  {
    id: 'snake-eye-fire-king',
    name: 'Snake-Eye Fire King',
    description: 'Combo plié explosif, ressources infinies via FIRE/Diabellstar.',
    tier: 1,
    estWinrate: 58,
    archetypes: ['Snake-Eye', 'Fire King'],
    staples: [...GENERIC_STAPLES],
    notes: 'Combo principal : Snake-Eye Ash → Flamberge → Diabellstar.',
  },
  {
    id: 'tenpai-dragon',
    name: 'Tenpai Dragon',
    description: 'OTK dragon ultra-rapide, win conditions à 8000+ ATK en un tour.',
    tier: 1,
    estWinrate: 56,
    archetypes: ['Tenpai Dragon'],
    staples: [...GENERIC_STAPLES],
    notes: 'Pousse Pot of Prosperity & Bonfire pour la consistance.',
  },
  {
    id: 'yubel',
    name: 'Yubel',
    description: 'Contrôle DARK avec résurrection automatique et grosse présence sur le terrain.',
    tier: 1,
    estWinrate: 55,
    archetypes: ['Yubel', 'Spirit Of'],
    staples: [...GENERIC_STAPLES],
  },
  {
    id: 'voiceless-voice',
    name: 'Voiceless Voice',
    description: 'Ritual & contrôle, gameplan régulier, fort en main 6.',
    tier: 2,
    estWinrate: 52,
    archetypes: ['Voiceless Voice'],
    staples: [...GENERIC_STAPLES],
  },
  {
    id: 'maliss',
    name: 'Maliss',
    description: 'Xyz-spam moderne, accès rapide à des rangs 4 puissants.',
    tier: 2,
    estWinrate: 51,
    archetypes: ['Maliss'],
    staples: [...GENERIC_STAPLES],
  },
  {
    id: 'centurion',
    name: 'Centurion (Centur-Ion)',
    description: 'Synchro consistant, gameplan résilient avec accès aux Baronnes.',
    tier: 2,
    estWinrate: 50,
    archetypes: ['Centur-Ion'],
    staples: [...GENERIC_STAPLES],
  },
  {
    id: 'sky-striker',
    name: 'Sky Striker',
    description: 'Contrôle de zone magie avec board-breakers, classique.',
    tier: 3,
    estWinrate: 48,
    archetypes: ['Sky Striker'],
    staples: [...GENERIC_STAPLES],
  },
  {
    id: 'branded-despia',
    name: 'Branded Despia',
    description: 'Fusion deck combo-control, gros corps + valeur de cartes.',
    tier: 2,
    estWinrate: 51,
    archetypes: ['Branded', 'Despia', 'Fallen of Albaz'],
    staples: [...GENERIC_STAPLES],
  },
  {
    id: 'ryzeal',
    name: 'Ryzeal',
    description: 'Xyz tempo deck, plays through interruption, strong grind game.',
    tier: 1,
    estWinrate: 57,
    archetypes: ['Ryzeal'],
    staples: [...GENERIC_STAPLES],
  },
  {
    id: 'fiendsmith',
    name: 'Fiendsmith Engine',
    description: 'Moteur d’engine purée dans n’importe quel deck DARK — Beatrice / S:P Little Knight chain.',
    tier: 2,
    estWinrate: 54,
    archetypes: ['Fiendsmith'],
    staples: [...GENERIC_STAPLES],
    notes: 'Souvent splashé dans Snake-Eye / Branded.',
  },
  {
    id: 'mulcharmy-stun',
    name: 'Mulcharmy Stun',
    description: 'Stun moderne avec hand-traps Mulcharmy + Rivalry / Skill Drain.',
    tier: 3,
    estWinrate: 47,
    archetypes: ['Mulcharmy'],
    staples: [
      'Skill Drain', 'There Can Be Only One', 'Rivalry of Warlords',
      'Ash Blossom & Joyous Spring', 'Maxx "C"', 'Effect Veiler'
    ],
  },
  {
    id: 'labrynth',
    name: 'Labrynth',
    description: 'Control trap-heavy, gameplan résilient et terrains punitifs.',
    tier: 2,
    estWinrate: 52,
    archetypes: ['Labrynth'],
    staples: [...GENERIC_STAPLES],
  },
  {
    id: 'kashtira',
    name: 'Kashtira',
    description: 'Floodgate-spam Xyz qui exile depuis le deck, lock board agressif.',
    tier: 3,
    estWinrate: 49,
    archetypes: ['Kashtira'],
    staples: [...GENERIC_STAPLES],
  },
  {
    id: 'runick-stun',
    name: 'Runick Stun',
    description: 'Mill-then-attrition, banlist resistant, contre les decks combo.',
    tier: 3,
    estWinrate: 46,
    archetypes: ['Runick'],
    staples: ['Skill Drain', 'There Can Be Only One', 'Maxx "C"', 'Ash Blossom & Joyous Spring'],
  },
  {
    id: 'memento',
    name: 'Memento',
    description: 'Synchro toolbox, gros corps DARK, gameplan grind.',
    tier: 3,
    estWinrate: 48,
    archetypes: ['Memento'],
    staples: [...GENERIC_STAPLES],
  },
]
