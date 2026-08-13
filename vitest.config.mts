import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests. Pure functions only: no database, no Docker, no network. These
// are the ones that run on Matt's machine with `pnpm test`, so they have to
// work with nothing installed beyond pnpm itself.
//
// Anything needing a real Postgres lives in tests/integration and runs in CI
// only, via vitest.integration.config.ts. See tests/README.md.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  // tsconfig.json sets "jsx": "preserve" for Next's own compiler, and Vite's
  // esbuild transform inherits that by default, so a .tsx module imported
  // for its non-component exports (a pure reducer sitting next to a 'use
  // client' component, per COMPONENTS.md's no-render-testing rule) would
  // otherwise fail to parse. Override just for esbuild's own transform.
  oxc: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
