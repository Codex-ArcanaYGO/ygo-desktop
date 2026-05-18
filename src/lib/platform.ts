// Detect whether we're running inside the Tauri desktop shell, and which OS.

declare global {
  interface Window {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
  }
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.__TAURI__ ?? window.__TAURI_INTERNALS__)
}

export type DesktopOS = 'macos' | 'windows' | 'linux' | 'unknown'

export function detectOS(): DesktopOS {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  if (/mac|iphone|ipad|ipod/.test(platform) || /mac os x/.test(ua)) return 'macos'
  if (/win/.test(platform) || /windows/.test(ua)) return 'windows'
  if (/linux|x11/.test(platform) || /linux/.test(ua)) return 'linux'
  return 'unknown'
}
