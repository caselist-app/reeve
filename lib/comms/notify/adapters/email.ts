import { sendEmail } from '@/lib/comms/email'
import type { RenderedEmail } from '../types'

// Operational mail uses the 'crew' local-part on the tour's branded subdomain,
// keeping its sending reputation separate from the formal 'advancing' stream.
const OPERATIONAL_LOCAL_PART = 'crew'

// Sends a rendered email and returns the Resend message id for receipt tracking.
export async function sendEmailRendered(
  to: string,
  rendered: RenderedEmail,
  artistSlug: string | null
): Promise<{ providerMessageId: string | null }> {
  const { id } = await sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    artist_slug: artistSlug,
    from_local_part: OPERATIONAL_LOCAL_PART,
    attachments: rendered.attachments,
  })

  return { providerMessageId: id }
}
