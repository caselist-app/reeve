import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  // TRIGGER_PROJECT_ID is set in Vercel and .env.local after linking your
  // Trigger.dev project. Find it in your project settings on trigger.dev.
  project: process.env.TRIGGER_PROJECT_ID ?? 'reeve',
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
