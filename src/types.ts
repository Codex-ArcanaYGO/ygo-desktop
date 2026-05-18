// ─── API types ────────────────────────────────────────────────────────────────

export interface YGOCardImage {
  id: number
  image_url: string
  image_url_small: string
}

export interface YGOCardSet {
  set_name: string
  set_code: string
  set_rarity: string
  set_rarity_code: string
  set_price?: string
}

export interface YGOCardPrice {
  cardmarket_price: string
  tcgplayer_price: string
}

export interface YGOCard {
  id: number
  name: string
  type: string
  desc: string
  race?: string
  attribute?: string
  atk?: number
  def?: number
  level?: number
  archetype?: string
  card_images: YGOCardImage[]
  card_sets?: YGOCardSet[]
  card_prices?: YGOCardPrice[]
}

// ─── Domain types ─────────────────────────────────────────────────────────────

/** One owned edition of a card (e.g. "MP25-FR207, Common, qty 2") */
export interface OwnedEdition {
  setCode: string       // FR code preferred (e.g. "MP25-FR207") — fallback to EN code
  setName: string
  rarity: string
  qty: number
}

/** A card as stored in the collection (localStorage). */
export interface CollectionCard {
  id: number            // Konami password ID (e.g. 93683815)
  name: string          // French name (or EN if no FR translation)
  nameEn: string        // English name (for Cardmarket URL slug)
  type: string
  desc: string
  race?: string
  attribute?: string
  atk?: number
  def?: number
  level?: number
  image: string
  imageSmall: string
  /** Editions owned, with quantity per edition. Total qty = sum of editions[].qty */
  editions: OwnedEdition[]
  addedAt: number
  liked?: boolean
  deck?: string
  /** All printings filtered to FR region codes (e.g. MP25-FR400) — catalog of available editions */
  frSets?: YGOCardSet[]
  /** All printings (EN codes) as fallback */
  allSets?: YGOCardSet[]
  /** Cardmarket average price in EUR */
  cardmarketPrice?: string
  /** English description (from EN API) */
  descEn?: string
  /** Archetype name (canonical EN, from YGOPRODeck) */
  archetype?: string
}

/** A card the user wants to acquire. Lighter than CollectionCard — no per-edition tracking. */
export interface WishlistCard {
  id: number
  name: string
  nameEn?: string
  type?: string
  desc?: string
  descEn?: string
  race?: string
  attribute?: string
  atk?: number
  def?: number
  level?: number
  image: string
  imageSmall: string
  /** How many copies the user wants to acquire */
  wantedQty: number
  /** Optional preferred edition (set code) */
  targetSetCode?: string
  addedAt: number
  frSets?: YGOCardSet[]
  allSets?: YGOCardSet[]
  cardmarketPrice?: string
}

/** Full deck build (Main / Extra / Side) — IDs may reference cards not in the collection. */
export interface DeckBuild {
  id: string
  name: string
  main: number[]
  extra: number[]
  side: number[]
  createdAt: number
  updatedAt: number
}

export type Theme = 'light' | 'dark' | 'system'
export type SortKey = 'recent' | 'name' | 'name-desc' | 'type' | 'qty' | 'qty-asc' | 'price-unit' | 'price-total'
export type ArchetypeSortKey = 'name' | 'name-desc' | 'cards' | 'cards-asc' | 'progress' | 'progress-asc'
export type LangPref = 'fr' | 'en'
export type View = 'collection' | 'wishlist' | 'decks' | 'archetypes'
/** OTel severity levels (subset): numbers follow the OTel Log spec. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  ts:              number
  lvl:             LogLevel
  /** OTel severity number: DEBUG=5, INFO=9, WARN=13, ERROR=17, FATAL=21 */
  severityNumber?: number
  msg:             string
  data?:           string
  attributes?:     Record<string, string | number | boolean>
  spanId?:         string
  traceId?:        string
}

export interface HistoryEntry {
  id: number
  label: string
  timestamp: number
  /** Deep snapshot of the affected card before the action, null = card was added (undo = delete) */
  snapshot: CollectionCard | null
}
