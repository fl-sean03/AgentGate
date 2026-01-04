import Link from 'next/link';
import { formatRelativeTime, formatDuration, truncate } from '@/lib/utils';
import { Check, X, Clock, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';

// Mock data - would come from AgentGate API
const mockRuns = [
  {
    id: '1',
    repository: 'user/my-app',
    task: 'Add dark mode toggle to settings page',
    status: 'succeeded' as const,
    duration: 245,
    iterations: 2,
    prNumber: 127,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '2',
    repository: 'user/api-server',
    task: 'Fix authentication bug in login flow',
    status: 'succeeded' as const,
    duration: 195,
    iterations: 1,
    prNumber: 89,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
  {
    id: '3',
    repository: 'user/my-app',
    task: 'Refactor database connection tests',
    status: 'failed' as const,
    duration: 525,
    iterations: 3,
    error: 'L1 Tests failed',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  {
    id: '4',
    repository: 'user/docs',
    task: 'Add API documentation for new endpoints',
    status: 'running' as const,
    duration: 0,
    iterations: 1,
    createdAt: new Date(Date.now() - 5 * 60 * 1000),
  },
];

export default function RunsPage() {
  const runs = mockRuns;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Run History</h1>
        <p className="text-muted-foreground mt-1">
          View your past agent runs
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterTab active>All</FilterTab>
        <FilterTab>Running</FilterTab>
        <FilterTab>Succeeded</FilterTab>
        <FilterTab>Failed</FilterTab>
      </div>

      {/* Runs list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {runs.length > 0 ? (
          <div className="divide-y divide-border">
            {runs.map((run) => (
              <div key={run.id} className="p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <StatusIcon status={run.status} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{run.repository}</span>
                        <span className="text-muted-foreground text-sm">
                          {formatRelativeTime(run.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {run.task}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {run.status !== 'running' && (
                          <span>Duration: {formatDuration(run.duration)}</span>
                        )}
                        <span>Iterations: {run.iterations}</span>
                        {run.status === 'succeeded' && run.prNumber && (
                          <a
                            href={`https://github.com/${run.repository}/pull/${run.prNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            PR #{run.prNumber}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {run.status === 'failed' && run.error && (
                          <span className="text-destructive">{run.error}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No runs yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use the TUI to submit your first task
            </p>
            <div className="mt-4 p-4 rounded-md bg-secondary/50 font-mono text-sm inline-block">
              $ npx agentgate run
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {runs.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing 1-{runs.length} of {runs.length} runs
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              disabled
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterTab({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function StatusIcon({ status }: { status: 'succeeded' | 'failed' | 'running' }) {
  switch (status) {
    case 'succeeded':
      return (
        <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Check className="h-4 w-4 text-primary" />
        </div>
      );
    case 'failed':
      return (
        <div className="h-6 w-6 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
          <X className="h-4 w-4 text-destructive" />
        </div>
      );
    case 'running':
      return (
        <div className="h-6 w-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
          <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
        </div>
      );
  }
}
