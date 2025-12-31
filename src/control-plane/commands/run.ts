import { Command } from 'commander';
import { workOrderService } from '../work-order-service.js';
import { createOrchestrator } from '../../orchestrator/orchestrator.js';
import {
  print,
  printError,
  formatError,
  formatSuccess,
  formatStatus,
  bold,
  cyan,
  dim,
  yellow,
  green,
  red,
  formatDuration,
} from '../formatter.js';
import { WorkOrderStatus, type Run, RunState, RunResult } from '../../types/index.js';

/**
 * Create the run command.
 */
export function createRunCommand(): Command {
  const command = new Command('run')
    .description('Execute a queued work order')
    .argument('<work-order-id>', 'Work order ID to execute')
    .option('--json', 'Output result as JSON', false)
    .action(async (workOrderId: string, options: { json?: boolean }) => {
      try {
        await executeRun(workOrderId, options);
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  return command;
}

/**
 * Format a run state with appropriate color.
 */
function formatRunState(state: RunState): string {
  const stateColors: Record<RunState, (text: string) => string> = {
    [RunState.QUEUED]: yellow,
    [RunState.LEASED]: yellow,
    [RunState.BUILDING]: cyan,
    [RunState.SNAPSHOTTING]: cyan,
    [RunState.VERIFYING]: cyan,
    [RunState.FEEDBACK]: yellow,
    [RunState.SUCCEEDED]: green,
    [RunState.FAILED]: red,
    [RunState.CANCELED]: dim,
  };

  const colorFn = stateColors[state] ?? dim;
  return colorFn(state.toUpperCase());
}

/**
 * Format a run result with appropriate color.
 */
function formatRunResult(result: RunResult): string {
  switch (result) {
    case RunResult.PASSED:
      return green('PASSED');
    case RunResult.FAILED_VERIFICATION:
      return red('FAILED (verification)');
    case RunResult.FAILED_BUILD:
      return red('FAILED (build)');
    case RunResult.FAILED_TIMEOUT:
      return red('FAILED (timeout)');
    case RunResult.FAILED_ERROR:
      return red('FAILED (error)');
    case RunResult.CANCELED:
      return yellow('CANCELED');
    default:
      return dim(String(result));
  }
}

/**
 * Display progress update.
 */
function displayProgress(state: RunState, iteration: number, maxIterations: number): void {
  const progress = `[${iteration}/${maxIterations}]`;
  print(`  ${dim(progress)} ${formatRunState(state)}`);
}

/**
 * Format run details for display.
 */
function formatRunDetail(run: Run): string {
  const lines: string[] = [];

  lines.push(bold('Run Result'));
  lines.push('');
  lines.push(`${bold('Run ID:')}        ${run.id}`);
  lines.push(`${bold('Work Order:')}    ${run.workOrderId}`);
  lines.push(`${bold('State:')}         ${formatRunState(run.state)}`);

  if (run.result) {
    lines.push(`${bold('Result:')}        ${formatRunResult(run.result)}`);
  }

  lines.push(`${bold('Iterations:')}    ${run.iteration}/${run.maxIterations}`);

  if (run.startedAt) {
    const started = run.startedAt.toLocaleString();
    lines.push(`${bold('Started:')}       ${started}`);
  }

  if (run.completedAt) {
    const completed = run.completedAt.toLocaleString();
    const durationMs = run.completedAt.getTime() - run.startedAt.getTime();
    const durationSec = Math.round(durationMs / 1000);
    lines.push(`${bold('Completed:')}     ${completed} (${dim(formatDuration(durationSec))})`);
  }

  if (run.gitHubBranch) {
    lines.push(`${bold('Branch:')}        ${run.gitHubBranch}`);
  }

  if (run.gitHubPrUrl) {
    lines.push(`${bold('Pull Request:')} ${cyan(run.gitHubPrUrl)}`);
  }

  if (run.error) {
    lines.push('');
    lines.push(`${bold(red('Error:'))}`);
    lines.push(`  ${red(run.error)}`);
  }

  return lines.join('\n');
}

/**
 * Format run as JSON.
 */
function formatRunJson(run: Run): string {
  return JSON.stringify(
    {
      ...run,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    },
    null,
    2
  );
}

/**
 * Execute the run command.
 */
async function executeRun(
  workOrderId: string,
  options: { json?: boolean }
): Promise<void> {
  // Validate ID
  if (!workOrderId || workOrderId.trim().length === 0) {
    printError(formatError('Work order ID is required'));
    process.exitCode = 1;
    return;
  }

  const id = workOrderId.trim();

  // Get the work order
  const order = await workOrderService.get(id);

  if (!order) {
    printError(formatError(`Work order not found: ${id}`));
    process.exitCode = 1;
    return;
  }

  // Verify work order is in queued status
  if (order.status !== WorkOrderStatus.QUEUED) {
    printError(
      formatError(
        `Work order is in '${order.status}' status. Only queued work orders can be executed.`
      )
    );
    process.exitCode = 1;
    return;
  }

  // Display start message
  if (!options.json) {
    print(bold('Executing Work Order'));
    print('');
    print(`${bold('ID:')}     ${cyan(order.id)}`);
    print(`${bold('Task:')}   ${order.taskPrompt.slice(0, 60)}${order.taskPrompt.length > 60 ? '...' : ''}`);
    print(`${bold('Status:')} ${formatStatus(order.status)}`);
    print('');
    print(dim('Starting execution...'));
    print('');
  }

  // Create orchestrator and execute
  const orchestrator = createOrchestrator();

  let run: Run;
  try {
    // Execute the work order
    // Note: The orchestrator's onRunStarted callback updates the work order status to RUNNING
    run = await orchestrator.execute(order);

    // Update work order status based on result
    if (run.result === RunResult.PASSED) {
      await workOrderService.markSucceeded(id);
    } else {
      const errorMessage = run.error ?? `Run failed with result: ${run.result}`;
      await workOrderService.markFailed(id, errorMessage);
    }
  } catch (error) {
    // Mark work order as failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    await workOrderService.markFailed(id, errorMessage);
    throw error;
  }

  // Output result
  if (options.json) {
    print(formatRunJson(run));
  } else {
    // Display progress summary
    displayProgress(run.state, run.iteration, run.maxIterations);
    print('');

    // Display final result
    if (run.result === RunResult.PASSED) {
      print(formatSuccess('Work order executed successfully'));
    } else {
      print(formatError(`Work order execution failed: ${run.result}`));
    }

    print('');
    print(formatRunDetail(run));
  }

  // Set exit code based on result
  if (run.result !== RunResult.PASSED) {
    process.exitCode = 1;
  }
}
