import { describe, it, expect, afterEach, vi } from 'vitest'

// tests/integration/setup.ts stubs @/lib/redis for every other integration
// test with a Proxy that always resolves null, which cannot represent a held
// claim at all. This is the one test that needs the real thing (REE-32, Brief
// 38 Part 3), so it opts out of that global mock. CI's integration job runs a
// real Redis behind Upstash's REST shim for exactly this, see the `services`
// block on the integration job in .github/workflows/ci.yml.
vi.unmock('@/lib/redis')

import { redis } from '@/lib/redis'
import { enqueueWithClaim } from '@/lib/comms/inbound-claim'

function testKey() {
  return `test:inbound-claim:${crypto.randomUUID()}`
}

// enqueueWithClaim is the funnel all three inbound webhook routes (WhatsApp,
// Telegram, email) pass through, each closing over redis.set(key, '1', { nx,
// ex }) and redis.del(key) exactly like this. tests/unit/inbound-claim.test.ts
// proves the control flow against a Map-backed fake; only a real Redis proves
// SET NX is actually atomic and DEL actually frees the key for a real retry,
// which is the entire point of the claim-release pattern.
describe('enqueueWithClaim against a real Redis', () => {
  const keysToClean: string[] = []

  afterEach(async () => {
    await Promise.all(keysToClean.splice(0).map((key) => redis.del(key)))
  })

  function claim(key: string) {
    return redis.set(key, '1', { nx: true, ex: 60 })
  }

  function release(key: string) {
    return redis.del(key)
  }

  it('claims the key in Redis and enqueues', async () => {
    const key = testKey()
    keysToClean.push(key)
    const enqueue = vi.fn(async () => {})

    const enqueued = await enqueueWithClaim({ claimKey: key, claim, release, enqueue })

    expect(enqueued).toBe(true)
    expect(enqueue).toHaveBeenCalledTimes(1)
    // Not .toBe('1'): @upstash/redis's get() auto-JSON-parses the stored
    // value, and '1' is valid JSON, so it comes back as the number 1. The
    // claim only cares that the key is held, not the SDK's parsed type.
    expect(await redis.get(key)).not.toBeNull()
  })

  it('rejects a duplicate claim on the same key without enqueueing again', async () => {
    const key = testKey()
    keysToClean.push(key)
    const enqueue = vi.fn(async () => {})

    await enqueueWithClaim({ claimKey: key, claim, release, enqueue })
    const second = await enqueueWithClaim({ claimKey: key, claim, release, enqueue })

    expect(second).toBe(false)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('releases the claim in Redis when the send fails, so a retry is not swallowed', async () => {
    const key = testKey()
    keysToClean.push(key)
    const boom = new Error('trigger.dev unreachable')
    const failingEnqueue = vi.fn(async () => {
      throw boom
    })

    await expect(
      enqueueWithClaim({ claimKey: key, claim, release, enqueue: failingEnqueue })
    ).rejects.toBe(boom)

    // The claim is gone from Redis itself, not just from an in-memory fake.
    expect(await redis.get(key)).toBeNull()

    // The provider's retry of the same message id now gets through.
    const retryEnqueue = vi.fn(async () => {})
    const retried = await enqueueWithClaim({ claimKey: key, claim, release, enqueue: retryEnqueue })

    expect(retried).toBe(true)
    expect(retryEnqueue).toHaveBeenCalledTimes(1)
  })
})
