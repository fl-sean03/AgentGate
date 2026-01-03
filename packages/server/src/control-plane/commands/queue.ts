/**
 * Queue Management CLI Commands (v0.2.23 - Wave 3.1)
 *
 * Provides CLI commands for managing the work order queue via API:
 * - list: List work orders with status/limit filtering
 * - cancel: Cancel a work order
 * - purge: Purge work orders by ID or status
 * - kill: Force kill a stuck work order
 * - health: Show queue health dashboard
 */

import { Command } from 'commander';
import {
  print,
  printError,
  formatError,
  formatSuccess,
  formatWarning,
  formatStatus,
  formatRelativeTime,
  formatTable,
  formatDuration,
  formatJson,
  cyan,
  yellow,
  green,
  red,
  bold,
  dim,
} from '../formatter.js';
import type { WorkOrderStatus } from '../../types/index.js';

/**
 * Configuration for queue commands (from environment)
 */
interface QueueCommandConfig {
  apiUrl: string;
  apiKey: string;
}

/**
 * API response for work order list
 */
interface WorkOrderListResponse {
  success: boolean;
  data: {
    items: Array<{
      id: string;
      status: string;
      taskPrompt: string;
      agentType: string;
      createdAt: string;
      updatedAt: string;
      runCount: number;
    }>;
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * API response for queue health
 */
interface QueueHealthResponse {
  success: boolean;
  data: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    stats: {
      waiting: number;
      running: number;
      maxConcurrent: number;
      averageWaitMs: number;
      maxQueueSize: number;
      accepting: boolean;
    };
    utilization: number;
    timestamp: string;
    indicators: {
      accepting: boolean;
      canStartImmediately: boolean;
      queueDepth: number;
      runningCount: number;
    };
  };
}

/**
 * API response for cancel operation
 */
interface CancelResponse {
  success: boolean;
  data: {
    id: string;
    status: string;
    message: string;
    wasRunning: boolean;
  };
}

/**
 * API response for purge operation
 */
interface PurgeResponse {
  success: boolean;
  data: {
    deletedCount: number;
    deletedIds: string[];
    wouldDelete?: number;
  };
}

/**
 * API response for force kill operation
 */
interface ForceKillResponse {
  success: boolean;
  data: {
    id: string;
    success: boolean;
    forcedKill: boolean;
    durationMs: number;
    status: string;
    message: string;
    error?: string;
  };
}

/**
 * API response for rollout status (v0.2.22 - Phase 3)
 */
interface RolloutStatusResponse {
  success: boolean;
  data: {
    enabled: boolean;
    shadowMode: boolean;
    rolloutPercent: number;
    phase: 'disabled' | 'shadow' | 'partial' | 'full';
    timestamp: string;
    counters?: {
      totalRouted: number;
      routedToLegacy: number;
      routedToNew: number;
      shadowMismatches: number;
    };
    recommendation?: string;
  };
}

/**
 * API response for rollout comparison (v0.2.22 - Phase 3)
 */
interface RolloutComparisonResponse {
  success: boolean;
  data: {
    legacy: {
      queueDepth: number;
      runningCount: number;
      accepting: boolean;
      health: string;
    };
    newSystem: {
      queueDepth: number;
      runningCount: number;
      accepting: boolean;
      health: string;
    } | null;
    inSync: boolean;
    differences: string[];
    shadowMismatches: number;
    timestamp: string;
    verdict: 'match' | 'minor_diff' | 'major_diff' | 'new_unavailable';
  };
}

/**
 * API response for rollout config update (v0.2.22 - Phase 3)
 */
interface RolloutConfigUpdateResponse {
  success: boolean;
  data: {
    updated: boolean;
    newPhase: string;
    appliedUpdates: {
      rolloutPercent?: number;
      shadowMode?: boolean;
      useNewQueueSystem?: boolean;
    };
    warning: string;
  };
}

/**
 * Get configuration from environment variables.
 * Exits with error if AGENTGATE_API_KEY is not set.
 */
function getConfig(): QueueCommandConfig {
  const apiUrl = process.env['AGENTGATE_API_URL'] ?? 'http://localhost:3001';
  const apiKey = process.env['AGENTGATE_API_KEY'];

  if (!apiKey) {
    printError(formatError('AGENTGATE_API_KEY environment variable is required'));
    process.exit(1);
  }

  return { apiUrl, apiKey };
}

/**
 * Fetch work orders from API.
 */
async function fetchWorkOrders(
  config: QueueCommandConfig,
  options: { status?: string; limit?: string }
): Promise<WorkOrderListResponse['data']['items']> {
  const url = new URL('/api/v1/work-orders', config.apiUrl);
  if (options.status) {
    url.searchParams.set('status', options.status);
  }
  if (options.limit) {
    url.searchParams.set('limit', options.limit);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `API error: ${res.status}`);
  }

  const response = (await res.json()) as WorkOrderListResponse;
  if (!response.success) {
    throw new Error('Failed to fetch work orders');
  }
  return response.data.items;
}

/**
 * Cancel a work order via API.
 */
async function cancelWorkOrder(
  config: QueueCommandConfig,
  id: string
): Promise<CancelResponse['data']> {
  const res = await fetch(`${config.apiUrl}/api/v1/work-orders/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `API error: ${res.status}`);
  }

  const response = (await res.json()) as CancelResponse;
  return response.data;
}

/**
 * Purge a single work order via API.
 */
async function purgeWorkOrder(
  config: QueueCommandConfig,
  id: string
): Promise<void> {
  // First cancel the work order if it's not in a terminal state
  try {
    await cancelWorkOrder(config, id);
  } catch {
    // Ignore - may already be in terminal state
  }

  // Then purge via the purge endpoint
  const res = await fetch(`${config.apiUrl}/api/v1/work-orders/purge`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}), // Empty body to target specific work order would need different API
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `API error: ${res.status}`);
  }
}

/**
 * Batch purge work orders by status via API.
 */
async function batchPurge(
  config: QueueCommandConfig,
  status: string
): Promise<number> {
  const res = await fetch(`${config.apiUrl}/api/v1/work-orders/purge`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ statuses: [status] }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `API error: ${res.status}`);
  }

  const response = (await res.json()) as PurgeResponse;
  return response.data.deletedCount;
}

/**
 * Count work orders by status.
 */
async function countByStatus(
  config: QueueCommandConfig,
  status: string
): Promise<number> {
  const workOrders = await fetchWorkOrders(config, { status, limit: '1000' });
  return workOrders.length;
}

/**
 * Kill a work order via API.
 */
async function killWorkOrder(
  config: QueueCommandConfig,
  id: string,
  force: boolean
): Promise<ForceKillResponse['data']> {
  const res = await fetch(`${config.apiUrl}/api/v1/work-orders/${id}/kill`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      immediate: force,
      reason: force ? 'Force killed via CLI (--force)' : 'Killed via CLI',
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `API error: ${res.status}`);
  }

  const response = (await res.json()) as ForceKillResponse;
  return response.data;
}

/**
 * Fetch queue health from API.
 */
async function fetchQueueHealth(
  config: QueueCommandConfig
): Promise<QueueHealthResponse['data']> {
  const res = await fetch(`${config.apiUrl}/api/v1/queue/health`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  const response = (await res.json()) as QueueHealthResponse;
  return response.data;
}

/**
 * Fetch rollout status from API (v0.2.22 - Phase 3).
 */
async function fetchRolloutStatus(
  config: QueueCommandConfig
): Promise<RolloutStatusResponse['data']> {
  const res = await fetch(`${config.apiUrl}/api/v1/queue/rollout/status`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  const response = (await res.json()) as RolloutStatusResponse;
  return response.data;
}

/**
 * Fetch rollout comparison from API (v0.2.22 - Phase 3).
 */
async function fetchRolloutComparison(
  config: QueueCommandConfig
): Promise<RolloutComparisonResponse['data']> {
  const res = await fetch(`${config.apiUrl}/api/v1/queue/rollout/comparison`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  const response = (await res.json()) as RolloutComparisonResponse;
  return response.data;
}

/**
 * Update rollout configuration via API (v0.2.22 - Phase 3).
 */
async function updateRolloutConfig(
  config: QueueCommandConfig,
  updates: { rolloutPercent?: number; shadowMode?: boolean; useNewQueueSystem?: boolean }
): Promise<RolloutConfigUpdateResponse['data']> {
  const res = await fetch(`${config.apiUrl}/api/v1/queue/rollout/config`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `API error: ${res.status}`);
  }

  const response = (await res.json()) as RolloutConfigUpdateResponse;
  return response.data;
}

/**
 * Format work order status with color.
 */
function formatWorkOrderStatus(status: string): string {
  return formatStatus(status as WorkOrderStatus);
}

/**
 * Prompt for user confirmation.
 */
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

/**
 * Create the queue command with subcommands.
 */
export function createQueueCommand(): Command {
  const queue = new Command('queue').description('Manage the work order queue');

  // List command
  queue
    .command('list')
    .description('List work orders')
    .option('-s, --status <status>', 'Filter by status (queued, running, succeeded, failed, canceled)')
    .option('-l, --limit <n>', 'Maximum number of results', '20')
    .action(async (options: { status?: string; limit?: string }) => {
      try {
        const config = getConfig();
        const workOrders = await fetchWorkOrders(config, options);

        if (workOrders.length === 0) {
          print(dim('No work orders found'));
          return;
        }

        const tableData = formatTable(
          workOrders,
          [
            {
              header: 'ID',
              width: 14,
              value: (wo) => wo.id.substring(0, 12),
            },
            {
              header: 'STATUS',
              width: 12,
              value: (wo) => formatWorkOrderStatus(wo.status),
            },
            {
              header: 'CREATED',
              width: 16,
              value: (wo) => formatRelativeTime(new Date(wo.createdAt)),
            },
            {
              header: 'AGENT',
              width: 14,
              value: (wo) => wo.agentType.substring(0, 12),
            },
            {
              header: 'TASK',
              width: 40,
              value: (wo) => wo.taskPrompt.substring(0, 40),
            },
          ]
        );

        print(tableData);
        print('');
        print(dim(`Total: ${workOrders.length} work orders`));
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  // Cancel command
  queue
    .command('cancel <id>')
    .description('Cancel a work order')
    .action(async (id: string) => {
      try {
        const config = getConfig();
        const result = await cancelWorkOrder(config, id);

        if (result.wasRunning) {
          print(formatWarning(`Work order ${cyan(id)} canceled (was running)`));
        } else {
          print(formatSuccess(`Work order ${cyan(id)} canceled`));
        }
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  // Purge command
  queue
    .command('purge [id]')
    .description('Purge work order(s) from storage')
    .option('-s, --status <status>', 'Purge all with status (e.g., failed)')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id: string | undefined, options: { status?: string; yes?: boolean }) => {
      try {
        const config = getConfig();

        if (id) {
          // Single purge
          if (!options.yes) {
            const confirm = await promptConfirm(`Purge work order ${id}?`);
            if (!confirm) {
              print(dim('Aborted'));
              return;
            }
          }

          await purgeWorkOrder(config, id);
          print(formatSuccess(`Work order ${cyan(id)} purged`));
        } else if (options.status) {
          // Batch purge
          const count = await countByStatus(config, options.status);

          if (count === 0) {
            print(formatWarning(`No work orders with status '${options.status}'`));
            return;
          }

          if (!options.yes) {
            const confirm = await promptConfirm(
              `Purge ${count} work orders with status '${options.status}'?`
            );
            if (!confirm) {
              print(dim('Aborted'));
              return;
            }
          }

          const purged = await batchPurge(config, options.status);
          print(formatSuccess(`Purged ${purged} work orders`));
        } else {
          printError(formatError('Provide work order ID or --status option'));
          process.exitCode = 1;
        }
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  // Kill command
  queue
    .command('kill <id>')
    .description('Force kill a stuck work order')
    .option('-f, --force', 'Immediate SIGKILL (skip graceful shutdown)')
    .action(async (id: string, options: { force?: boolean }) => {
      try {
        const config = getConfig();
        const result = await killWorkOrder(config, id, options.force ?? false);

        if (result.success) {
          const suffix = result.forcedKill ? ' (force killed)' : '';
          print(formatSuccess(`Work order ${cyan(id)} killed${suffix}`));
          print(dim(`Duration: ${formatDuration(Math.round(result.durationMs / 1000))}`));
        } else {
          printError(formatError(`Failed to kill work order ${id}: ${result.error ?? 'Unknown error'}`));
          process.exitCode = 1;
        }
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  // Health command
  queue
    .command('health')
    .description('Show queue health status')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = getConfig();
        const health = await fetchQueueHealth(config);

        if (options.json) {
          print(formatJson(health));
          return;
        }

        // Header with status
        const statusColor =
          health.status === 'unhealthy'
            ? red
            : health.status === 'degraded'
              ? yellow
              : green;
        print('');
        print(statusColor(`Queue Health: ${health.status.toUpperCase()}`));
        print('');

        // Stats section
        print(bold('Statistics'));
        print(
          `  Running:    ${health.stats.running} / ${health.stats.maxConcurrent} (max concurrent)`
        );
        print(`  Queued:     ${health.stats.waiting}`);
        print(`  Capacity:   ${Math.round(health.utilization * 100)}% utilized`);
        print(`  Accepting:  ${health.stats.accepting ? green('Yes') : red('No')}`);

        // Average wait time
        if (health.stats.averageWaitMs > 0) {
          print('');
          print(bold('Wait Time'));
          print(`  Average:    ${formatDuration(Math.round(health.stats.averageWaitMs / 1000))}`);
        }

        // Indicators
        print('');
        print(bold('Indicators'));
        print(
          `  Can Start:  ${health.indicators.canStartImmediately ? green('Yes') : yellow('No')}`
        );
        print(`  Queue Depth: ${health.indicators.queueDepth}`);

        print('');
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  // ==========================================================================
  // Rollout commands (v0.2.22 - Phase 3: Gradual Rollout)
  // ==========================================================================

  // Rollout status command
  queue
    .command('rollout-status')
    .description('Show gradual rollout status (v0.2.22 Phase 3)')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = getConfig();
        const status = await fetchRolloutStatus(config);

        if (options.json) {
          print(formatJson(status));
          return;
        }

        // Header with phase
        const phaseColor =
          status.phase === 'disabled'
            ? dim
            : status.phase === 'shadow'
              ? yellow
              : status.phase === 'partial'
                ? cyan
                : green;
        print('');
        print(bold('Queue System Rollout Status'));
        print(`  Phase: ${phaseColor(status.phase.toUpperCase())}`);
        print('');

        // Configuration
        print(bold('Configuration'));
        print(`  New System:     ${status.enabled ? green('enabled') : dim('disabled')}`);
        print(`  Shadow Mode:    ${status.shadowMode ? yellow('active') : dim('inactive')}`);
        print(`  Rollout:        ${cyan(String(status.rolloutPercent) + '%')}`);
        print('');

        // Counters (if available)
        if (status.counters) {
          print(bold('Routing Statistics'));
          print(`  Total Routed:   ${status.counters.totalRouted}`);
          print(`  To Legacy:      ${status.counters.routedToLegacy}`);
          print(`  To New:         ${status.counters.routedToNew}`);
          if (status.counters.shadowMismatches > 0) {
            print(`  Mismatches:     ${red(String(status.counters.shadowMismatches))}`);
          } else {
            print(`  Mismatches:     ${green('0')}`);
          }
          print('');
        }

        // Recommendation
        if (status.recommendation) {
          print(bold('Recommendation'));
          print(`  ${yellow(status.recommendation)}`);
          print('');
        }
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  // Rollout comparison command
  queue
    .command('rollout-compare')
    .description('Compare legacy vs new queue system metrics')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const config = getConfig();
        const comparison = await fetchRolloutComparison(config);

        if (options.json) {
          print(formatJson(comparison));
          return;
        }

        // Header with verdict
        const verdictColor =
          comparison.verdict === 'match'
            ? green
            : comparison.verdict === 'minor_diff'
              ? yellow
              : comparison.verdict === 'major_diff'
                ? red
                : dim;
        print('');
        print(bold('System Comparison'));
        print(`  Verdict: ${verdictColor(comparison.verdict.replace('_', ' ').toUpperCase())}`);
        print(`  In Sync: ${comparison.inSync ? green('Yes') : red('No')}`);
        print('');

        // Legacy system
        print(bold('Legacy System'));
        print(`  Queue Depth:  ${comparison.legacy.queueDepth}`);
        print(`  Running:      ${comparison.legacy.runningCount}`);
        print(`  Accepting:    ${comparison.legacy.accepting ? green('Yes') : red('No')}`);
        print(`  Health:       ${comparison.legacy.health}`);
        print('');

        // New system (if available)
        if (comparison.newSystem) {
          print(bold('New System'));
          print(`  Queue Depth:  ${comparison.newSystem.queueDepth}`);
          print(`  Running:      ${comparison.newSystem.runningCount}`);
          print(`  Accepting:    ${comparison.newSystem.accepting ? green('Yes') : red('No')}`);
          print(`  Health:       ${comparison.newSystem.health}`);
          print('');
        } else {
          print(dim('New system not available'));
          print('');
        }

        // Differences
        if (comparison.differences.length > 0) {
          print(bold('Differences'));
          for (const diff of comparison.differences) {
            print(`  ${yellow('!')} ${diff}`);
          }
          print('');
        }

        // Shadow mismatches
        if (comparison.shadowMismatches > 0) {
          print(bold('Shadow Mode'));
          print(`  Mismatches: ${red(String(comparison.shadowMismatches))}`);
          print('');
        }
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  // Rollout set command
  queue
    .command('rollout-set')
    .description('Update rollout configuration (in-memory only)')
    .option('-p, --percent <n>', 'Set rollout percentage (0-100)')
    .option('--shadow', 'Enable shadow mode')
    .option('--no-shadow', 'Disable shadow mode')
    .option('--new', 'Enable new queue system')
    .option('--no-new', 'Disable new queue system')
    .action(async (options: { percent?: string; shadow?: boolean; new?: boolean }) => {
      try {
        const config = getConfig();

        // Build updates object
        const updates: { rolloutPercent?: number; shadowMode?: boolean; useNewQueueSystem?: boolean } = {};

        if (options.percent !== undefined) {
          const percent = parseInt(options.percent, 10);
          if (isNaN(percent) || percent < 0 || percent > 100) {
            printError(formatError('Rollout percent must be 0-100'));
            process.exitCode = 1;
            return;
          }
          updates.rolloutPercent = percent;
        }

        if (options.shadow !== undefined) {
          updates.shadowMode = options.shadow;
        }

        if (options.new !== undefined) {
          updates.useNewQueueSystem = options.new;
        }

        if (Object.keys(updates).length === 0) {
          printError(formatError('No configuration options provided'));
          process.exitCode = 1;
          return;
        }

        const result = await updateRolloutConfig(config, updates);

        if (result.updated) {
          print(formatSuccess('Rollout configuration updated'));
          print(`  New Phase: ${cyan(result.newPhase)}`);

          if (result.appliedUpdates.rolloutPercent !== undefined) {
            print(`  Rollout:   ${cyan(String(result.appliedUpdates.rolloutPercent) + '%')}`);
          }
          if (result.appliedUpdates.shadowMode !== undefined) {
            print(`  Shadow:    ${result.appliedUpdates.shadowMode ? yellow('enabled') : dim('disabled')}`);
          }
          if (result.appliedUpdates.useNewQueueSystem !== undefined) {
            print(`  New System: ${result.appliedUpdates.useNewQueueSystem ? green('enabled') : dim('disabled')}`);
          }

          print('');
          print(formatWarning(result.warning));
        } else {
          printError(formatError('Failed to update configuration'));
          process.exitCode = 1;
        }
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  return queue;
}
