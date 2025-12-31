import { Command } from 'commander';
import { workOrderService } from '../work-order-service.js';
import {
  print,
  printError,
  formatError,
  formatWorkOrderDetail,
  formatWorkOrderJson,
} from '../formatter.js';

/**
 * Create the status command.
 */
export function createStatusCommand(): Command {
  const command = new Command('status')
    .description('Get the status of a work order')
    .argument('<id>', 'Work order ID')
    .option('--json', 'Output result as JSON', false)
    .action(async (id: string, options: { json?: boolean }) => {
      try {
        await executeStatus(id, options);
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  return command;
}

/**
 * Execute the status command.
 */
async function executeStatus(
  id: string,
  options: { json?: boolean }
): Promise<void> {
  // Validate ID
  if (!id || id.trim().length === 0) {
    printError(formatError('Work order ID is required'));
    process.exitCode = 1;
    return;
  }

  // Get the work order
  const order = await workOrderService.get(id.trim());

  if (!order) {
    printError(formatError(`Work order not found: ${id}`));
    process.exitCode = 1;
    return;
  }

  // Output result
  if (options.json) {
    print(formatWorkOrderJson(order));
  } else {
    print(formatWorkOrderDetail(order));
  }
}
