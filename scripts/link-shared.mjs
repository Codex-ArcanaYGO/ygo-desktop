#!/usr/bin/env node
// Ensure ./ygo-shared/node_modules → this app's node_modules so the shared
// TypeScript sources can resolve `preact`, `vitest`, etc. when typechecked
// by `tsc` (which walks up from each file).
//
// Run by the app's postinstall script. Idempotent. Works with ygo-shared
// as a git submodule.

import { existsSync, lstatSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here   = dirname(fileURLToPath(import.meta.url))
const appNodeModules = resolve(here, '..', 'node_modules')
const sharedDir = resolve(here, '..', 'ygo-shared')
const sharedNodeModules = resolve(sharedDir, 'node_modules')

if (!existsSync(sharedDir)) {
  // ygo-shared may not be checked out yet; nothing to do.
  process.exit(0)
}

if (!existsSync(appNodeModules)) {
  // Should not happen during postinstall, but be defensive.
  process.exit(0)
}

// If a real directory already exists at the target, leave it alone (don't
// destroy real installs).
if (existsSync(sharedNodeModules)) {
  try {
    const stat = lstatSync(sharedNodeModules)
    if (!stat.isSymbolicLink()) {
      console.warn('[link-shared] ygo-shared/node_modules exists and is not a symlink; leaving it alone.')
      process.exit(0)
    }
    unlinkSync(sharedNodeModules)
  } catch {
    // ignore
  }
}

const target = relative(sharedDir, appNodeModules)
try {
  symlinkSync(target, sharedNodeModules, 'dir')
  console.log(`[link-shared] linked ygo-shared/node_modules → ${target}`)
} catch (err) {
  console.warn(`[link-shared] could not create symlink: ${err.message}`)
}
