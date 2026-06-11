import { createAdminClient } from '@/lib/supabase/admin'
import { registry } from './registry'
import { resolveChannels } from './channels'
import { sendWhatsAppRendered } from './adapters/whatsapp'
import { sendEmailRendered } from './adapters/email'
import type { Channel, ImplementedType, NotificationDataMap, Recipient } from './types'

export type NotifyInput<T extends ImplementedType> = {
  tourId: string
  personId: string
  type: T
  data: NotificationDataMap[T]
  // What makes this send unique within its type, e.g. the show date for a
  // morning message or the assignment id for a boarding pass. Combined with
  // (tour, person, type, channel) it is the durable idempotency key.
  dedupDimension: string
}

export type ChannelOutcome = {
  channel: Channel
  outcome: 'sent' | 'skipped_already_sent' | 'failed'
  providerMessageId?: string | null
  error?: string
}

export type NotifyResult = {
  personId: string
  // Empty when the recipient has no usable channel for this notification.
  channels: ChannelOutcome[]
}

// Sends one notification to one person across their resolved channels.
//
// Flow: resolve the recipient (people -> contacts join) -> resolve channels
// (preference, availability, time-critical rule) -> for each channel, claim a
// notification_log row (the unique index makes a double-send impossible), send,
// then mark the row sent. A failed send deletes its claim so a retry can try
// again. Jobs call this and stay ignorant of channels and idempotency.
export async function notify<T extends ImplementedType>(
  input: NotifyInput<T>
): Promise<NotifyResult> {
  const admin = createAdminClient()
  const def = registry[input.type]

  // Identity and channel preference live on the contact (Brief 20).
  const { data: personRow } = await admin
    .from('people')
    .select('contacts(name, whatsapp_number, contact_email, preferred_channel)')
    .eq('id', input.personId)
    .single()

  const contact = personRow?.contacts as {
    name: string
    whatsapp_number: string | null
    contact_email: string | null
    preferred_channel: 'whatsapp' | 'email' | 'both'
  } | null

  if (!contact) return { personId: input.personId, channels: [] }

  const recipient: Recipient = {
    personId: input.personId,
    name: contact.name,
    whatsappNumber: contact.whatsapp_number,
    email: contact.contact_email,
    preferredChannel: contact.preferred_channel ?? 'whatsapp',
  }

  const channels = resolveChannels(recipient, def.timeCritical)
  if (channels.length === 0) return { personId: input.personId, channels: [] }

  // The tour's artist slug drives the email from-address. Loaded once, only if
  // an email is going out.
  let artistSlug: string | null = null
  if (channels.includes('email')) {
    const { data: tour } = await admin
      .from('tours')
      .select('artists(slug)')
      .eq('id', input.tourId)
      .single()
    artistSlug = (tour?.artists as unknown as { slug: string | null } | null)?.slug ?? null
  }

  const outcomes: ChannelOutcome[] = []

  for (const channel of channels) {
    const logKey = {
      tour_id: input.tourId,
      person_id: input.personId,
      notification_type: input.type,
      channel,
      dedup_dimension: input.dedupDimension,
    }

    // Claim the send. A unique violation (23505) means it already happened.
    const { error: claimError } = await admin
      .from('notification_log')
      .insert({ ...logKey, status: 'queued' })

    if (claimError) {
      if (claimError.code === '23505') {
        outcomes.push({ channel, outcome: 'skipped_already_sent' })
      } else {
        outcomes.push({ channel, outcome: 'failed', error: claimError.message })
      }
      continue
    }

    try {
      let providerMessageId: string | null = null

      if (channel === 'whatsapp') {
        const rendered = await def.whatsapp(input.data)
        ;({ providerMessageId } = await sendWhatsAppRendered(recipient.whatsappNumber!, rendered))
      } else {
        const rendered = await def.email(input.data)
        ;({ providerMessageId } = await sendEmailRendered(recipient.email!, rendered, artistSlug))
      }

      await admin
        .from('notification_log')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: providerMessageId,
        })
        .match(logKey)

      outcomes.push({ channel, outcome: 'sent', providerMessageId })
    } catch (err) {
      // Release the claim so job-level retry can re-attempt this channel.
      await admin.from('notification_log').delete().match(logKey)
      outcomes.push({
        channel,
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { personId: input.personId, channels: outcomes }
}
