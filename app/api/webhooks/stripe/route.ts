import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-02-24.acacia',
})

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Webhook verification failed: ${message}` }, { status: 400 })
  }

  const admin = createAdminClient()

  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const status = mapStripeStatus(subscription.status)

      await admin
        .from('accounts')
        .update({ subscription_status: status })
        .eq('stripe_customer_id', customerId)

      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      await admin
        .from('accounts')
        .update({ subscription_status: 'past_due' })
        .eq('stripe_customer_id', customerId)

      break
    }

    case 'checkout.session.completed': {
      // When a new subscription starts, record the customer ID on the account.
      const session = event.data.object as Stripe.Checkout.Session
      const customerId = session.customer as string
      const accountId = session.client_reference_id  // set when creating the checkout session

      if (accountId && customerId) {
        await admin
          .from('accounts')
          .update({
            stripe_customer_id: customerId,
            subscription_status: 'active',
          })
          .eq('id', accountId)
      }

      break
    }
  }

  return NextResponse.json({ received: true })
}

function mapStripeStatus(
  status: Stripe.Subscription.Status
): 'trialing' | 'active' | 'past_due' | 'canceled' {
  switch (status) {
    case 'trialing': return 'trialing'
    case 'active': return 'active'
    case 'past_due':
    case 'unpaid': return 'past_due'
    default: return 'canceled'
  }
}
