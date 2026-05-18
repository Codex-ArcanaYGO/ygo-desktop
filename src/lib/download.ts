// Generic browser file download helpers — replaces 4× repeated Blob+anchor logic.

/** Trigger a download of `content` (string or Blob) as `filename`. */
export function downloadFile(
  content: string | Blob,
  filename: string,
  mime: string = 'text/plain;charset=utf-8',
): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Sanitize a deck/file name for filesystem-safe usage. */
export function safeFilename(name: string): string {
  return name.replace(/[^\w\-]+/g, '_')
}

/** Today's date as YYYY-MM-DD (for filename suffixes). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
