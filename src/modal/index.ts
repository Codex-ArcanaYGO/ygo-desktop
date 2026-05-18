// Barrel re-exporting the public surface of the modal subsystem.
// Existing call sites import from './modal' or '../modal' — that path keeps
// resolving to this file thanks to Node/Vite directory-index resolution.

export type { ModalDeps } from './deps'
export { initModal, isModalOpen, closeModal, isPickerOpen, closePicker } from './lifecycle'
export { openModal } from './card-detail'
export { openEditionPicker } from './edition-picker'
export { showDeckPopover, hideDeckPopover } from './deck-popover'
