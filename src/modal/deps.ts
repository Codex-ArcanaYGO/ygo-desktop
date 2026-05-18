// Shared dependency injection for the modal subsystem.
//
// All modal entry points (`openModal`, `openEditionPicker`, `showDeckPopover`)
// read DOM elements + state getters from this `deps` reference, which is
// populated once by `initModal` in `./lifecycle`.

import type { CollectionCard, LangPref } from '../types'

export interface ModalDeps {
  getCollection: () => CollectionCard[]
  getDecks: () => string[]
  saveCollection: () => void
  langPref: () => LangPref
  modalEl: HTMLDivElement
  modalBody: HTMLDivElement
  pickerEl: HTMLDivElement
  pickerBody: HTMLDivElement
  deckPopoverEl: HTMLDivElement
  deckListEl: HTMLUListElement
  deckNameInput: HTMLInputElement
  deckCreateBtn: HTMLButtonElement
  /** Switch to archetypes view + open the modal for the given archetype name. */
  openArchetype: (name: string) => void
}

let _deps: ModalDeps | null = null

export function setDeps(d: ModalDeps): void { _deps = d }
export function deps(): ModalDeps {
  if (!_deps) throw new Error('Modal subsystem not initialised — call initModal() first.')
  return _deps
}

export function displayName(c: CollectionCard): string {
  return deps().langPref() === 'en' && c.nameEn ? c.nameEn : c.name
}
