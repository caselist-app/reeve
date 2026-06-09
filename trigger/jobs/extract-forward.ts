import { task } from '@trigger.dev/sdk/v3'
import { extractEmailForward } from '@/lib/ai/extract'

export type ExtractForwardPayload = {
  tour_id: string
  raw_email: string
}

// Sonnet extraction job. Triggered when the TM forwards an email to the
// per-tour inbound address. Proposes structured rows for TM confirmation.
// Never writes to the spine directly - that requires explicit TM action.
export const extractForwardJob = task({
  id: 'extract-forward',
  run: async (payload: ExtractForwardPayload) => {
    const proposal = await extractEmailForward({
      tour_id: payload.tour_id,
      raw_email: payload.raw_email,
    })

    // The proposal is returned to the caller (the webhook handler stored the
    // raw email; the TM reviews the proposal in the UI and confirms each row).
    // Nothing is committed here.
    return { proposal }
  },
})
