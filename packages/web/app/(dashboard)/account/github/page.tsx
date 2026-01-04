import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Github, Check, ExternalLink, RefreshCw } from 'lucide-react';

export default async function GitHubSettingsPage() {
  const session = await auth();
  const user = await db.user.findUnique({
    where: { email: session?.user?.email ?? '' },
    include: {
      accounts: {
        where: { provider: 'github' },
      },
    },
  });

  const githubAccount = user?.accounts?.[0];
  const isConnected = !!githubAccount;

  // Mock repository list
  const repositories = isConnected ? [
    { id: '1', name: 'my-app', fullName: 'user/my-app', private: true },
    { id: '2', name: 'api-server', fullName: 'user/api-server', private: true },
    { id: '3', name: 'docs', fullName: 'user/docs', private: false },
  ] : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">GitHub</h1>
        <p className="text-muted-foreground mt-1">
          Manage your GitHub connection
        </p>
      </div>

      {/* Connection Status */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Connected Account</h2>
        {isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                <Github className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">@{session?.user?.name}</span>
                  <span className="flex items-center gap-1 text-xs text-primary">
                    <Check className="h-3 w-3" />
                    Connected
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {session?.user?.email}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
                <RefreshCw className="h-4 w-4" />
                Reconnect
              </button>
              <button className="inline-flex items-center justify-center rounded-md border border-destructive text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/10 transition-colors">
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Connect your GitHub account to use AgentGate with your repositories.
            </p>
            <button className="inline-flex items-center gap-2 rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:bg-foreground/90 transition-colors">
              <Github className="h-4 w-4" />
              Connect GitHub
            </button>
          </div>
        )}
      </div>

      {/* Repository Access */}
      {isConnected && (
        <div className="rounded-lg border border-border bg-card">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Repository Access</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  AgentGate can access the following repositories
                </p>
              </div>
              <a
                href="https://github.com/settings/installations"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Manage on GitHub
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <div className="divide-y divide-border">
            {repositories.map((repo) => (
              <div key={repo.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Github className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{repo.fullName}</span>
                  {repo.private && (
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                      Private
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">How it works</h2>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>AgentGate creates pull requests on your behalf</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>Changes are made in isolated branches</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>All changes go through verification before PR creation</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>You review and merge - AgentGate never pushes to main</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
