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

export type SendWhatsAppResult = {
  // Meta WhatsApp message ID, used to match delivery/read receipt webhooks
  // back to broadcast_log rows. Always present: Meta is the only channel.
  wamid: string
}

// Send via Meta WhatsApp Cloud API. Meta is the only channel: there is no
// fallback. Never call this synchronously from a webhook handler. Always call
// it from a Trigger.dev job after the idempotency check. Throws if Meta rejects
// the send so job-level retry handles it. Returns the wamid for receipt tracking.
export async function sendWhatsApp(params: SendWhatsAppParams): Promise<SendWhatsAppResult> {
  const wamid = await sendViaMetaCloudApi(params)
  return { wamid }
}

// Send an interactive message with quick-reply buttons. Meta-only.
// Throws if Meta rejects the send so job-level retry handles it.
export async function sendInteractiveWhatsApp(params: SendInteractiveParams): Promise<void> {
  await sendInteractiveViaMetaCloudApi(params)
}

export type SendTemplateParams = {
  to: string
  templateName: string
  // Meta language code, e.g. 'en' or 'en_US'. Must match the approved template.
  languageCode: string
  // Positional body variables {{1}}..{{n}}, in order. Omit for templates with
  // no variables (e.g. hello_world).
  bodyParams?: string[]
  // Document header (e.g. a boarding-pass PDF) for templates with a media header.
  headerDocument?: { link: string; filename: string }
}

// Send an approved WhatsApp template. Unlike free-form and interactive messages,
// a template delivers outside the 24-hour customer-service window, which is what
// every proactive notification needs. Returns the wamid for receipt tracking.
export async function sendTemplate(params: SendTemplateParams): Promise<SendWhatsAppResult> {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    throw new Error('Meta WhatsApp env vars not configured')
  }

  const components: Array<Record<string, unknown>> = []

  if (params.headerDocument) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link: params.headerDocument.link,
            filename: params.headerDocument.filename,
          },
        },
      ],
    })
  }

  if (params.bodyParams && params.bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
    })
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode },
      ...(components.length > 0 ? { components } : {}),
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
    throw new Error(`Meta template send error ${res.status}: ${detail}`)
  }

  const json = (await res.json()) as { messages?: Array<{ id: string }> }
  const wamid = json.messages?.[0]?.id
  if (!wamid) throw new Error('Meta API response missing message id')
  return { wamid }
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

// Returns the wamid (Meta message ID) on success.
// Callers store this to match delivery/read receipts later.
async function sendViaMetaCloudApi(params: SendWhatsAppParams): Promise<string> {
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

  const json = (await res.json()) as { messages?: Array<{ id: string }> }
  const wamid = json.messages?.[0]?.id
  if (!wamid) throw new Error('Meta API response missing message id')
  return wamid
}
