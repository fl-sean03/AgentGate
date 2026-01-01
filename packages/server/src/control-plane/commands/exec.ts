import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { workOrderService } from '../work-order-service.js';
import { createOrchestrator } from '../../orchestrator/orchestrator.js';
import {
  submitCommandOptionsSchema,
  validateWorkspaceSourceOptions,
} from '../validators.js';
import {
  print,
  printError,
  formatSuccess,
  formatError,
  formatValidationErrors,
  bold,
  cyan,
  dim,
  green,
  red,
  yellow,
  formatDuration,
} from '../formatter.js';
import { AgentType, GatePlanSource, WorkspaceTemplate, VerificationLevel, type SubmitRequest, RunState, RunResult, type Run } from '../../types/index.js';

/**
 * Parse comma-separated verification levels.
 */
function parseVerificationLevels(value: string): string[] {
  const levels = value.split(',').map(l => l.trim().toUpperCase());
  const valid = Object.values(VerificationLevel);
  for (const level of levels) {
    if (!valid.includes(level as typeof valid[number])) {
      throw new Error(`Invalid verification level: ${level}. Valid levels: ${valid.join(', ')}`);
    }
  }
  return levels;
}

/**
 * Create the exec command.
 */
export function createExecCommand(): Command {
  const command = new Command('exec')
    .description('Submit and execute a work order immediately')
    .requiredOption('-p, --prompt <prompt>', 'Task prompt describing what the agent should do')
    .option('--path <path>', 'Local path to the workspace (default: current directory)')
    .option('--git-url <url>', 'Git repository URL to clone')
    .option('--git-branch <branch>', 'Git branch to checkout (requires --git-url or --github)')
    .option('--fresh <path>', 'Create a fresh workspace at the specified path')
    .option(
      '--template <type>',
      `Template for fresh workspace (${Object.values(WorkspaceTemplate).join(', ')})`,
    )
    .option('--project-name <name>', 'Project name for fresh workspace')
    // GitHub options (v0.2.4)
    .option('--github <owner/repo>', 'Use an existing GitHub repository')
    .option('--github-new <owner/repo>', 'Create a new GitHub repository')
    .option('--public', 'Make the new GitHub repository public (default is private, requires --github-new)', false)
    .option('--wait-for-ci', 'Wait for CI checks to pass after PR creation (Thrust 16)', false)
    .option(
      '--skip-verification <levels>',
      'Skip verification levels (comma-separated: L0,L1,L2,L3)',
      parseVerificationLevels
    )
    .option(
      '--agent <type>',
      `Agent type to use (${Object.values(AgentType).join(', ')})`,
      AgentType.CLAUDE_CODE_SUBSCRIPTION
    )
    .option(
      '--max-iterations <n>',
      'Maximum number of agent iterations (1-10)',
      '3'
    )
    .option(
      '--max-time <seconds>',
      'Maximum wall clock time in seconds (60-86400)',
      '3600'
    )
    .option(
      '--gate-plan <source>',
      `Gate plan source (${Object.values(GatePlanSource).join(', ')})`,
      GatePlanSource.AUTO
    )
    .option('--network', 'Allow network access during execution', false)
    .option('--json', 'Output result as JSON', false)
    .action(async (options: Record<string, unknown>) => {
      try {
        await executeExec(options);
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
    [RunState.PR_CREATED]: cyan,
    [RunState.CI_POLLING]: cyan,
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
 * Execute the exec command.
 */
export async function executeExec(rawOptions: Record<string, unknown>): Promise<void> {
  // Validate command options
  const optionsResult = submitCommandOptionsSchema.safeParse(rawOptions);
  if (!optionsResult.success) {
    printError(
      formatValidationErrors(
        optionsResult.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        }))
      )
    );
    process.exitCode = 1;
    return;
  }

  const options = optionsResult.data;

  // Validate workspace source options
  const workspaceResult = validateWorkspaceSourceOptions({
    path: options.path,
    gitUrl: options.gitUrl,
    gitBranch: options.gitBranch,
    fresh: options.fresh,
    template: options.template,
    projectName: options.projectName,
    github: options.github,
    githubNew: options.githubNew,
    public: options.public,
  });

  if (!workspaceResult.success) {
    printError(formatValidationErrors(workspaceResult.errors ?? []));
    process.exitCode = 1;
    return;
  }

  // If using local path, resolve and validate
  let workspaceSource = workspaceResult.data!;
  if (workspaceSource.type === 'local') {
    const resolvedPath = resolve(workspaceSource.path);
    if (!existsSync(resolvedPath)) {
      printError(formatError(`Workspace path does not exist: ${resolvedPath}`));
      process.exitCode = 1;
      return;
    }
    workspaceSource = {
      type: 'local',
      path: resolvedPath,
    };
  } else if (workspaceSource.type === 'fresh') {
    // Resolve the path for fresh workspace (will be created)
    const resolvedPath = resolve(workspaceSource.destPath);
    workspaceSource = {
      ...workspaceSource,
      destPath: resolvedPath,
    };
  }

  // Build submit request
  const request: SubmitRequest = {
    taskPrompt: options.prompt,
    workspaceSource,
    agentType: options.agent,
    maxIterations: options.maxIterations,
    maxWallClockSeconds: options.maxTime,
    gatePlanSource: options.gatePlan,
    waitForCI: options.waitForCi ?? false,
    skipVerification: options.skipVerification as typeof VerificationLevel[keyof typeof VerificationLevel][] | undefined,
    policies: {
      networkAllowed: options.network,
      allowedPaths: [],
      forbiddenPatterns: [
        '**/.env',
        '**/.env.*',
        '**/secrets/**',
        '**/*.pem',
        '**/*.key',
        '**/credentials.json',
        '**/service-account*.json',
      ],
    },
  };

  // Submit the work order
  let order;
  try {
    order = await workOrderService.submit(request);
  } catch (error) {
    printError(formatError(`Failed to submit work order: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
    return;
  }

  // Display submission confirmation
  if (!rawOptions['json']) {
    print(formatSuccess('Work order submitted successfully'));
    print('');
    print(`${bold('Work Order ID:')} ${cyan(order.id)}`);
    print(`${bold('Task:')}          ${order.taskPrompt.slice(0, 60)}${order.taskPrompt.length > 60 ? '...' : ''}`);
    print('');
    print(dim('Starting execution...'));
    print('');
  }

  // Execute the work order
  const orchestrator = createOrchestrator();

  let run: Run;
  try {
    // Execute the work order
    run = await orchestrator.execute(order);

    // Update work order status based on result
    if (run.result === RunResult.PASSED) {
      await workOrderService.markSucceeded(order.id);
    } else {
      const errorMessage = run.error ?? `Run failed with result: ${run.result}`;
      await workOrderService.markFailed(order.id, errorMessage);
    }
  } catch (error) {
    // Mark work order as failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    await workOrderService.markFailed(order.id, errorMessage);
    throw error;
  }

  // Output result
  if (rawOptions['json']) {
    print(formatRunJson(run));
  } else {
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
