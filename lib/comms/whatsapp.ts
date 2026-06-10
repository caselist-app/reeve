import { sendSms } from '@/lib/comms/sms'

export type SendWhatsAppParams = {
  to: string           // E.164 format e.g. +447700900000
  body: string
  media_url?: string   // For boarding passes and attachments
}

// Quick-reply buttons attached to interactive messages.
// WhatsApp supports up to 3 buttons per message.
export type QuickReplyButton = {
  id: string    // Returned as button_reply.id on tap
  title: string // Displayed on the button, max 20 chars
}

export type SendInteractiveParams = {
  to: string
  body: string
  buttons: [QuickReplyButton, ...QuickReplyButton[]] // 1-3 buttons
}

// Send via Meta WhatsApp Cloud API, Twilio WhatsApp fallback, then Twilio SMS.
// Never call this synchronously from a webhook handler.
// Always called from a Trigger.dev job after idempotency check.
export async function sendWhatsApp(params: SendWhatsAppParams): Promise<void> {
  try {
    await sendViaMetaCloudApi(params)
    return
  } catch (err) {
    console.error('Meta WhatsApp send failed, trying Twilio WhatsApp:', err)
  }
  try {
    await sendViaTwilioWhatsApp({ to: params.to, body: params.body })
    return
  } catch (err) {
    console.error('Twilio WhatsApp send failed, falling back to Twilio SMS:', err)
  }
  await sendSms({ to: params.to, body: params.body })
}

// Send an interactive message with quick-reply buttons.
// Interactive types are Meta-only. If Meta fails, fall through to Twilio
// WhatsApp (plain text, no buttons), then Twilio SMS.
export async function sendInteractiveWhatsApp(params: SendInteractiveParams): Promise<void> {
  try {
    await sendInteractiveViaMetaCloudApi(params)
    return
  } catch (err) {
    console.error('Meta interactive send failed, trying Twilio WhatsApp (no buttons):', err)
  }
  try {
    await sendViaTwilioWhatsApp({ to: params.to, body: params.body })
    return
  } catch (err) {
    console.error('Twilio WhatsApp send failed, falling back to Twilio SMS:', err)
  }
  await sendSms({ to: params.to, body: params.body })
}

// Twilio WhatsApp uses the same Messaging Service SID as SMS but with
// a whatsapp: prefix on the To number. Plain text only - no interactive types.
async function sendViaTwilioWhatsApp(params: { to: string; body: string }): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error('Twilio env vars not configured')
  }

  const formBody = new URLSearchParams({
    To: `whatsapp:${params.to}`,
    MessagingServiceSid: messagingServiceSid,
    Body: params.body,
  })

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    }
  )

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Twilio WhatsApp error ${res.status}: ${detail}`)
  }
}

async function sendInteractiveViaMetaCloudApi(params: SendInteractiveParams): Promise<void> {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    throw new Error('Meta WhatsApp env vars not configured')
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: params.body },
      action: {
        // WhatsApp enforces a max of 3 buttons.
        buttons: params.buttons.slice(0, 3).map((btn) => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title },
        })),
      },
    },
  }

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Meta API error ${res.status}: ${detail}`)
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
