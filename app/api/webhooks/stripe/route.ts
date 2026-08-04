import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

function toAccountStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === 'trialing' || status === 'active' || status === 'past_due' || status === 'canceled') {
    return status
  }

  return 'past_due'
}

function customerIdFrom(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  return value.id
}

async function updateSubscription(subscription: Stripe.Subscription) {
  const customerId = customerIdFrom(subscription.customer)
  if (!customerId) return

  const admin = createAdminClient()
  await admin
    .from('accounts')
    .update({ subscription_status: toAccountStatus(subscription.status) })
    .eq('stripe_customer_id', customerId)
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = customerIdFrom(session.customer)
  const accountId = session.client_reference_id ?? session.metadata?.account_id ?? null
  if (!customerId || !accountId) return

  const admin = createAdminClient()
  await admin
    .from('accounts')
    .update({
      stripe_customer_id: customerId,
      subscription_status: 'active',
    })
    .eq('id', accountId)
}

export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 })
  }

  const rawBody = await request.text()
  const stripe = new Stripe(stripeSecretKey)

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 401 })
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
      break
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await updateSubscription(event.data.object as Stripe.Subscription)
      break
    default:
      break
  }

  return NextResponse.json({ received: true })
}
