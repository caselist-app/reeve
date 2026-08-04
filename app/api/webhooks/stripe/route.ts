import { NextResponse } from 'next/server'

// Stripe billing is wired in a later brief.
// This stub accepts POST so Next.js builds cleanly without a STRIPE_SECRET_KEY.
export async function POST() {
  return NextResponse.json({ received: true })
}
