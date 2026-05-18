// Focus trap for modals: keeps Tab navigation inside `containerRef`.
// Also restores focus to the previously focused element on unmount.
//
// Usage:
//   const ref = useRef<HTMLDivElement>(null)
//   useFocusTrap(ref, open)
//   ...
//   <div ref={ref}>...modal content...</div>

import { useEffect } from 'preact/hooks'
import type { RefObject } from 'preact'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap(
  containerRef: RefObject<HTMLElement>,
  active: boolean,
  options?: { autoFocusSelector?: string },
) {
  useEffect(() => {
    if (!active) return
    const root = containerRef.current
    if (!root) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Autofocus the first matching element (or first focusable if not specified).
    const focusFirst = () => {
      const sel = options?.autoFocusSelector
      const target = sel
        ? (root.querySelector<HTMLElement>(sel) ?? root.querySelector<HTMLElement>(FOCUSABLE))
        : root.querySelector<HTMLElement>(FOCUSABLE)
      target?.focus()
    }
    // Defer so the element is mounted and visible.
    const timer = setTimeout(focusFirst, 0)

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(n => !n.hasAttribute('disabled') && n.offsetParent !== null)
      if (nodes.length === 0) return
      const first = nodes[0]!
      const last  = nodes[nodes.length - 1]!
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    root.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      root.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [active, containerRef, options?.autoFocusSelector])
}
