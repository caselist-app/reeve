import Anthropic from '@anthropic-ai/sdk'

// Lazily constructed: the SDK throws immediately if the key is missing, and
// a module-level instantiation runs at import time, including during Next.js's
// build-time page data collection where no request (and no real env) is
// present. Deferring to first use keeps a build green without a real key.
let anthropicClient: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropicClient
}

// Model selection follows the cost model from the brief:
// Haiku for simple crew lookups (zero context synthesis needed).
// Sonnet for extraction and queries that need reasoning across records.
// Update slugs here when a new model generation releases.
export const MODELS = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-5',
} as const

export type ModelName = (typeof MODELS)[keyof typeof MODELS]
