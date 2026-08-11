import { describe, it, expect, vi } from 'vitest'
import { enqueueWithClaim } from '@/lib/comms/inbound-claim'

// enqueueWithClaim is the single claim-send-release funnel both inbound webhook
// routes pass through. The bug it fixes is a Telegram route that claimed a
// message id and enqueued with no try/catch and no release: a throwing enqueue
// stranded the claim for its full TTL, so the provider's retry hit the dedup
// guard, got a 200, and the crew member's message was swallowed forever.
//
// Unit, not integration: the integration harness stubs Redis with a Proxy that
// returns null and cannot represent a held claim at all, so it cannot see the
// dedup or the release. A storing fake for claim/release can.

// A Map-backed stand-in for Redis SET NX / DEL. claim returns 'OK' the first
// time a key is seen and null after, exactly like set({ nx: true }); release
// deletes it so a later claim of the same key succeeds again.
function storingClaimStore() {
  const held = new Set<string>()
  return {
    held,
    claim: vi.fn(async (key: string) => {
      if (held.has(key)) return null
      held.add(key)
      return 'OK'
    }),
    release: vi.fn(async (key: string) => {
      held.delete(key)
    }),
  }
}

describe('enqueueWithClaim', () => {
  it('claims the key and enqueues on the first call', async () => {
    const store = storingClaimStore()
    const enqueue = vi.fn(async () => {})

    const enqueued = await enqueueWithClaim({
      claimKey: 'wamid:abc',
      claim: store.claim,
      release: store.release,
      enqueue,
    })

    expect(enqueued).toBe(true)
    expect(store.claim).toHaveBeenCalledWith('wamid:abc')
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(store.release).not.toHaveBeenCalled()
    expect(store.held.has('wamid:abc')).toBe(true)
  })

  it('does not enqueue a second call with the same key', async () => {
    const store = storingClaimStore()
    const enqueue = vi.fn(async () => {})

    await enqueueWithClaim({ claimKey: 'wamid:abc', claim: store.claim, release: store.release, enqueue })
    const second = await enqueueWithClaim({
      claimKey: 'wamid:abc',
      claim: store.claim,
      release: store.release,
      enqueue,
    })

    expect(second).toBe(false)
    expect(enqueue).toHaveBeenCalledTimes(1) // Still just the first call.
  })

  it('releases the claim and rethrows when enqueue throws', async () => {
    const store = storingClaimStore()
    const boom = new Error('trigger.dev unreachable')
    const enqueue = vi.fn(async () => {
      throw boom
    })

    await expect(
      enqueueWithClaim({ claimKey: 'wamid:abc', claim: store.claim, release: store.release, enqueue })
    ).rejects.toBe(boom)

    expect(store.release).toHaveBeenCalledWith('wamid:abc')
    // The claim is free again, so the provider's retry gets through.
    expect(store.held.has('wamid:abc')).toBe(false)
  })
})
