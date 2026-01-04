'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Github } from 'lucide-react';

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/account';
  const error = searchParams.get('error');

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-md bg-destructive/10 border border-destructive text-destructive text-sm">
          {error === 'OAuthAccountNotLinked'
            ? 'This email is already associated with another account.'
            : 'An error occurred during sign in. Please try again.'}
        </div>
      )}

      <button
        onClick={() => signIn('github', { callbackUrl })}
        className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-foreground text-background px-4 py-3 text-sm font-medium hover:bg-foreground/90 transition-colors"
      >
        <Github className="h-5 w-5" />
        Continue with GitHub
      </button>

      <p className="text-center text-sm text-muted-foreground">
        By signing in, you agree to our{' '}
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
