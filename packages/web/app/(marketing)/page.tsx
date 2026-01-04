import Link from 'next/link';
import {
  Shield,
  Eye,
  Github,
  CreditCard,
  Terminal,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto max-w-screen-xl px-4">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl">
              AI-powered code changes,{' '}
              <span className="text-primary">verified & delivered</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl">
              Submit a task. Watch an AI agent work. Get a PR back. AgentGate
              orchestrates AI coding agents with 4-level verification.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-lg font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-md border border-border px-8 py-3 text-lg font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                See Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto max-w-screen-xl px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            Built for Developers
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Shield className="h-8 w-8" />}
              title="4-Level Verification"
              description="Every change is tested against L0-L3 gates: contracts, tests, integration, and build verification."
            />
            <FeatureCard
              icon={<Eye className="h-8 w-8" />}
              title="Real-Time Streaming"
              description="Watch the agent work in real-time. See every file read, edit, and command executed."
            />
            <FeatureCard
              icon={<Github className="h-8 w-8" />}
              title="GitHub Integration"
              description="Changes are delivered as pull requests to your repository, ready for review."
            />
            <FeatureCard
              icon={<CreditCard className="h-8 w-8" />}
              title="Pay Per Use"
              description="Only pay for what you use. No wasted compute on failed attempts."
            />
            <FeatureCard
              icon={<Terminal className="h-8 w-8" />}
              title="Terminal-First"
              description="Beautiful TUI for developers who live in the terminal. Keyboard-driven workflow."
            />
            <FeatureCard
              icon={<RefreshCw className="h-8 w-8" />}
              title="Automatic Iteration"
              description="Agent iterates automatically until verification passes or max iterations reached."
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="container mx-auto max-w-screen-xl px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-8">
            <Step
              number={1}
              title="Connect GitHub"
              description="Connect your repositories with one-click OAuth."
            />
            <Step
              number={2}
              title="Describe Your Task"
              description='Natural language prompt: "Fix the auth bug in login.ts"'
            />
            <Step
              number={3}
              title="Agent Makes Changes"
              description="Watch real-time activity and automatic verification."
            />
            <Step
              number={4}
              title="Review Your PR"
              description="Changes delivered as a PR, ready for review."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-b from-background to-card">
        <div className="container mx-auto max-w-screen-xl px-4">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-3xl font-bold">
              Ready to automate your code changes?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Start free. No credit card required.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-lg font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col p-6 rounded-lg border border-border bg-card">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-xl mb-4">
        {number}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
