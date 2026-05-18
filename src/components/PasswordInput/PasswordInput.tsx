// Accessible password input with:
// - show/hide toggle
// - Caps Lock indicator (cross-browser)
// - optional strength gauge
// - native autoComplete handling for password managers

import { useId, useState } from 'preact/hooks'
import { estimateStrength } from '../../lib/auth-validators'
import styles from './PasswordInput.module.css'

interface Props {
  value: string
  onInput(v: string): void
  /** Label text shown above the input. */
  label: string
  /** Visible error / helper text shown beneath the input. */
  error?: string | null
  /** Show the strength gauge (recommended for register/new password). */
  showStrength?: boolean
  /** Native autocomplete hint for the browser / password manager. */
  autoComplete?: 'current-password' | 'new-password'
  /** Native autofocus. */
  autoFocus?: boolean
  /** Native required hint (for HTML form semantics). */
  required?: boolean
  /** Forwarded to the input. */
  minLength?: number
  /** Forwarded to the input. */
  name?: string
  /** Disabled state. */
  disabled?: boolean
}

export function PasswordInput({
  value,
  onInput,
  label,
  error,
  showStrength,
  autoComplete = 'current-password',
  autoFocus,
  required,
  minLength,
  name,
  disabled,
}: Props) {
  const [revealed, setRevealed] = useState(false)
  const [capsOn, setCapsOn] = useState(false)
  const id = useId()
  const helperId = `${id}-help`
  const strength = showStrength ? estimateStrength(value) : null

  const updateCaps = (e: KeyboardEvent) => {
    // getModifierState is supported in every modern browser including Safari.
    if (typeof e.getModifierState === 'function') {
      setCapsOn(e.getModifierState('CapsLock'))
    }
  }

  return (
    <div class={styles.wrapper}>
      <label class={styles.label} for={id}>{label}</label>
      <div class={`${styles.inputRow} ${error ? styles.invalid : ''}`}>
        <input
          id={id}
          name={name}
          class={styles.input}
          type={revealed ? 'text' : 'password'}
          value={value}
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
          onKeyDown={updateCaps}
          onKeyUp={updateCaps}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          minLength={minLength}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={(error || capsOn) ? helperId : undefined}
        />
        <button
          type="button"
          class={styles.toggle}
          onClick={() => setRevealed(v => !v)}
          aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={revealed}
          tabIndex={-1}
        >
          {revealed ? '🙈' : '👁'}
        </button>
      </div>

      {capsOn && !disabled && (
        <p class={styles.caps} role="status">⚠ Verr. Maj. activé</p>
      )}

      {strength && value.length > 0 && (
        <div class={styles.strength} aria-hidden="true">
          <div class={styles.strengthTrack}>
            <div
              class={styles.strengthBar}
              data-level={strength.level}
              style={{ width: `${(strength.level / 4) * 100}%` }}
            />
          </div>
          <span class={styles.strengthLabel} data-level={strength.level}>{strength.label}</span>
        </div>
      )}

      {error && <p id={helperId} class={styles.error}>{error}</p>}
    </div>
  )
}
