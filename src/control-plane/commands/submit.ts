import { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { workOrderService } from '../work-order-service.js';
import {
  submitCommandOptionsSchema,
  validateWorkspaceSourceOptions,
} from '../validators.js';
import {
  print,
  printError,
  formatSuccess,
  formatError,
  formatWorkOrderDetail,
  formatWorkOrderJson,
  formatValidationErrors,
  bold,
  cyan,
} from '../formatter.js';
import { AgentType, GatePlanSource, WorkspaceTemplate, type SubmitRequest } from '../../types/index.js';

/**
 * Create the submit command.
 */
export function createSubmitCommand(): Command {
  const command = new Command('submit')
    .description('Submit a new work order for agent execution')
    .requiredOption('-p, --prompt <prompt>', 'Task prompt describing what the agent should do')
    .option('--path <path>', 'Local path to the workspace (default: current directory)')
    .option('--git-url <url>', 'Git repository URL to clone')
    .option('--git-branch <branch>', 'Git branch to checkout (requires --git-url)')
    .option('--fresh <path>', 'Create a fresh workspace at the specified path')
    .option(
      '--template <type>',
      `Template for fresh workspace (${Object.values(WorkspaceTemplate).join(', ')})`,
    )
    .option('--project-name <name>', 'Project name for fresh workspace')
    .option(
      '--agent <type>',
      `Agent type to use (${Object.values(AgentType).join(', ')})`,
      AgentType.CLAUDE_CODE
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
        await executeSubmit(options);
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  return command;
}

/**
 * Execute the submit command.
 */
async function executeSubmit(rawOptions: Record<string, unknown>): Promise<void> {
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
  const order = await workOrderService.submit(request);

  // Output result
  if (rawOptions['json']) {
    print(formatWorkOrderJson(order));
  } else {
    print(formatSuccess(`Work order submitted successfully`));
    print('');
    print(`${bold('Work Order ID:')} ${cyan(order.id)}`);
    print('');
    print(formatWorkOrderDetail(order));
  }
}
