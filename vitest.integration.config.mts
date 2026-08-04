import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Integration tests. These run against a real Supabase (real Postgres, real
// PostgREST, real migrations), because every bug this layer exists to catch is
// an integration bug: a partial payload hitting a real update, or PostgREST
// embed semantics that no mock reproduces.
//
// They need Docker, so they run in CI only. See tests/README.md for why that
// split exists and how to read a failure.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    // One file at a time against one database. These tests write real rows,
    // and a parallel run would have them stepping on each other in ways that
    // look like product bugs rather than test bugs.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
