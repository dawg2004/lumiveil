import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PLAN_CREDITS: Record<string, number> = {
  basic: 650, standard: 1600, mega: 4800,
};

async function isAlreadyProcessed(stripeId: string): Promise<boolean> {
  const { data } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("stripe_id", stripeId)
    .single();
  return !!data;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Webhook signature error:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan;
      if (!userId || !plan) break;

      if (await isAlreadyProcessed(session.id)) break;

      const credits = PLAN_CREDITS[plan] || 0;

      const { data: shop } = await supabase
        .from("shops").select("id").eq("user_id", userId).single();

      if (shop) {
        await supabase.from("shops").update({ plan, credits }).eq("id", shop.id);
        await supabase.from("credit_transactions").insert({
          shop_id: shop.id, type: "subscription",
          amount: credits, description: `${plan}プラン加入・クレジット付与`,
          stripe_id: session.id,
        });
      } else {
        await supabase.from("shops").insert({
          user_id: userId, name: "新規店舗", plan, credits,
        });
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;

      // 初回購入はcheckout.session.completedで処理済みのためスキップ
      if (invoice.billing_reason === "subscription_create") break;

      if (await isAlreadyProcessed(invoice.id!)) break;

      // サブスクリプションのメタデータからuserId/planを取得
      const subscriptionId =
        typeof (invoice as any).subscription === "string"
          ? (invoice as any).subscription
          : (invoice as any).subscription?.id;
      if (!subscriptionId) break;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.userId;
      const plan = subscription.metadata?.plan;
      if (!userId || !plan) break;

      const credits = PLAN_CREDITS[plan] || 0;
      const { data: shop } = await supabase
        .from("shops").select("id").eq("user_id", userId).single();

      if (shop) {
        await supabase.from("shops").update({ plan, credits }).eq("id", shop.id);
        await supabase.from("credit_transactions").insert({
          shop_id: shop.id, type: "subscription",
          amount: credits, description: `${plan}プラン 月次クレジットリセット`,
          stripe_id: invoice.id,
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      if (!userId) break;

      await supabase.from("shops")
        .update({ plan: "free", credits: 0 })
        .eq("user_id", userId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
