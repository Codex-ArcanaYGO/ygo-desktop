// Small helper to render the ban-status badge as HTML or as a Preact node.
// Centralizes the markup so badge appearance stays consistent everywhere.

import { getBanStatus, type BanStatus } from './banlist'

function classFor(status: BanStatus): string {
  if (status === 'Banned')        return 'ban-banned'
  if (status === 'Limited')       return 'ban-limited'
  return 'ban-semi-limited'
}

function titleFor(status: BanStatus): string {
  if (status === 'Banned')        return 'Interdite (TCG) — 0 exemplaire autorisé'
  if (status === 'Limited')       return 'Limitée (TCG) — 1 exemplaire max'
  return 'Semi-limitée (TCG) — 2 exemplaires max'
}

/**
 * Returns an HTML fragment (suitable for `innerHTML` templates) for the
 * banlist badge corresponding to a card id, or '' if the card is unrestricted.
 *
 *     <div class="card-img-wrap">${banBadgeHtml(id)}<img …/></div>
 */
export function banBadgeHtml(cardId: number, size: 'sm' | 'md' | 'lg' = 'md'): string {
  const status = getBanStatus(cardId)
  if (!status) return ''
  const sizeCls = size === 'sm' ? ' ban-badge-sm' : size === 'lg' ? ' ban-badge-lg' : ''
  return `<span class="ban-badge ${classFor(status)}${sizeCls}" title="${titleFor(status)}" aria-label="${titleFor(status)}"></span>`
}

/** Returns a label like "Interdite", "Limitée", "Semi-limitée" for human-readable output. */
export function banStatusLabel(status: BanStatus): string {
  if (status === 'Banned')  return 'Interdite'
  if (status === 'Limited') return 'Limitée'
  return 'Semi-limitée'
}

/** CSS class for inline status pill (used in deck warnings, etc.). */
export function banStatusClass(status: BanStatus): string {
  return classFor(status)
}
