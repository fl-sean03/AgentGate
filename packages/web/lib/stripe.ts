import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
});

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    priceId: null,
    includedCents: 500, // $5
    features: [
      '10 tasks per month',
      '2 max iterations',
      '1 parallel run',
      '3 repositories',
      'Documentation support',
    ],
  },
  pro: {
    name: 'Pro',
    price: 4900, // $49
    priceId: process.env.STRIPE_PRICE_PRO_MONTHLY,
    includedCents: 6000, // $60
    overageRate: 0.8, // $0.80 per $1
    features: [
      'Unlimited tasks',
      '5 max iterations',
      '3 parallel runs',
      'Unlimited repositories',
      'Email support',
    ],
  },
  team: {
    name: 'Team',
    price: 14900, // $149
    priceId: process.env.STRIPE_PRICE_TEAM_MONTHLY,
    includedCents: 20000, // $200
    overageRate: 0.7, // $0.70 per $1
    features: [
      'Unlimited tasks',
      '10 max iterations',
      '10 parallel runs',
      'Unlimited repositories',
      '10 team members',
      'Priority chat support',
      '99.5% SLA',
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;

export async function createCheckoutSession(
  userId: string,
  priceId: string,
  customerId?: string
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/account/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/account/billing?canceled=true`,
    metadata: {
      userId,
    },
  });

  return session.url!;
}

export async function createPortalSession(customerId: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/account/billing`,
  });

  return session.url;
}

export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

export async function getInvoices(
  customerId: string,
  limit = 10
): Promise<Stripe.Invoice[]> {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });

  return invoices.data;
}

export async function getPaymentMethod(
  customerId: string
): Promise<Stripe.PaymentMethod | null> {
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
    limit: 1,
  });

  return paymentMethods.data[0] || null;
}
