import { Command } from 'commander';
import { workOrderService } from '../work-order-service.js';
import { listCommandOptionsSchema } from '../validators.js';
import {
  print,
  printError,
  formatError,
  formatWorkOrderList,
  formatWorkOrderListJson,
  formatValidationErrors,
  dim,
} from '../formatter.js';
import { WorkOrderStatus, type ListFilters } from '../../types/index.js';

/**
 * Create the list command.
 */
export function createListCommand(): Command {
  const command = new Command('list')
    .alias('ls')
    .description('List work orders')
    .option(
      '-s, --status <status>',
      `Filter by status (${Object.values(WorkOrderStatus).join(', ')})`
    )
    .option('-l, --limit <n>', 'Maximum number of results', '20')
    .option('-o, --offset <n>', 'Skip first N results', '0')
    .option('--json', 'Output result as JSON', false)
    .action(async (options: Record<string, unknown>) => {
      try {
        await executeList(options);
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  return command;
}

/**
 * Execute the list command.
 */
async function executeList(rawOptions: Record<string, unknown>): Promise<void> {
  // Validate command options
  const optionsResult = listCommandOptionsSchema.safeParse(rawOptions);
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

  // Build filters
  const filters: ListFilters = {
    status: options.status,
    limit: options.limit,
    offset: options.offset,
  };

  // Get work orders
  const orders = await workOrderService.list(filters);

  // Output result
  if (options.json) {
    print(formatWorkOrderListJson(orders));
  } else {
    print(formatWorkOrderList(orders));

    // Show pagination info
    if (orders.length === filters.limit) {
      print('');
      print(
        dim(
          `Showing ${orders.length} results. Use --offset ${(filters.offset ?? 0) + (filters.limit ?? 20)} to see more.`
        )
      );
    }
  }
}
