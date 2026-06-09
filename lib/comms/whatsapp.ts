import { sendSms } from '@/lib/comms/sms'

export type SendWhatsAppParams = {
  to: string           // E.164 format e.g. +447700900000
  body: string
  media_url?: string   // For boarding passes and attachments
}

// Send via Meta WhatsApp Cloud API with Twilio SMS fallback.
// Never call this synchronously from a webhook handler.
// Always called from a Trigger.dev job after idempotency check.
export async function sendWhatsApp(params: SendWhatsAppParams): Promise<void> {
  try {
    await sendViaMetaCloudApi(params)
  } catch (err) {
    // Twilio SMS fallback: covers the period before Meta business verification
    // and any Meta outages. Log the Meta failure before falling back.
    console.error('Meta WhatsApp send failed, falling back to Twilio SMS:', err)
    await sendSms({ to: params.to, body: params.body })
  }
}

async function sendViaMetaCloudApi(params: SendWhatsAppParams): Promise<void> {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    throw new Error('Meta WhatsApp env vars not configured')
  }

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'text',
    text: { body: params.body },
  }

  // For media (e.g. boarding pass PDF), switch to document type.
  if (params.media_url) {
    body.type = 'document'
    body.document = { link: params.media_url, caption: params.body }
    delete body.text
  }

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Meta API error ${res.status}: ${detail}`)
  }
}
