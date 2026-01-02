import { Command } from 'commander';
import { workOrderService } from '../work-order-service.js';
import {
  print,
  printError,
  formatError,
  formatSuccess,
  formatWarning,
  cyan,
} from '../formatter.js';
import { WorkOrderStatus } from '../../types/index.js';

/**
 * Create the cancel command.
 */
export function createCancelCommand(): Command {
  const command = new Command('cancel')
    .description('Cancel a queued work order')
    .argument('<id>', 'Work order ID to cancel')
    .option('-f, --force', 'Skip confirmation', false)
    .action(async (id: string, options: { force?: boolean }) => {
      try {
        await executeCancel(id, options);
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  return command;
}

/**
 * Execute the cancel command.
 */
async function executeCancel(
  id: string,
  options: { force?: boolean }
): Promise<void> {
  // Validate ID
  if (!id || id.trim().length === 0) {
    printError(formatError('Work order ID is required'));
    process.exitCode = 1;
    return;
  }

  const trimmedId = id.trim();

  // Get the work order first to check its status
  const order = await workOrderService.get(trimmedId);

  if (!order) {
    printError(formatError(`Work order not found: ${trimmedId}`));
    process.exitCode = 1;
    return;
  }

  // Check if already in a terminal state
  if (
    order.status === WorkOrderStatus.SUCCEEDED ||
    order.status === WorkOrderStatus.FAILED ||
    order.status === WorkOrderStatus.CANCELED
  ) {
    print(formatWarning(`Work order ${cyan(trimmedId)} is already in terminal state: ${order.status}`));
    return;
  }

  // Check if running (requires force or different handling)
  if (order.status === WorkOrderStatus.RUNNING) {
    if (!options.force) {
      printError(
        formatError(
          `Work order ${trimmedId} is currently running. Use --force to cancel a running work order.`
        )
      );
      process.exitCode = 1;
      return;
    }

    // v0.2.23: Send abort signal to the running agent process via queue manager
    print(formatWarning('Canceling running work order. Sending abort signal to agent process.'));
  }

  // Cancel the work order
  try {
    await workOrderService.cancel(trimmedId);
    print(formatSuccess(`Work order ${cyan(trimmedId)} has been canceled.`));
  } catch (error) {
    // Handle the case where status changed between our check and cancel
    if (error instanceof Error && error.message.includes('Cannot cancel')) {
      printError(formatError(error.message));
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
