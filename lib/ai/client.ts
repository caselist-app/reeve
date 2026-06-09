import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Model selection follows the cost model from the brief:
// Haiku for simple crew lookups (zero context synthesis needed).
// Sonnet for extraction and queries that need reasoning across records.
// Update slugs here when a new model generation releases.
export const MODELS = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-5',
} as const

export type ModelName = (typeof MODELS)[keyof typeof MODELS]
