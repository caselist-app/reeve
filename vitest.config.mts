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
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
