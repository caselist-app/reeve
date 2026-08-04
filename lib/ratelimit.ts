import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/redis'

// Per-number sliding window: 20 free-text WhatsApp messages per hour.
// Prevents a single crew member (or a forged webhook) from running up
// Claude spend against the $5/tour/month cost target.
export const whatsappAiRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  prefix: 'rl:wa_ai',
})

// Per-chat sliding window: 20 free-text Telegram messages per hour.
// Same limit and reasoning as whatsappAiRatelimit, separate prefix so the two
// channels don't share a bucket for a contact linked on both.
export const telegramAiRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  prefix: 'rl:tg_ai',
})

// Per-email sliding window: 5 OTP requests per 10 minutes.
// Prevents enumeration and abuse of the magic-link endpoint.
export const otpRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  prefix: 'rl:otp',
})

// Guarded wrapper for the crew-facing AI limiters. Use this in the routers,
// never limiter.limit() directly.
//
// The limiter throws when Redis is unreachable, and an unguarded call takes the
// whole path down with it. On 2026-08-04 a missing UPSTASH_REDIS_REST_URL in the
// Trigger.dev environment made every free-text crew question fail with
// "Failed to parse URL from /pipeline", while every other Redis call in the same
// job degraded quietly because those are wrapped. This is that inconsistency
// resolved in favour of the behaviour the rest of the file already has.
//
// Fails open, deliberately. These limiters are a cost control against the
// per-tour Claude spend target, not a security boundary. Answering a crew
// question unmetered during a Redis outage is better than answering none of
// them, and it matches the "dropping an inbound message is worse than a
// duplicate" trade-off the idempotency claims already make.
//
// Do not use this for otpRatelimit. That one is a security control against
// enumeration of the magic-link endpoint, so it must keep failing loudly rather
// than waving requests through.
export async function withinAiRateLimit(
  limiter: Ratelimit,
  key: string
): Promise<boolean> {
  try {
    const { success } = await limiter.limit(key)
    return success
  } catch (err) {
    console.error('[ratelimit] AI limiter unavailable, allowing request:', err)
    return true
  }
}
