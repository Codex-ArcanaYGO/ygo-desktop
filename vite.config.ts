import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  clearScreen: false,
  plugins: [preact()],
  resolve: {
    // Prefer TypeScript source files over compiled .js siblings.
    // Without this, Vite resolves .js before .ts (default Vite order), so
    // stale tsc-compiled .js files in src/ shadow our .ts edits in dev mode.
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
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
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
