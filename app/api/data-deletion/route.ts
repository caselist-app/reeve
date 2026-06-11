import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

// Meta Data Deletion Callback
// https://developers.facebook.com/docs/facebook-login/handling-data-deletion-requests

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const params = new URLSearchParams(body)
    const signedRequest = params.get('signed_request')

    if (!signedRequest) {
      return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 })
    }

    const appSecret = process.env.META_APP_SECRET
    if (!appSecret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Verify and decode the signed request
    const [encodedSig, payload] = signedRequest.split('.')
    const expectedSig = createHmac('sha256', appSecret)
      .update(payload)
      .digest('base64url')

    if (encodedSig !== expectedSig) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const userId = data.user_id

    // Log the deletion request - in production this would trigger account deletion
    console.log(`Data deletion request received for Meta user: ${userId}`)

    // Return the confirmation response Meta expects
    const confirmationCode = `reeve-deletion-${userId}-${Date.now()}`
    return NextResponse.json({
      url: `https://yourreeve.com/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
