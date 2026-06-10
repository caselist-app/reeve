import { createHash } from 'crypto'
import { redis } from '@/lib/redis'

// Build a deterministic idempotency key for a send.
// Every send job must call checkAndSet before sending.
// A missing idempotency key means a retried job double-messages crew.
//
// dedup_dimension is what makes a send unique within its message type:
//   morning_message  -> show date (YYYY-MM-DD)
//   boarding_pass    -> transport_assignment id
//   broadcast        -> change id
//   advance_reminder -> document_share_id:reminder_index
export function buildSendKey(
  tour_id: string,
  person_id: string,
  message_type: string,
  dedup_dimension: string
): string {
  const raw = [tour_id, person_id, message_type, dedup_dimension].join(':')
  const hash = createHash('sha256').update(raw).digest('hex')
  return `send:${hash}`
}

// Returns true if this is the first time we have seen this key (safe to send).
// Returns false if the key already exists (already sent, skip).
// Uses Redis SET NX so the check and the set are atomic.
// If Redis is unavailable, defaults to true (proceed) and logs a warning.
// Degraded Redis is preferable to silently dropping sends.
export async function checkAndSet(
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  try {
    const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds })
    return result === 'OK'
  } catch (err) {
    console.warn('[idempotency] Redis unavailable, defaulting to proceed:', err)
    return true
  }
}
