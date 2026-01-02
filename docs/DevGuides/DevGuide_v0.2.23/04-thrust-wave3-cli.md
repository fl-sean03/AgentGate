# 04 - Thrust: Wave 3 CLI Utilities

## Objective

Implement CLI commands for queue management. This wave is independent of Wave 2 and can run concurrently.

## Task 3.1: Queue Management CLI

**Priority**: LOW
**Complexity**: Medium

### Target Commands

```bash
agentgate queue list                    # Show queue status
agentgate queue cancel <id>             # Cancel work order
agentgate queue purge <id>              # Purge work order
agentgate queue purge --status=failed   # Batch purge
agentgate queue kill <id>               # Force kill
agentgate queue kill <id> --force       # Immediate SIGKILL
agentgate queue health                  # Show health dashboard
```

### Implementation

**File: `packages/server/src/cli/commands/queue.ts` (NEW)**

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';

interface QueueCommandConfig {
  apiUrl: string;
  apiKey: string;
}

export function createQueueCommand(): Command {
  const queue = new Command('queue')
    .description('Manage the work order queue');

  // List command
  queue
    .command('list')
    .description('List all work orders')
    .option('--status <status>', 'Filter by status')
    .option('--limit <n>', 'Limit results', '20')
    .action(async (options) => {
      const config = getConfig();
      const workOrders = await fetchWorkOrders(config, options);

      if (workOrders.length === 0) {
        console.log(chalk.yellow('No work orders found'));
        return;
      }

      const table = new Table({
        head: [
          chalk.cyan('ID'),
          chalk.cyan('Status'),
          chalk.cyan('Created'),
          chalk.cyan('Duration'),
        ],
      });

      for (const wo of workOrders) {
        const duration = wo.startedAt
          ? formatDuration(Date.now() - new Date(wo.startedAt).getTime())
          : '-';

        const status = formatStatus(wo.status);

        table.push([
          wo.id.substring(0, 12),
          status,
          formatDate(wo.createdAt),
          duration,
        ]);
      }

      console.log(table.toString());
      console.log(`\nTotal: ${workOrders.length} work orders`);
    });

  // Cancel command
  queue
    .command('cancel <id>')
    .description('Cancel a work order')
    .action(async (id) => {
      const config = getConfig();

      try {
        const result = await cancelWorkOrder(config, id);

        if (result.killed) {
          console.log(chalk.yellow(`Work order ${id} cancelled (process killed)`));
        } else {
          console.log(chalk.green(`Work order ${id} cancelled`));
        }
      } catch (err) {
        console.error(chalk.red(`Failed to cancel: ${err.message}`));
        process.exit(1);
      }
    });

  // Purge command
  queue
    .command('purge [id]')
    .description('Purge work order(s) from storage')
    .option('--status <status>', 'Purge all with status (e.g., failed)')
    .option('--yes', 'Skip confirmation')
    .action(async (id, options) => {
      const config = getConfig();

      if (id) {
        // Single purge
        if (!options.yes) {
          const confirm = await promptConfirm(`Purge work order ${id}?`);
          if (!confirm) return;
        }

        await purgeWorkOrder(config, id);
        console.log(chalk.green(`Work order ${id} purged`));
      } else if (options.status) {
        // Batch purge
        const count = await countByStatus(config, options.status);

        if (count === 0) {
          console.log(chalk.yellow(`No work orders with status '${options.status}'`));
          return;
        }

        if (!options.yes) {
          const confirm = await promptConfirm(
            `Purge ${count} work orders with status '${options.status}'?`
          );
          if (!confirm) return;
        }

        const purged = await batchPurge(config, options.status);
        console.log(chalk.green(`Purged ${purged} work orders`));
      } else {
        console.error(chalk.red('Provide work order ID or --status option'));
        process.exit(1);
      }
    });

  // Kill command
  queue
    .command('kill <id>')
    .description('Force kill a stuck work order')
    .option('--force', 'Immediate SIGKILL (skip graceful shutdown)')
    .action(async (id, options) => {
      const config = getConfig();

      try {
        const result = await killWorkOrder(config, id, options.force);

        if (result.success) {
          console.log(chalk.green(
            `Work order ${id} killed` + (options.force ? ' (force)' : '')
          ));
        } else {
          console.error(chalk.red(`Failed to kill work order ${id}`));
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Health command
  queue
    .command('health')
    .description('Show queue health status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const config = getConfig();
      const health = await fetchQueueHealth(config);

      if (options.json) {
        console.log(JSON.stringify(health, null, 2));
        return;
      }

      // Header
      const statusColor = health.alerts.length > 0 ? chalk.yellow : chalk.green;
      console.log(statusColor(`\nQueue Health: ${health.alerts.length > 0 ? 'WARNINGS' : 'OK'}\n`));

      // Stats table
      const table = new Table();
      table.push(
        { 'Running': `${health.runningCount} / ${health.maxConcurrent}` },
        { 'Queued': health.queuedCount.toString() },
        { 'Completed': chalk.green(health.completedCount.toString()) },
        { 'Failed': chalk.red(health.failedCount.toString()) },
      );

      if (health.oldestRunningAge) {
        table.push({
          'Oldest Running': formatDuration(health.oldestRunningAge),
        });
      }

      console.log(table.toString());

      // Alerts
      if (health.alerts.length > 0) {
        console.log(chalk.yellow('\nAlerts:'));
        for (const alert of health.alerts) {
          console.log(chalk.yellow(`  ! ${alert}`));
        }
      }

      console.log('');
    });

  return queue;
}

// Helper functions

function getConfig(): QueueCommandConfig {
  const apiUrl = process.env.AGENTGATE_API_URL || 'http://localhost:3001';
  const apiKey = process.env.AGENTGATE_API_KEY;

  if (!apiKey) {
    console.error(chalk.red('AGENTGATE_API_KEY environment variable required'));
    process.exit(1);
  }

  return { apiUrl, apiKey };
}

async function fetchWorkOrders(
  config: QueueCommandConfig,
  options: { status?: string; limit?: string }
): Promise<WorkOrder[]> {
  const url = new URL('/api/v1/work-orders', config.apiUrl);
  if (options.status) url.searchParams.set('status', options.status);
  if (options.limit) url.searchParams.set('limit', options.limit);

  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function cancelWorkOrder(
  config: QueueCommandConfig,
  id: string
): Promise<{ killed: boolean }> {
  const res = await fetch(`${config.apiUrl}/api/v1/work-orders/${id}/cancel`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

async function purgeWorkOrder(config: QueueCommandConfig, id: string): Promise<void> {
  const res = await fetch(`${config.apiUrl}/api/v1/work-orders/${id}?purge=true`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
}

async function batchPurge(config: QueueCommandConfig, status: string): Promise<number> {
  const res = await fetch(
    `${config.apiUrl}/api/v1/work-orders?status=${status}&purge=true`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
    }
  );

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const body = await res.json();
  return body.purged;
}

async function killWorkOrder(
  config: QueueCommandConfig,
  id: string,
  force: boolean
): Promise<{ success: boolean }> {
  const url = `${config.apiUrl}/api/v1/work-orders/${id}/kill` +
    (force ? '?force=true' : '');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

async function fetchQueueHealth(config: QueueCommandConfig): Promise<QueueHealth> {
  const res = await fetch(`${config.apiUrl}/api/v1/queue/health`, {
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function countByStatus(config: QueueCommandConfig, status: string): Promise<number> {
  const workOrders = await fetchWorkOrders(config, { status, limit: '1000' });
  return workOrders.length;
}

function formatStatus(status: string): string {
  switch (status) {
    case 'queued': return chalk.blue('queued');
    case 'running': return chalk.yellow('running');
    case 'completed': return chalk.green('completed');
    case 'failed': return chalk.red('failed');
    case 'cancelled': return chalk.gray('cancelled');
    default: return status;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

async function promptConfirm(message: string): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
```

**File: `packages/server/src/cli/index.ts`**

Register the queue command:

```typescript
import { createQueueCommand } from './commands/queue.js';

// In program setup
program.addCommand(createQueueCommand());
```

### Verification

```bash
# Test list
agentgate queue list
agentgate queue list --status=failed

# Test cancel
agentgate queue cancel <some-id>

# Test purge
agentgate queue purge <some-id>
agentgate queue purge --status=failed --yes

# Test kill
agentgate queue kill <some-id>
agentgate queue kill <some-id> --force

# Test health
agentgate queue health
agentgate queue health --json
```

---

## Work Order Submission Command

Wave 3 can run parallel with Wave 2:

```bash
# 3.1 Queue Management CLI
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement queue management CLI commands (v0.2.23 Wave 3.1)\n\nFollow docs/DevGuides/DevGuide_v0.2.23/04-thrust-wave3-cli.md\n\nCreate: packages/server/src/cli/commands/queue.ts\n\nCommands: list, cancel, purge, kill, health\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": { "type": "github", "url": "https://github.com/fl-sean03/AgentGate" },
    "agentType": "claude-code-subscription",
    "maxIterations": 10
  }'
```

## Verification Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] All CLI commands work as documented
- [ ] Help text is accurate: `agentgate queue --help`
- [ ] Error handling provides clear messages
- [ ] Merge PR
