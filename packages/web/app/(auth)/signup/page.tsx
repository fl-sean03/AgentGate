import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { SignupForm } from './signup-form';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const session = await auth();
  const { plan } = await searchParams;

  if (session) {
    redirect('/account');
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-muted-foreground mt-2">
          Get started with AgentGate{plan ? ` on the ${plan} plan` : ''}
        </p>
      </div>
      <SignupForm plan={plan} />
    </div>
  );
}
