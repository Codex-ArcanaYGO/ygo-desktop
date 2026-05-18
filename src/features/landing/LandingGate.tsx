import { useState } from 'preact/hooks'

import { isTauri } from '../../lib/platform'
import { LandingPage, landingDismissed } from './LandingPage'

/**
 * Wrapper that decides whether to show the landing page.
 *
 * Hidden when:
 *   • running inside the Tauri desktop shell
 *   • the user already dismissed it in a previous visit
 */
export function LandingGate() {
  const initiallyVisible = !isTauri() && !landingDismissed()
  const [visible, setVisible] = useState(initiallyVisible)
  if (!visible) return null
  return <LandingPage onEnter={() => setVisible(false)} />
}
