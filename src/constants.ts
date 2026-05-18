// ─── API endpoint ─────────────────────────────────────────────────────────────

export const API_BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

// ─── localStorage keys ────────────────────────────────────────────────────────

export const STORAGE_KEY        = 'ygo_collection_v1'
export const WISHLIST_KEY       = 'ygo_wishlist_v1'
export const DECKS_KEY          = 'ygo_decks_v1'
export const DECK_BUILDS_KEY    = 'ygo_deckbuilds_v1'
export const CARD_CACHE_KEY     = 'ygo_card_cache_v1'
export const THEME_KEY          = 'ygo_theme'
export const LANG_KEY           = 'ygo_lang'
export const PIN_KEY            = 'ygo_pin_prefix'
export const LOGS_KEY           = 'ygo_logs_v1'
export const SEARCH_HISTORY_KEY = 'ygo_search_history_v1'
export const VIEW_KEY           = 'ygo_view'
export const SUGG_HISTORY_KEY   = 'ygo_sugg_history_v1'

// Number of suggestion cards displayed simultaneously in the banner.
export const SUGGESTIONS_VISIBLE = 8

// ─── Limits & timings ─────────────────────────────────────────────────────────

export const DEBOUNCE_MS        = 250
export const SUGGESTION_LIMIT   = 10
export const LOGS_MAX           = 500
export const SEARCH_HISTORY_MAX = 50
export const HISTORY_MAX        = 20
export const ACTION_HISTORY_KEY = 'ygo_action_history_session'

/** Max number of YGOCard entries kept in `cardCache` (LRU eviction). */
export const CARD_CACHE_MAX     = 2000

// ─── Sentinel values ──────────────────────────────────────────────────────────

/** Placeholder set code for cards added without a known edition. */
export const UNKNOWN_EDITION_CODE = '???'

// ─── Regex patterns ───────────────────────────────────────────────────────────

/** Full set codes: MP25-FR207, INFO-EN082, L26D-FRS33, MP25-FREN030, etc. */
export const SET_CODE_RE       = /^([A-Z0-9]{3,6})-([A-Z]{1,2})([A-Z]*\d+[A-Z]*)$/i
/** Short codes without language: MP25-207, L26D-S33 */
export const SET_CODE_SHORT_RE = /^([A-Z0-9]{3,6})-([A-Z]*\d+[A-Z]*)$/i
