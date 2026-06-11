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

// Per-email sliding window: 5 OTP requests per 10 minutes.
// Prevents enumeration and abuse of the magic-link endpoint.
export const otpRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  prefix: 'rl:otp',
})
