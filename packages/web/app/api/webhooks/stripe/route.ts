import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const error = err as Error;
    console.error('Webhook signature verification failed:', error.message);
    return NextResponse.json(
      { error: `Webhook Error: ${error.message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  // Get the subscription to get the price ID
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;

  await db.user.update({
    where: { id: userId },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  // Update user settings with plan
  const plan = getPlanFromPriceId(priceId);
  await db.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      plan,
    },
    update: {
      plan,
    },
  });
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  const user = await db.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) return;

  await db.user.update({
    where: { id: user.id },
    data: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  // Update plan in settings
  const plan = getPlanFromPriceId(priceId);
  await db.userSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      plan,
    },
    update: {
      plan,
    },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const user = await db.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) return;

  await db.user.update({
    where: { id: user.id },
    data: {
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
    },
  });

  // Reset to free plan
  await db.userSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      plan: 'free',
    },
    update: {
      plan: 'free',
    },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Log successful payment
  console.log(`Invoice paid: ${invoice.id}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Log failed payment - could send notification email
  console.log(`Payment failed for invoice: ${invoice.id}`);
}

function getPlanFromPriceId(priceId: string | undefined): string {
  if (!priceId) return 'free';

  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) {
    return 'pro';
  }
  if (priceId === process.env.STRIPE_PRICE_TEAM_MONTHLY) {
    return 'team';
  }

  return 'free';
}
