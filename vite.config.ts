import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { fileURLToPath } from 'node:url'

const sharedRoot = fileURLToPath(new URL('./ygo-shared', import.meta.url))

export default defineConfig({
  clearScreen: false,
  plugins: [preact()],
  resolve: {
    // Prefer TypeScript source files over compiled .js siblings.
    // Without this, Vite resolves .js before .ts (default Vite order), so
    // stale tsc-compiled .js files in src/ shadow our .ts edits in dev mode.
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    // Force a single Preact instance even when @shared/* imports traverse the
    // ygo-shared/node_modules symlink (which may point to another app's dir).
    dedupe: ['preact', 'preact/hooks', '@preact/signals'],
    alias: {
      // The shared source lives in a sibling directory `ygo-shared/`.
      // `@shared/<subpath>` resolves to `ygo-shared/src/<subpath>`.
      '@shared/': `${sharedRoot}/src/`,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
    fs: {
      // Allow Vite's dev server to serve files from the sibling shared dir.
      allow: ['..'],
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    // Proxy /api → local backend so cookies and same-origin work in dev.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: ['es2021', 'chrome100', 'safari15'],
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: 'dist',
  },
  css: {
    modules: {
      generateScopedName: '[name]_[local]__[hash:base64:5]',
      localsConvention: 'camelCaseOnly',
    },
  },
  // @ts-expect-error — vitest extends the Vite config at runtime
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: [
      './test/**/*.test.ts',
      './test/**/*.test.tsx',
    ],
  },
})
