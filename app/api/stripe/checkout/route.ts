import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const PRICE_MAP: Record<string, string> = {
  BASIC: process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC!,
  STANDARD: process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD!,
  PRO: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO!,
  ULTRA: process.env.NEXT_PUBLIC_STRIPE_PRICE_ULTRA!,
}

export async function POST(request: NextRequest) {
  try {
    const { priceId } = await request.json()
    const stripePriceId = PRICE_MAP[priceId] || priceId

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/?canceled=true`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
