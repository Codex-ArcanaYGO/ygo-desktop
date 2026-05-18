// ─── Client-side telemetry — OpenTelemetry-aligned ────────────────────────────
//
// No collector: spans + metrics are kept in memory for the current page session.
// Naming follows OTel semantic conventions where applicable:
//   - Span names:   "<namespace>.<operation>"  (e.g. "ygo.api.search")
//   - Metric names: "<namespace>.<metric>"      (e.g. "ygo.api.request")
//   - Attributes:   OTel standard names or "ygo.*" namespace

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpanStatusCode = 'ok' | 'error' | 'unset'

/** Flat key→value bag — mirrors OTel Attributes spec. */
export type Attributes = Record<string, string | number | boolean>

export interface OtelSpan {
  readonly traceId:   string
  readonly spanId:    string
  readonly name:      string
  readonly startTime: number    // performance.now() at creation
  attributes:         Attributes
  status:             SpanStatusCode
  endTime?:           number    // performance.now() at end
  error?:             string
}

export interface HistogramSummary {
  count: number
  sum:   number
  min:   number
  max:   number
  avg:   number
  p50:   number
  p95:   number
}

export interface MetricsSummary {
  counters:   Array<{ name: string; value: number }>
  histograms: Array<{ name: string } & HistogramSummary>
  spans:      readonly OtelSpan[]
}

// ─── Internal stores ──────────────────────────────────────────────────────────

const MAX_SPANS  = 100
const MAX_POINTS = 500

const counters   = new Map<string, number>()
const histograms = new Map<string, number[]>()
const spansLog:   OtelSpan[] = []

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexId(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── Span API ─────────────────────────────────────────────────────────────────

/** Open a new span. Call {@link endSpan} when the operation finishes. */
export function startSpan(name: string, attributes: Attributes = {}): OtelSpan {
  return {
    traceId:    hexId(16),
    spanId:     hexId(8),
    name,
    startTime:  performance.now(),
    attributes: { ...attributes },
    status:     'unset',
  }
}

/**
 * Close a span and record its duration into the matching histogram
 * `<span.name>.duration`. Returns the wall-clock duration in milliseconds.
 */
export function endSpan(
  span: OtelSpan,
  opts: { error?: string; attributes?: Attributes } = {},
): number {
  span.endTime = performance.now()
  const durationMs = span.endTime - span.startTime
  if (opts.error) { span.error = opts.error; span.status = 'error' }
  else span.status = 'ok'
  if (opts.attributes) Object.assign(span.attributes, opts.attributes)
  span.attributes['duration_ms'] = Math.round(durationMs)

  spansLog.unshift(span)
  if (spansLog.length > MAX_SPANS) spansLog.length = MAX_SPANS

  recordHistogram(`${span.name}.duration`, durationMs)
  return durationMs
}

// ─── Counter API ──────────────────────────────────────────────────────────────

/** Increment a monotonic counter (OTel Counter instrument). */
export function recordCounter(name: string, delta = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + delta)
}

// ─── Histogram API ────────────────────────────────────────────────────────────

/** Record a single observation (OTel Histogram instrument). */
export function recordHistogram(name: string, value: number): void {
  const pts = histograms.get(name) ?? []
  pts.push(value)
  if (pts.length > MAX_POINTS) pts.shift()
  histograms.set(name, pts)
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

function buildHistoSummary(name: string): ({ name: string } & HistogramSummary) | null {
  const pts = histograms.get(name)
  if (!pts?.length) return null
  const sorted = [...pts].sort((a, b) => a - b)
  const sum = sorted.reduce((s, v) => s + v, 0)
  return {
    name,
    count: sorted.length,
    sum,
    min:   sorted[0],
    max:   sorted[sorted.length - 1],
    avg:   sum / sorted.length,
    p50:   pct(sorted, 50),
    p95:   pct(sorted, 95),
  }
}

export function getMetricsSummary(): MetricsSummary {
  return {
    counters: Array.from(counters.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    histograms: Array.from(histograms.keys())
      .map(buildHistoSummary)
      .filter((x): x is { name: string } & HistogramSummary => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    spans: spansLog,
  }
}

/** Wipe all in-memory telemetry data. */
export function clearMetrics(): void {
  counters.clear()
  histograms.clear()
  spansLog.length = 0
}
