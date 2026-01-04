import Link from 'next/link';
import { Check } from 'lucide-react';
import { PLANS } from '@/lib/stripe';

export default function PricingPage() {
  return (
    <>
      {/* Header */}
      <section className="py-16">
        <div className="container mx-auto max-w-screen-xl px-4 text-center">
          <h1 className="text-4xl font-bold">Simple, transparent pricing</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free, scale as you grow
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20">
        <div className="container mx-auto max-w-screen-xl px-4">
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard
              plan="free"
              name={PLANS.free.name}
              price={PLANS.free.price}
              included={`$${PLANS.free.includedCents / 100}/mo included`}
              features={PLANS.free.features}
              cta="Get Started"
              href="/signup?plan=free"
            />
            <PricingCard
              plan="pro"
              name={PLANS.pro.name}
              price={PLANS.pro.price}
              included={`$${PLANS.pro.includedCents / 100}/mo included`}
              features={PLANS.pro.features}
              cta="Start Pro"
              href="/signup?plan=pro"
              popular
            />
            <PricingCard
              plan="team"
              name={PLANS.team.name}
              price={PLANS.team.price}
              included={`$${PLANS.team.includedCents / 100}/mo included`}
              features={PLANS.team.features}
              cta="Start Team"
              href="/signup?plan=team"
            />
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-16 bg-card/50">
        <div className="container mx-auto max-w-screen-xl px-4">
          <h2 className="text-2xl font-bold text-center mb-8">
            Feature Comparison
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full max-w-4xl mx-auto">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4">Feature</th>
                  <th className="text-center py-4 px-4">Free</th>
                  <th className="text-center py-4 px-4">Pro</th>
                  <th className="text-center py-4 px-4">Team</th>
                </tr>
              </thead>
              <tbody>
                <ComparisonRow
                  feature="Included usage"
                  free="$5/mo"
                  pro="$60/mo"
                  team="$200/mo"
                />
                <ComparisonRow
                  feature="Tasks per month"
                  free="10"
                  pro="Unlimited"
                  team="Unlimited"
                />
                <ComparisonRow
                  feature="Max iterations"
                  free="2"
                  pro="5"
                  team="10"
                />
                <ComparisonRow
                  feature="Parallel runs"
                  free="1"
                  pro="3"
                  team="10"
                />
                <ComparisonRow
                  feature="GitHub repositories"
                  free="3"
                  pro="Unlimited"
                  team="Unlimited"
                />
                <ComparisonRow
                  feature="Team members"
                  free="1"
                  pro="1"
                  team="10"
                />
                <ComparisonRow
                  feature="Support"
                  free="Docs"
                  pro="Email"
                  team="Priority"
                />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="container mx-auto max-w-screen-xl px-4">
          <h2 className="text-2xl font-bold text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="max-w-2xl mx-auto space-y-6">
            <FAQ
              question="How does billing work?"
              answer="Monthly subscription plus pay-per-use overage. Your subscription includes a certain amount of usage, and any usage beyond that is charged at a discounted overage rate."
            />
            <FAQ
              question="What counts toward usage?"
              answer="Usage is calculated based on token usage and compute time for each task. The agent's thinking, tool calls, and verification all count toward usage."
            />
            <FAQ
              question="Can I upgrade or downgrade?"
              answer="Yes, you can change your plan at any time. Changes take effect immediately, and we'll prorate accordingly."
            />
            <FAQ
              question="Is there a free trial?"
              answer="Yes! The Free plan is available with no credit card required. You can try AgentGate with real tasks before upgrading."
            />
            <FAQ
              question="What happens if I exceed my included usage?"
              answer="Overage is charged at a discounted rate. Pro users pay $0.80 per $1 of overage, Team users pay $0.70."
            />
            <FAQ
              question="Can I cancel anytime?"
              answer="Yes, there are no lock-in contracts. You can cancel your subscription at any time."
            />
          </div>
        </div>
      </section>
    </>
  );
}

function PricingCard({
  plan,
  name,
  price,
  included,
  features,
  cta,
  href,
  popular,
}: {
  plan: string;
  name: string;
  price: number;
  included: string;
  features: readonly string[];
  cta: string;
  href: string;
  popular?: boolean;
}) {
  return (
    <div
      className={`flex flex-col p-6 rounded-lg border ${
        popular
          ? 'border-primary bg-card ring-2 ring-primary'
          : 'border-border bg-card'
      }`}
    >
      {popular && (
        <span className="text-xs font-medium text-primary uppercase tracking-wide mb-2">
          Most Popular
        </span>
      )}
      <h3 className="text-xl font-bold">{name}</h3>
      <div className="mt-4 flex items-baseline">
        <span className="text-4xl font-bold">
          ${Math.floor(price / 100)}
        </span>
        <span className="text-muted-foreground ml-1">/month</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{included}</p>
      <ul className="mt-6 space-y-3 flex-grow">
        {features.map((feature) => (
          <li key={feature} className="flex items-start">
            <Check className="h-5 w-5 text-primary shrink-0 mr-2" />
            <span className="text-sm">{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`mt-8 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          popular
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'border border-border hover:bg-accent hover:text-accent-foreground'
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function ComparisonRow({
  feature,
  free,
  pro,
  team,
}: {
  feature: string;
  free: string;
  pro: string;
  team: string;
}) {
  return (
    <tr className="border-b border-border">
      <td className="py-4 px-4 text-muted-foreground">{feature}</td>
      <td className="py-4 px-4 text-center">{free}</td>
      <td className="py-4 px-4 text-center">{pro}</td>
      <td className="py-4 px-4 text-center">{team}</td>
    </tr>
  );
}

function FAQ({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="border-b border-border pb-6">
      <h3 className="font-semibold mb-2">{question}</h3>
      <p className="text-muted-foreground">{answer}</p>
    </div>
  );
}
