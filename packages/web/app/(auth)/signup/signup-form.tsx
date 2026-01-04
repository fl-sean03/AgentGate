'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Github, Check } from 'lucide-react';
import { PLANS } from '@/lib/stripe';

export function SignupForm({ plan }: { plan?: string }) {
  const selectedPlan = plan && plan in PLANS ? PLANS[plan as keyof typeof PLANS] : PLANS.free;

  return (
    <div className="space-y-6">
      {/* Plan summary */}
      <div className="p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">{selectedPlan.name} Plan</span>
          <span className="text-lg font-bold">
            ${selectedPlan.price / 100}/mo
          </span>
        </div>
        <ul className="space-y-1">
          {selectedPlan.features.slice(0, 3).map((feature) => (
            <li key={feature} className="flex items-center text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-primary mr-2 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
        {plan !== 'free' && (
          <Link
            href="/pricing"
            className="text-sm text-primary hover:underline mt-2 inline-block"
          >
            Compare plans
          </Link>
        )}
      </div>

      <button
        onClick={() => signIn('github', { callbackUrl: `/account/onboarding?plan=${plan || 'free'}` })}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <Github className="h-5 w-5" />
        Sign up with GitHub
      </button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>

      <p className="text-center text-xs text-muted-foreground">
        By signing up, you agree to our{' '}
        <a href="/terms" className="underline hover:text-foreground">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
