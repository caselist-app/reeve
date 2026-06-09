export type SendSmsParams = {
  to: string     // E.164 format
  body: string
}

// Send SMS via Twilio Messaging Service.
// Used as the WhatsApp fallback and for crew who prefer SMS over WhatsApp.
// Uses the REST API directly to avoid adding the Twilio SDK as a dependency.
export async function sendSms(params: SendSmsParams): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error('Twilio env vars not configured')
  }

  const body = new URLSearchParams({
    To: params.to,
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
      body: body.toString(),
    }
  )

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Twilio error ${res.status}: ${detail}`)
  }
}
