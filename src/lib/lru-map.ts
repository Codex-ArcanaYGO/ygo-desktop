// Bounded LRU map (insertion-order based eviction).
// Extends Map so any code typed against `Map<K, V>` works unchanged.

export class LRUMap<K, V> extends Map<K, V> {
  constructor(private readonly maxSize: number, entries?: Iterable<readonly [K, V]>) {
    super()
    if (maxSize <= 0) throw new Error('LRUMap: maxSize must be positive')
    if (entries) for (const [k, v] of entries) this.set(k, v)
  }

  /** Get + bump to MRU. */
  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined
    const v = super.get(key)!
    super.delete(key)
    super.set(key, v)
    return v
  }

  /** Set + bump to MRU; evicts the least-recently-used entry when full. */
  override set(key: K, value: V): this {
    if (super.has(key)) super.delete(key)
    else if (super.size >= this.maxSize) {
      const oldest = super.keys().next().value
      if (oldest !== undefined) super.delete(oldest)
    }
    super.set(key, value)
    return this
  }
}
