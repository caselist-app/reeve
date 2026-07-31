import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  // Default runtime (Node 21.7.3) has no native WebSocket support, which
  // makes @supabase/supabase-js's realtime client throw on construction -
  // hit via createAdminClient() in every job. Node 22 has native WebSocket,
  // no new dependency needed.
  runtime: 'node-22',
  project: 'proj_qowzmtredmxbwikcbedr',
  dirs: ['./trigger/jobs'],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
})
