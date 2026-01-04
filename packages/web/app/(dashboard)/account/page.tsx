import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatCurrency, formatNumber, formatDuration } from '@/lib/utils';
import { PLANS } from '@/lib/stripe';
import Link from 'next/link';
import {
  ArrowRight,
  CreditCard,
  Github,
  Activity,
  TrendingUp,
  Key,
  Terminal,
} from 'lucide-react';

export default async function AccountPage() {
  const session = await auth();
  const user = await db.user.findUnique({
    where: { email: session?.user?.email ?? '' },
    include: {
      settings: true,
    },
  });

  const plan = user?.settings?.plan ?? 'free';
  const planData = PLANS[plan as keyof typeof PLANS] ?? PLANS.free;

  // Mock usage data - would come from actual usage tracking
  const usage = {
    currentMonth: 2750, // cents
    includedAmount: planData.includedCents,
    runsThisMonth: 12,
    successRate: 83,
    avgDuration: 245, // seconds
  };

  const usagePercent = Math.min(
    (usage.currentMonth / usage.includedAmount) * 100,
    100
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {session?.user?.name ?? 'User'}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<CreditCard className="h-5 w-5" />}
          label="Current Plan"
          value={planData.name}
          href="/account/billing"
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="Runs This Month"
          value={formatNumber(usage.runsThisMonth)}
          href="/account/runs"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Success Rate"
          value={`${usage.successRate}%`}
        />
        <StatCard
          icon={<Github className="h-5 w-5" />}
          label="Connected Repos"
          value="3"
          href="/account/github"
        />
      </div>

      {/* Usage meter */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Usage This Month</h2>
          <Link
            href="/account/billing"
            className="text-sm text-primary hover:underline"
          >
            View billing
          </Link>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {formatCurrency(usage.currentMonth)} used
            </span>
            <span className="text-muted-foreground">
              {formatCurrency(usage.includedAmount)} included
            </span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                usagePercent > 80 ? 'bg-destructive' : 'bg-primary'
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          {usagePercent >= 80 && (
            <p className="text-sm text-destructive">
              You&apos;re approaching your included usage limit.{' '}
              <Link href="/account/billing" className="underline">
                Upgrade your plan
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Recent runs */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-semibold">Recent Runs</h2>
          <Link
            href="/account/runs"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="p-6">
          <p className="text-muted-foreground text-sm">
            No runs yet. Use the TUI to submit your first task.
          </p>
          <div className="mt-4 p-4 rounded-md bg-secondary/50 font-mono text-sm">
            $ npx agentgate run
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <QuickAction
          icon={<Github className="h-5 w-5" />}
          title="Connect GitHub"
          description="Add more repositories to use with AgentGate"
          href="/account/github"
        />
        <QuickAction
          icon={<Key className="h-5 w-5" />}
          title="Generate API Key"
          description="Create an API key for CI/CD integration"
          href="/account/api-keys"
        />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function QuickAction({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
    </Link>
  );
}
