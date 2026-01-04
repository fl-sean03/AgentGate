import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PLANS } from '@/lib/stripe';
import Link from 'next/link';
import { CreditCard, Download, ExternalLink } from 'lucide-react';

export default async function BillingPage() {
  const session = await auth();
  const user = await db.user.findUnique({
    where: { email: session?.user?.email ?? '' },
    include: { settings: true },
  });

  const plan = user?.settings?.plan ?? 'free';
  const planData = PLANS[plan as keyof typeof PLANS] ?? PLANS.free;

  // Mock data - would come from Stripe
  const subscription = {
    status: 'active' as const,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };

  const paymentMethod = plan !== 'free' ? {
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2025,
  } : null;

  const usage = {
    used: 2750, // cents
    included: planData.includedCents,
    overage: 0,
  };

  const invoices = [
    { id: '1', date: new Date('2025-12-01'), amount: 4900, status: 'paid' },
    { id: '2', date: new Date('2025-11-01'), amount: 6750, status: 'paid' },
    { id: '3', date: new Date('2025-10-01'), amount: 4900, status: 'paid' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing
        </p>
      </div>

      {/* Current Plan */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Current Plan</h2>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-2xl font-bold">{planData.name}</p>
            <p className="text-muted-foreground">
              {formatCurrency(planData.price)}/month · {formatCurrency(planData.includedCents)} included usage
            </p>
            {subscription.status === 'active' && (
              <p className="text-sm text-muted-foreground mt-1">
                Renews on {formatDate(subscription.currentPeriodEnd)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              Change Plan
            </Link>
            {plan !== 'free' && (
              <button className="inline-flex items-center justify-center rounded-md border border-destructive text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/10 transition-colors">
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Usage This Period */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Usage This Period</h2>
        <div className="grid sm:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Included</p>
            <p className="text-lg font-semibold">{formatCurrency(usage.included)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Used</p>
            <p className="text-lg font-semibold">{formatCurrency(usage.used)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Remaining</p>
            <p className="text-lg font-semibold text-primary">
              {formatCurrency(Math.max(0, usage.included - usage.used))}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Overage</p>
            <p className="text-lg font-semibold">
              {usage.overage > 0 ? formatCurrency(usage.overage) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Payment Method</h2>
        {paymentMethod ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium capitalize">
                  {paymentMethod.brand} •••• {paymentMethod.last4}
                </p>
                <p className="text-sm text-muted-foreground">
                  Expires {paymentMethod.expMonth}/{paymentMethod.expYear}
                </p>
              </div>
            </div>
            <button className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
              Update
            </button>
          </div>
        ) : (
          <div className="text-muted-foreground">
            <p>No payment method on file</p>
            <p className="text-sm mt-1">
              Add a payment method to upgrade your plan
            </p>
          </div>
        )}
      </div>

      {/* Invoices */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-6 border-b border-border">
          <h2 className="font-semibold">Invoices</h2>
        </div>
        {invoices.length > 0 ? (
          <div className="divide-y divide-border">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">
                    {formatDate(invoice.date).split(',')[0]}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(invoice.amount)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm px-2 py-1 rounded ${
                    invoice.status === 'paid'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-destructive/10 text-destructive'
                  }`}>
                    {invoice.status === 'paid' ? 'Paid' : 'Due'}
                  </span>
                  <button className="text-muted-foreground hover:text-foreground">
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-muted-foreground text-sm">
            No invoices yet
          </div>
        )}
      </div>
    </div>
  );
}
