// Tiny view router built on the viewSig signal — no URL involvement (Tauri app).
// Centralises the side-effects of a view switch (e.g. lazy-load archetypes when
// the archetypes tab is opened for the first time).

import { viewSig, type ViewName } from './state'
import { appLog } from '../logger'

type ViewSwitchHook = (next: ViewName) => void | Promise<void>
const _hooks: ViewSwitchHook[] = []

export function onViewSwitch(hook: ViewSwitchHook): void {
  _hooks.push(hook)
}

export function setView(name: ViewName): void {
  if (viewSig.value === name) return
  viewSig.value = name
  for (const h of _hooks) {
    try { void h(name) }
    catch (err) { appLog('warn', `router: hook failed for view « ${name} »`, String(err)) }
  }
}
