// Throttled parallel map. Used to bound concurrent fetchById calls.

/**
 * Apply `fn` to each item with at most `concurrency` in flight.
 * Preserves input order in the resulting array.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 6,
): Promise<R[]> {
  if (concurrency <= 0) throw new Error('concurrency must be positive')
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker)
  await Promise.all(workers)
  return out
}
