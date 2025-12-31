import { Command } from 'commander';
import { createSubmitCommand } from './commands/submit.js';
import { createStatusCommand } from './commands/status.js';
import { createListCommand } from './commands/list.js';
import { createCancelCommand } from './commands/cancel.js';
import { createAuthCommand } from './commands/auth.js';
import { createMetricsCommand } from './commands/metrics.js';
import { ensureAllDirs } from '../artifacts/paths.js';

/**
 * Package version - will be updated during build
 */
const VERSION = '0.2.5';

/**
 * Create and configure the CLI program.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('agentgate')
    .description(
      'AgentGate - Contained builder with verification gate for AI coding agents'
    )
    .version(VERSION, '-v, --version', 'Output the current version')
    .hook('preAction', async () => {
      // Ensure all required directories exist before any command runs
      await ensureAllDirs();
    });

  // Add commands
  program.addCommand(createSubmitCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createListCommand());
  program.addCommand(createCancelCommand());
  program.addCommand(createAuthCommand());
  program.addCommand(createMetricsCommand());

  // Error handling
  program.exitOverride();

  return program;
}

/**
 * Run the CLI program.
 */
export async function runCli(args: string[] = process.argv): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(args);
  } catch (error) {
    // Commander throws an error on --help and --version
    // We don't want to treat these as errors
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'commander.helpDisplayed' ||
        error.code === 'commander.version')
    ) {
      return;
    }

    // Re-throw other errors
    throw error;
  }
}

export { createSubmitCommand } from './commands/submit.js';
export { createStatusCommand } from './commands/status.js';
export { createListCommand } from './commands/list.js';
export { createCancelCommand } from './commands/cancel.js';
export { createAuthCommand } from './commands/auth.js';
export { createMetricsCommand } from './commands/metrics.js';
