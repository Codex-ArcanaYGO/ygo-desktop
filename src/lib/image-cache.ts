/**
 * Offline-first image cache backed by the browser CacheStorage API.
 *
 * Works in Tauri WebView (WKWebView on macOS) without a Service Worker.
 * Images are fetched once, stored as opaque responses in a named cache, then
 * exposed as blob: object URLs so <img> elements display even when offline.
 *
 * Object URLs are never revoked during the session — this is a desktop app
 * that does not navigate away, so accumulation is negligible in practice.
 */

import { useEffect, useState } from 'preact/hooks'
import { appLog } from '../logger'
import { isTauri } from './platform'

const CACHE_NAME = 'ygo-images-v1'

/**
 * Browser dev/prod (non-Tauri) cannot fetch + read YGOPRODeck images because
 * the CDN does not set CORS headers. Issuing `fetch(url)` floods the console
 * with `Access-Control-Allow-Origin` errors and yields nothing usable for a
 * blob URL. In that environment we therefore short-circuit the cache layer
 * and let the browser's native HTTP cache serve `<img src>` requests — there
 * is no CORS check on plain `<img>` loads.
 *
 * The full blob-URL caching path remains active inside the Tauri WebView,
 * where requests originate from the `tauri://` scheme and CORS does not
 * apply, so true offline operation continues to work in the desktop app.
 */
const ENABLE_CACHE = isTauri()

/** Original URL → blob object URL. Accumulated for the lifetime of the page. */
const _objectUrls = new Map<string, string>()
/** Deduplicates concurrent preload requests for the same URL. */
const _inflight   = new Map<string, Promise<string | null>>()

// ─── Synchronous read ─────────────────────────────────────────────────────────

/**
 * Returns the cached blob: URL for a given image source, or null if the image
 * has not been downloaded into CacheStorage yet this session.
 */
export function getCachedObjectUrl(url: string): string | null {
  return _objectUrls.get(url) ?? null
}

// ─── Async preloading ─────────────────────────────────────────────────────────

async function _fetchAndCache(url: string): Promise<string | null> {
  if (!ENABLE_CACHE) return null                   // CORS-restricted env (browser)
  if (typeof caches === 'undefined') return null   // CacheStorage unavailable
  try {
    const cache    = await caches.open(CACHE_NAME)
    let   response = await cache.match(url)
    if (!response) {
      const fresh = await fetch(url)
      if (!fresh.ok) return null
      await cache.put(url, fresh.clone())
      response = fresh
    }
    const blob      = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    _objectUrls.set(url, objectUrl)
    return objectUrl
  } catch (err) {
    // Network error or storage quota — degrade gracefully but record it.
    appLog('warn', `imageCache: fetch/cache failed`, { url, error: String(err) })
    return null
  }
}

/**
 * Ensures an image URL is cached locally and returns the blob: URL.
 * Concurrent calls for the same URL share the same in-flight promise.
 */
export function preloadImage(url: string): Promise<string | null> {
  if (!url) return Promise.resolve(null)
  const cached   = _objectUrls.get(url)
  if (cached)    return Promise.resolve(cached)
  const inflight = _inflight.get(url)
  if (inflight)  return inflight
  const p = _fetchAndCache(url).finally(() => _inflight.delete(url))
  _inflight.set(url, p)
  return p
}

/**
 * Fire-and-forget batch preload (e.g. all card thumbnails for an archetype).
 * Silently skips URLs that are already cached or in-flight.
 */
export function preloadImages(urls: readonly string[]): void {
  for (const url of urls) {
    if (url && !_objectUrls.has(url) && !_inflight.has(url)) preloadImage(url)
  }
}

// ─── Preact hook ─────────────────────────────────────────────────────────────

/**
 * Returns the best available src for an image:
 *  • blob: URL from CacheStorage once it's cached (works offline)
 *  • original URL immediately as fallback while caching (works online)
 *  • null if url is falsy
 *
 * Side-effect: triggers caching if not already done.
 */
export function useOfflineImage(url: string | null | undefined): string | null {
  // Initialise synchronously to avoid an unnecessary extra render when the
  // object URL is already available (e.g. after a sort-triggered remount).
  const [src, setSrc] = useState<string | null>(
    url ? (_objectUrls.get(url) ?? url) : null,
  )

  useEffect(() => {
    if (!url) { setSrc(null); return }

    const cached = _objectUrls.get(url)
    if (cached) { setSrc(cached); return }

    // Show original URL immediately so the image loads online while we cache it.
    setSrc(url)
    preloadImage(url).then((objectUrl) => {
      if (objectUrl) setSrc(objectUrl)
    })
  }, [url])

  return src
}
