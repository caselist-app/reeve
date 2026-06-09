import { Redis } from '@upstash/redis'

// Singleton Redis client used for plan result caching and send idempotency keys.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
