import { Command } from 'commander';
import {
  loadRunMetrics,
  getAllIterationMetrics,
  metricsExist,
} from '../../metrics/index.js';
import { loadRun } from '../../orchestrator/run-store.js';
import {
  print,
  printError,
  formatError,
  formatJson,
  bold,
  dim,
  green,
  red,
  yellow,
  cyan,
} from '../formatter.js';
import type { RunMetrics, IterationMetrics, LevelMetrics } from '../../types/index.js';

/**
 * Create the metrics command.
 */
export function createMetricsCommand(): Command {
  const command = new Command('metrics')
    .description('View run analytics and metrics')
    .argument('<run-id>', 'Run ID to view metrics for')
    .option('-d, --detailed', 'Show per-iteration breakdown', false)
    .option('-j, --json', 'Output result as JSON', false)
    .option('-i, --iteration <number>', 'Show specific iteration only')
    .action(async (runId: string, options: MetricsOptions) => {
      try {
        await executeMetrics(runId, options);
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  return command;
}

interface MetricsOptions {
  detailed?: boolean;
  json?: boolean;
  iteration?: string;
}

/**
 * Execute the metrics command.
 */
async function executeMetrics(runId: string, options: MetricsOptions): Promise<void> {
  // Validate run ID
  if (!runId || runId.trim().length === 0) {
    printError(formatError('Run ID is required'));
    process.exitCode = 1;
    return;
  }

  const trimmedRunId = runId.trim();

  // Check if run exists
  const run = await loadRun(trimmedRunId);
  if (!run) {
    printError(formatError(`Run not found: ${trimmedRunId}`));
    process.exitCode = 1;
    return;
  }

  // Check if metrics exist
  const hasMetrics = await metricsExist(trimmedRunId);
  if (!hasMetrics) {
    printError(formatError(`No metrics available for run: ${trimmedRunId}. Run may still be in progress or was started before v0.2.5.`));
    process.exitCode = 1;
    return;
  }

  // Load metrics
  const runMetrics = await loadRunMetrics(trimmedRunId);
  if (!runMetrics) {
    printError(formatError(`Failed to load metrics for run: ${trimmedRunId}`));
    process.exitCode = 1;
    return;
  }

  // Handle specific iteration
  if (options.iteration !== undefined) {
    const iterNum = parseInt(options.iteration, 10);
    if (isNaN(iterNum) || iterNum < 1) {
      printError(formatError(`Invalid iteration number: ${options.iteration}`));
      process.exitCode = 1;
      return;
    }

    const iterations = await getAllIterationMetrics(trimmedRunId);
    const iterMetrics = iterations.find(i => i.iteration === iterNum);
    if (!iterMetrics) {
      printError(formatError(`Iteration ${iterNum} not found for run: ${trimmedRunId}`));
      process.exitCode = 1;
      return;
    }

    if (options.json) {
      print(formatIterationMetricsJson(iterMetrics));
    } else {
      print(formatIterationMetricsDetail(iterMetrics));
    }
    return;
  }

  // Output based on options
  if (options.json) {
    if (options.detailed) {
      const iterations = await getAllIterationMetrics(trimmedRunId);
      print(formatDetailedMetricsJson(runMetrics, iterations));
    } else {
      print(formatRunMetricsJson(runMetrics));
    }
  } else if (options.detailed) {
    const iterations = await getAllIterationMetrics(trimmedRunId);
    print(formatDetailedMetrics(runMetrics, iterations));
  } else {
    print(formatRunMetricsSummary(runMetrics));
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDurationMs(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format token count with commas
 */
function formatTokenCount(count: number): string {
  return count.toLocaleString('en-US');
}

/**
 * Format percentage bar
 */
function formatPercentBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return cyan('\u2588'.repeat(filled)) + dim('\u2591'.repeat(empty));
}

/**
 * Format result with color
 */
function formatResult(result: string): string {
  switch (result) {
    case 'passed':
      return green('PASSED');
    case 'failed':
      return red('FAILED');
    case 'canceled':
      return yellow('CANCELED');
    case 'error':
      return red('ERROR');
    default:
      return result.toUpperCase();
  }
}

/**
 * Format verification levels
 */
function formatLevelStatus(levels: LevelMetrics[]): string {
  return levels
    .map(l => {
      const status = l.passed ? green('\u2713') : red('\u2717');
      return `${l.level} ${status}`;
    })
    .join('  ');
}

/**
 * Format run metrics summary
 */
function formatRunMetricsSummary(metrics: RunMetrics): string {
  const lines: string[] = [];

  // Header
  lines.push(bold(`Run Metrics: ${metrics.runId}`));
  lines.push(dim('\u2500'.repeat(60)));
  lines.push('');

  // Summary
  const iterSummary = metrics.iterationCount === 1
    ? '1 iteration'
    : `${metrics.iterationCount} iterations (${metrics.failedIterations} failed \u2192 ${metrics.successfulIterations} passed)`;

  lines.push(`${bold('Status:')}      ${formatResult(metrics.result)}`);
  lines.push(`${bold('Duration:')}    ${formatDurationMs(metrics.totalDurationMs)}`);
  lines.push(`${bold('Iterations:')}  ${iterSummary}`);
  lines.push('');

  // Phase breakdown
  const total = metrics.totalBuildDurationMs +
    metrics.totalSnapshotDurationMs +
    metrics.totalVerifyDurationMs +
    metrics.totalFeedbackDurationMs;

  if (total > 0) {
    lines.push(bold('Phase Breakdown:'));

    const phases = [
      { name: 'Build', duration: metrics.totalBuildDurationMs },
      { name: 'Snapshot', duration: metrics.totalSnapshotDurationMs },
      { name: 'Verify', duration: metrics.totalVerifyDurationMs },
      { name: 'Feedback', duration: metrics.totalFeedbackDurationMs },
    ];

    for (const phase of phases) {
      const percent = (phase.duration / total) * 100;
      const bar = formatPercentBar(percent, 20);
      const durationStr = formatDurationMs(phase.duration).padEnd(8);
      const percentStr = `${percent.toFixed(1)}%`.padStart(6);
      lines.push(`  ${phase.name.padEnd(10)} ${durationStr} ${bar} ${dim(percentStr)}`);
    }
    lines.push('');
  }

  // Token usage
  const totalTokens = metrics.totalTokensInput + metrics.totalTokensOutput;
  if (totalTokens > 0) {
    lines.push(bold('Token Usage:'));
    lines.push(`  Input:   ${formatTokenCount(metrics.totalTokensInput)} tokens`);
    lines.push(`  Output:  ${formatTokenCount(metrics.totalTokensOutput)} tokens`);
    lines.push(`  Total:   ${formatTokenCount(totalTokens)} tokens`);
    lines.push('');
  }

  // Code changes
  if (metrics.totalFilesChanged > 0) {
    lines.push(bold('Code Changes:'));
    lines.push(`  Files:   ${metrics.totalFilesChanged} changed`);
    lines.push(`  Lines:   ${green(`+${metrics.totalInsertions}`)}, ${red(`-${metrics.totalDeletions}`)}`);
    lines.push('');
  }

  // Final verification
  lines.push(bold('Final Verification:'));
  lines.push(`  ${formatLevelStatus(metrics.finalVerificationLevels)}`);

  return lines.join('\n');
}

/**
 * Format detailed metrics with per-iteration breakdown
 */
function formatDetailedMetrics(runMetrics: RunMetrics, iterations: IterationMetrics[]): string {
  const lines: string[] = [];

  // Summary first
  lines.push(formatRunMetricsSummary(runMetrics));
  lines.push('');
  lines.push(dim('\u2500'.repeat(60)));

  // Per-iteration details
  for (const iter of iterations) {
    lines.push('');
    lines.push(formatIterationMetricsBrief(iter, runMetrics.iterationCount));
  }

  return lines.join('\n');
}

/**
 * Format brief iteration metrics for detailed view
 */
function formatIterationMetricsBrief(metrics: IterationMetrics, totalIterations: number): string {
  const lines: string[] = [];
  const status = metrics.verificationPassed ? green('PASSED') : red('FAILED');

  lines.push(bold(`Iteration ${metrics.iteration} of ${totalIterations}`) + ` (${status})`);
  lines.push(dim('\u2500'.repeat(40)));

  // Timing
  lines.push(`  Duration:   ${formatDurationMs(metrics.totalDurationMs)}`);

  // Phase breakdown
  const phaseMap = new Map(metrics.phases.map(p => [p.phase, p]));
  const build = phaseMap.get('build');
  const snapshot = phaseMap.get('snapshot');
  const verify = phaseMap.get('verify');
  const feedback = phaseMap.get('feedback');

  if (build) lines.push(`  Build:      ${formatDurationMs(build.durationMs)}`);
  if (snapshot) lines.push(`  Snapshot:   ${formatDurationMs(snapshot.durationMs)}`);
  if (verify) lines.push(`  Verify:     ${formatDurationMs(verify.durationMs)}`);
  if (feedback) lines.push(`  Feedback:   ${formatDurationMs(feedback.durationMs)}`);

  // Tokens
  if (metrics.agentTokensInput !== null || metrics.agentTokensOutput !== null) {
    const input = metrics.agentTokensInput ?? 0;
    const output = metrics.agentTokensOutput ?? 0;
    lines.push(`  Tokens:     ${formatTokenCount(input)} in / ${formatTokenCount(output)} out`);
  }

  // Changes
  if (metrics.filesChanged > 0) {
    lines.push(`  Changes:    ${metrics.filesChanged} files, ${green(`+${metrics.insertions}`)} / ${red(`-${metrics.deletions}`)}`);
  }

  // Verification
  if (!metrics.verificationPassed) {
    const failedLevel = metrics.verificationLevels.find(l => !l.passed);
    if (failedLevel) {
      lines.push(`  Failed at:  ${failedLevel.level}`);
    }
  } else {
    lines.push(`  Passed:     ${formatLevelStatus(metrics.verificationLevels)}`);
  }

  return lines.join('\n');
}

/**
 * Format single iteration metrics detail
 */
function formatIterationMetricsDetail(metrics: IterationMetrics): string {
  const lines: string[] = [];
  const status = metrics.verificationPassed ? green('PASSED') : red('FAILED');

  lines.push(bold(`Iteration ${metrics.iteration} Metrics`));
  lines.push(dim('\u2500'.repeat(50)));
  lines.push('');

  lines.push(`${bold('Status:')}      ${status}`);
  lines.push(`${bold('Duration:')}    ${formatDurationMs(metrics.totalDurationMs)}`);
  lines.push(`${bold('Started:')}     ${metrics.startedAt.toISOString()}`);
  lines.push(`${bold('Completed:')}   ${metrics.completedAt.toISOString()}`);
  lines.push('');

  // Phases
  lines.push(bold('Phase Timings:'));
  for (const phase of metrics.phases) {
    lines.push(`  ${phase.phase.padEnd(10)} ${formatDurationMs(phase.durationMs)}`);
  }
  lines.push('');

  // Agent
  lines.push(bold('Agent Execution:'));
  if (metrics.agentTokensInput !== null) {
    lines.push(`  Input tokens:   ${formatTokenCount(metrics.agentTokensInput)}`);
  }
  if (metrics.agentTokensOutput !== null) {
    lines.push(`  Output tokens:  ${formatTokenCount(metrics.agentTokensOutput)}`);
  }
  if (metrics.agentExitCode !== null) {
    lines.push(`  Exit code:      ${metrics.agentExitCode}`);
  }
  if (metrics.agentDurationMs !== null) {
    lines.push(`  Duration:       ${formatDurationMs(metrics.agentDurationMs)}`);
  }
  lines.push('');

  // Changes
  lines.push(bold('Code Changes:'));
  lines.push(`  Files changed:  ${metrics.filesChanged}`);
  lines.push(`  Insertions:     ${green(`+${metrics.insertions}`)}`);
  lines.push(`  Deletions:      ${red(`-${metrics.deletions}`)}`);
  lines.push('');

  // Verification
  lines.push(bold('Verification:'));
  lines.push(`  Passed:         ${metrics.verificationPassed ? green('Yes') : red('No')}`);
  lines.push(`  Duration:       ${formatDurationMs(metrics.verificationDurationMs)}`);
  lines.push('');
  lines.push(bold('Level Results:'));
  for (const level of metrics.verificationLevels) {
    const status = level.passed ? green('\u2713') : red('\u2717');
    lines.push(`  ${level.level} ${status}  ${formatDurationMs(level.durationMs)}  (${level.checksPassed}/${level.checksRun} checks)`);
  }

  return lines.join('\n');
}

/**
 * Format run metrics as JSON
 */
function formatRunMetricsJson(metrics: RunMetrics): string {
  return formatJson({
    ...metrics,
    startedAt: metrics.startedAt.toISOString(),
    completedAt: metrics.completedAt.toISOString(),
    collectedAt: metrics.collectedAt.toISOString(),
  });
}

/**
 * Format iteration metrics as JSON
 */
function formatIterationMetricsJson(metrics: IterationMetrics): string {
  return formatJson({
    ...metrics,
    startedAt: metrics.startedAt.toISOString(),
    completedAt: metrics.completedAt.toISOString(),
    phases: metrics.phases.map(p => ({
      ...p,
      startedAt: p.startedAt.toISOString(),
      completedAt: p.completedAt.toISOString(),
    })),
  });
}

/**
 * Format detailed metrics as JSON
 */
function formatDetailedMetricsJson(runMetrics: RunMetrics, iterations: IterationMetrics[]): string {
  return formatJson({
    run: {
      ...runMetrics,
      startedAt: runMetrics.startedAt.toISOString(),
      completedAt: runMetrics.completedAt.toISOString(),
      collectedAt: runMetrics.collectedAt.toISOString(),
    },
    iterations: iterations.map(m => ({
      ...m,
      startedAt: m.startedAt.toISOString(),
      completedAt: m.completedAt.toISOString(),
      phases: m.phases.map(p => ({
        ...p,
        startedAt: p.startedAt.toISOString(),
        completedAt: p.completedAt.toISOString(),
      })),
    })),
  });
}
