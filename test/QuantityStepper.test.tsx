// Vitest tests for the QuantityStepper primitive.
//
// We focus on the stepper mode (the slider relies heavily on layout,
// pointer events and backdrop-filter, which are not meaningfully
// exercised by jsdom). The stepper mode covers the most common
// "click +/-" UX for cards and is fully deterministic.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/preact'
import { QuantityStepper } from '@shared/ui/QuantityStepper/QuantityStepper'

describe('QuantityStepper (stepper mode)', () => {
  afterEachCleanup()

  it('renders current value and +/- buttons', () => {
    render(<QuantityStepper value={3} onChange={() => {}} />)
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByLabelText('Ajouter un exemplaire')).toBeTruthy()
    expect(screen.getByLabelText('Retirer un exemplaire')).toBeTruthy()
  })

  it('emits +1 when "+" is pressed', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={2} onChange={onChange} />)
    fireEvent.pointerDown(screen.getByLabelText('Ajouter un exemplaire'))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('emits -1 when "−" is pressed', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={5} onChange={onChange} />)
    fireEvent.pointerDown(screen.getByLabelText('Retirer un exemplaire'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('clamps to min and disables "−" at the floor', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={0} min={0} onChange={onChange} />)
    const decr = screen.getByLabelText('Retirer un exemplaire') as HTMLButtonElement
    expect(decr.disabled).toBe(true)
    fireEvent.pointerDown(decr)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps to max and disables "+" at the ceiling', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={3} max={3} onChange={onChange} />)
    const incr = screen.getByLabelText('Ajouter un exemplaire') as HTMLButtonElement
    expect(incr.disabled).toBe(true)
    fireEvent.pointerDown(incr)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('honours `disabled` and ignores presses', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={1} disabled onChange={onChange} />)
    fireEvent.pointerDown(screen.getByLabelText('Ajouter un exemplaire'))
    fireEvent.pointerDown(screen.getByLabelText('Retirer un exemplaire'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps an out-of-range value when rendering', () => {
    render(<QuantityStepper value={99} max={5} onChange={() => {}} />)
    expect(screen.getByText('5')).toBeTruthy()
  })
})

// Wrapper to keep afterEach typing simple regardless of test runner globals.
function afterEachCleanup() {
  // Vitest's globals are exposed; we rely on the same cleanup pattern as
  // the other component tests in this repo.
  if (typeof afterEach === 'function') afterEach(() => cleanup())
}
