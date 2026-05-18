// Modal lifecycle: initialisation + open/close state predicates.
// Generic plumbing only — actual content rendering lives in card-detail.ts,
// edition-picker.ts and deck-popover.ts.

import { setDeps, deps, type ModalDeps } from './deps'
import { initDeckPopover } from './deck-popover'

export function initModal(d: ModalDeps): void {
  setDeps(d)
  d.modalEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).dataset.close !== undefined) d.modalEl.hidden = true
  })
  d.pickerEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).dataset.close !== undefined) d.pickerEl.hidden = true
  })
  initDeckPopover()
}

export function isModalOpen():  boolean { return !deps().modalEl.hidden }
export function closeModal():   void    { deps().modalEl.hidden  = true }
export function isPickerOpen(): boolean { return !deps().pickerEl.hidden }
export function closePicker():  void    { deps().pickerEl.hidden = true }
