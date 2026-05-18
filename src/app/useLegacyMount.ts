// useEffect-style hook to mount a vanilla DOM-mutating function inside a Preact
// component. Used during the migration to host legacy view renderers without
// rewriting them in one shot.

import { useEffect, useRef } from 'preact/hooks'
import { appLog } from '../logger'

export type LegacyMount = (host: HTMLElement) => void | (() => void)

/**
 * Mount a legacy renderer into the returned element ref.
 * If the renderer returns a cleanup, it's called on unmount.
 */
export function useLegacyMount(mount: LegacyMount): { ref: (el: HTMLElement | null) => void } {
  const cleanupRef = useRef<(() => void) | void>(undefined)
  const elRef      = useRef<HTMLElement | null>(null)

  useEffect(() => () => {
    try { cleanupRef.current?.() }
    catch (err) { appLog('warn', 'useLegacyMount: cleanup failed (unmount)', String(err)) }
  }, [])

  return {
    ref: (el) => {
      if (el === elRef.current) return
      try { cleanupRef.current?.() }
      catch (err) { appLog('warn', 'useLegacyMount: cleanup failed (re-mount)', String(err)) }
      elRef.current = el
      if (el) cleanupRef.current = mount(el) ?? undefined
    },
  }
}
