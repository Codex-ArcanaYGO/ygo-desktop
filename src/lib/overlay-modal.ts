// Lightweight factory for overlay-style modals. Replaces hand-rolled
// overlay divs in deck-wishlist-modal, ydk-import, etc.
//
// Usage:
//   const m = createOverlayModal({ id: 'foo', maxWidth: 560 })
//   m.setContent(`<h2>...</h2>`)
//   m.open()
//   m.close()
//
// The factory ensures: single instance per id, backdrop click / Esc /
// modal-close button all close, and re-opening reuses the same element.

export interface OverlayModalOptions {
  /** DOM id of the overlay container. Used for re-use & lookup. */
  id: string
  /** Optional inline max-width for the content panel. */
  maxWidth?: number | string
  /** Called when the modal is closed (any path). */
  onClose?: () => void
  /** Extra className(s) for the .modal-content panel. */
  contentClass?: string
}

export interface OverlayModalHandle {
  overlay: HTMLDivElement
  content: HTMLDivElement
  setContent: (html: string) => void
  open: () => void
  close: () => void
  /** Replace overlay HTML entirely. Use sparingly. */
  setRawHTML: (html: string) => void
}

const CLOSE_ATTR = 'data-overlay-close'

export function createOverlayModal(opts: OverlayModalOptions): OverlayModalHandle {
  let overlay = document.getElementById(opts.id) as HTMLDivElement | null
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = opts.id
    overlay.className = 'modal'
    overlay.hidden = true
    document.body.appendChild(overlay)
  }

  const close = (): void => {
    if (overlay!.hidden) return
    overlay!.hidden = true
    opts.onClose?.()
  }

  const ensureSkeleton = (): void => {
    if (overlay!.querySelector('[data-overlay-content]')) return
    const style = opts.maxWidth != null
      ? ` style="max-width:${typeof opts.maxWidth === 'number' ? `${opts.maxWidth}px` : opts.maxWidth}"`
      : ''
    overlay!.innerHTML = `
      <div class="modal-backdrop" ${CLOSE_ATTR}></div>
      <div class="modal-content ${opts.contentClass ?? ''}"${style} role="dialog" aria-modal="true">
        <button class="modal-close" ${CLOSE_ATTR} aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
        <div data-overlay-content></div>
      </div>`
    overlay!.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest(`[${CLOSE_ATTR}]`)) close()
    })
  }

  ensureSkeleton()

  const setContent = (html: string): void => {
    ensureSkeleton()
    const c = overlay!.querySelector<HTMLDivElement>('[data-overlay-content]')!
    c.innerHTML = html
  }

  const setRawHTML = (html: string): void => { overlay!.innerHTML = html }

  const open = (): void => { overlay!.hidden = false }

  return {
    overlay,
    get content(): HTMLDivElement {
      ensureSkeleton()
      return overlay!.querySelector<HTMLDivElement>('[data-overlay-content]')!
    },
    setContent, setRawHTML, open, close,
  }
}
