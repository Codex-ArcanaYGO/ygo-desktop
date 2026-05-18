// Client-side auth validators. Backend remains the source of truth
// (server validates again on submit); these helpers exist to give the
// user fast, in-form feedback before they hit "Submit".

export interface FieldCheck {
  ok: boolean
  /** When `ok === false`, a short user-facing reason. */
  reason?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/

export function checkEmail(value: string): FieldCheck {
  const v = value.trim()
  if (v.length === 0) return { ok: false, reason: 'Email requis' }
  if (!EMAIL_RE.test(v)) return { ok: false, reason: 'Format d\u2019email invalide' }
  return { ok: true }
}

export function checkUsername(value: string): FieldCheck {
  const v = value.trim()
  if (v.length === 0) return { ok: false, reason: 'Pseudo requis' }
  if (v.length < 3) return { ok: false, reason: '3 caract\u00e8res minimum' }
  if (v.length > 32) return { ok: false, reason: '32 caract\u00e8res maximum' }
  if (!USERNAME_RE.test(v)) return { ok: false, reason: 'Lettres, chiffres, _ - . uniquement' }
  return { ok: true }
}

export function checkPassword(value: string): FieldCheck {
  if (value.length === 0) return { ok: false, reason: 'Mot de passe requis' }
  if (value.length < 8) return { ok: false, reason: '8 caract\u00e8res minimum' }
  if (value.length > 256) return { ok: false, reason: 'Trop long' }
  return { ok: true }
}

export function checkPasswordMatch(pw: string, confirm: string): FieldCheck {
  if (confirm.length === 0) return { ok: false, reason: 'Confirme ton mot de passe' }
  if (pw !== confirm) return { ok: false, reason: 'Les mots de passe ne correspondent pas' }
  return { ok: true }
}

// ────────────────────────────────────────────────────────────────────────────
// Password strength estimate (0..4). Purely UI; do NOT use as a gate.
// We avoid pulling zxcvbn (~400 KB) — heuristic is good enough for a hint.

export type StrengthLevel = 0 | 1 | 2 | 3 | 4

export interface StrengthResult {
  level: StrengthLevel
  /** "Tr\u00e8s faible" | "Faible" | "Moyen" | "Bon" | "Fort" */
  label: string
}

const LABELS: Record<StrengthLevel, string> = {
  0: 'Tr\u00e8s faible',
  1: 'Faible',
  2: 'Moyen',
  3: 'Bon',
  4: 'Fort',
}

export function estimateStrength(pw: string): StrengthResult {
  if (pw.length === 0) return { level: 0, label: LABELS[0] }
  let score = 0
  if (pw.length >= 8) score += 1
  if (pw.length >= 12) score += 1
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1
  if (/\d/.test(pw)) score += 0.5
  if (/[^A-Za-z0-9]/.test(pw)) score += 0.5
  // Penalise low entropy (single repeated char, common short patterns)
  if (/^(.)\1+$/.test(pw)) score = Math.min(score, 1)
  if (/^(?:password|azerty|qwerty|123456|motdepasse)/i.test(pw)) score = Math.min(score, 1)
  const level = Math.max(0, Math.min(4, Math.floor(score))) as StrengthLevel
  return { level, label: LABELS[level] }
}

// ────────────────────────────────────────────────────────────────────────────
// Map backend error codes to friendly, localised messages.
// Codes come from the Rust backend (`AppError::code()`).

export function describeAuthError(status: number, code?: string, fallback?: string): string {
  if (status === 409 || code === 'conflict') {
    return 'Cet email ou ce pseudo est d\u00e9j\u00e0 utilis\u00e9.'
  }
  if (status === 401 || code === 'unauthorized') {
    return 'Identifiants incorrects.'
  }
  if (status === 429) {
    return 'Trop de tentatives. R\u00e9essaie dans quelques minutes.'
  }
  if (status === 400 && code === 'validation_failed') {
    return fallback || 'Les informations saisies ne sont pas valides.'
  }
  if (status === 0 || code === 'network') {
    return 'Probl\u00e8me r\u00e9seau. V\u00e9rifie ta connexion.'
  }
  if (status >= 500) {
    return 'Le serveur est momentan\u00e9ment indisponible. R\u00e9essaie.'
  }
  return fallback || 'Une erreur est survenue.'
}
