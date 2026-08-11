// The claim-send-release pattern both inbound webhook routes (WhatsApp,
// Telegram) share. A handler dedupes an inbound message by claiming its id
// (SET NX), enqueues the router job, and must release the claim if the enqueue
// throws. Leaving the claim set makes the provider's retry of the same message
// hit the dedup guard and get a 200, so the message is swallowed for the full
// claim TTL and every log looks healthy. This is the same claim-send-release
// rule the outbound send paths follow, see lib/comms/notify/index.ts.
//
// The WhatsApp route had this fix inline (2026-08-04); the Telegram route
// enqueued with no try/catch and no release. Extracted here so both call one
// funnel and the release cannot be forgotten again.

interface EnqueueWithClaimArgs {
  // The dedup key, or null when the message carries no id to dedup on. A null
  // key skips the claim and release entirely and just enqueues.
  claimKey: string | null
  // Claims the key. Returns a non-null value if the claim was taken (SET NX
  // returns 'OK'), or null if the key was already held (a duplicate).
  claim: (key: string) => Promise<unknown>
  // Frees the key so the provider's retry can get through.
  release: (key: string) => Promise<unknown>
  // Enqueues the router job. May throw on a transient provider outage.
  enqueue: () => Promise<unknown>
}

// Returns true if the job was enqueued, false if the id was already claimed (a
// duplicate the caller should skip). Rethrows whatever enqueue throws, after
// releasing the claim, so the caller can return a non-200 and let the provider
// retry.
export async function enqueueWithClaim({
  claimKey,
  claim,
  release,
  enqueue,
}: EnqueueWithClaimArgs): Promise<boolean> {
  if (claimKey !== null) {
    // If claim throws (Redis down), proceed anyway: dropping an inbound message
    // is worse than a duplicate enqueue, and the router job has its own second
    // guard. Only a definite null (key already held) means skip.
    try {
      const claimed = await claim(claimKey)
      if (claimed === null) return false
    } catch {
      // Redis unavailable: proceed and rely on the router-job guard.
    }
  }

  try {
    await enqueue()
  } catch (err) {
    if (claimKey !== null) {
      try {
        await release(claimKey)
      } catch {
        // Redis unavailable: the claim expires on its own within its TTL.
      }
    }
    throw err
  }

  return true
}
