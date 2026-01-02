import { Command } from 'commander';
import { z } from 'zod';
import { startServer } from '../../server/index.js';
import {
  print,
  printError,
  formatError,
  formatValidationErrors,
  bold,
  cyan,
} from '../formatter.js';
import { getConfig } from '../../config/index.js';
import { getQueueManager } from '../queue-manager.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('serve-command');

/**
 * Schema for serve command options
 */
const serveOptionsSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  host: z.string().default('0.0.0.0'),
  corsOrigin: z.string().optional(),
  apiKey: z.string().optional(),
  // Auto-processing options (v0.2.23 - Wave 2.1)
  autoProcess: z.boolean().default(false),
  staggerDelay: z.coerce.number().int().min(0).default(30000),
  pollInterval: z.coerce.number().int().min(1000).default(5000),
  minMemory: z.coerce.number().int().min(512).default(2048),
});

type ServeOptions = z.infer<typeof serveOptionsSchema>;

/**
 * Create the serve command.
 */
export function createServeCommand(): Command {
  const command = new Command('serve')
    .description('Start the AgentGate HTTP server')
    .option('-p, --port <port>', 'Port to listen on', '3001')
    .option('-H, --host <host>', 'Host to bind to', '0.0.0.0')
    .option('--cors-origin <origin>', 'CORS origin to allow (can specify multiple with comma)')
    .option('--api-key <key>', 'API key for authenticating protected endpoints')
    // Auto-processing options (v0.2.23 - Wave 2.1)
    .option('--auto-process', 'Automatically process queued work orders', false)
    .option('--stagger-delay <ms>', 'Delay between starting work orders (ms)', '30000')
    .option('--poll-interval <ms>', 'How often to check the queue (ms)', '5000')
    .option('--min-memory <mb>', 'Minimum available memory to start a work order (MB)', '2048')
    .action(async (options: Record<string, unknown>) => {
      try {
        await executeServe(options);
      } catch (error) {
        printError(formatError(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  return command;
}

/**
 * Execute the serve command.
 */
async function executeServe(rawOptions: Record<string, unknown>): Promise<void> {
  // Validate options
  const optionsResult = serveOptionsSchema.safeParse(rawOptions);
  if (!optionsResult.success) {
    printError(
      formatValidationErrors(
        optionsResult.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }))
      )
    );
    process.exitCode = 1;
    return;
  }

  const options: ServeOptions = optionsResult.data;

  // Parse CORS origins
  const corsOrigins = options.corsOrigin
    ? options.corsOrigin.split(',').map((o) => o.trim())
    : ['*'];

  // Load configuration
  const config = getConfig();

  print(`Starting AgentGate server...`);
  print('');
  print(`${bold('Server Configuration:')}`);
  print(`  ${bold('Port:')} ${cyan(String(options.port))}`);
  print(`  ${bold('Host:')} ${cyan(options.host)}`);
  print(`  ${bold('CORS Origins:')} ${cyan(corsOrigins.join(', '))}`);
  print(`  ${bold('API Key:')} ${cyan(options.apiKey ? '(configured)' : '(none - auth disabled)')}`);
  print('');
  print(`${bold('Limits Configuration:')}`);
  print(`  ${bold('Max Concurrent Runs:')} ${cyan(String(config.maxConcurrentRuns))}`);
  print(`  ${bold('Max Spawn Depth:')} ${cyan(String(config.maxSpawnDepth))}`);
  print(`  ${bold('Max Children/Parent:')} ${cyan(String(config.maxChildrenPerParent))}`);
  print(`  ${bold('Max Tree Size:')} ${cyan(String(config.maxTreeSize))}`);
  print(`  ${bold('Default Timeout:')} ${cyan(String(config.defaultTimeoutSeconds) + 's')}`);
  print('');

  // Auto-processing configuration (v0.2.23 - Wave 2.1)
  print(`${bold('Auto-Processing Configuration:')}`);
  print(`  ${bold('Auto-Process:')} ${cyan(options.autoProcess ? 'enabled' : 'disabled')}`);
  if (options.autoProcess) {
    print(`  ${bold('Poll Interval:')} ${cyan(String(options.pollInterval) + 'ms')}`);
    print(`  ${bold('Stagger Delay:')} ${cyan(String(options.staggerDelay) + 'ms')}`);
    print(`  ${bold('Min Memory:')} ${cyan(String(options.minMemory) + 'MB')}`);
  }
  print('');

  // Start the server - only include apiKey if it's set
  const serverConfig: Parameters<typeof startServer>[0] = {
    port: options.port,
    host: options.host,
    corsOrigins,
  };
  if (options.apiKey) {
    serverConfig.apiKey = options.apiKey;
  }
  const server = await startServer(serverConfig);

  // Initialize queue manager with auto-processing config (v0.2.23 - Wave 2.1)
  const queueManager = getQueueManager({
    maxConcurrent: config.maxConcurrentRuns,
    autoProcessPollIntervalMs: options.pollInterval,
    staggerDelayMs: options.staggerDelay,
    minAvailableMemoryMB: options.minMemory,
  });

  // Start auto-processing if enabled (v0.2.23 - Wave 2.1)
  if (options.autoProcess) {
    print(`${bold('Starting auto-processing...')}`);

    // The auto-start callback triggers a run for a queued work order
    // This emits a 'ready' event which the orchestrator listens for
    const autoStartCallback = async (workOrderId: string): Promise<void> => {
      log.info({ workOrderId }, 'Auto-processing: emitting ready event');
      // Emit ready event - the server's run trigger logic should handle this
      queueManager.emit('ready', workOrderId);
    };

    queueManager.startAutoProcessing(autoStartCallback);
    print(`Auto-processing started`);
    print('');
  }

  // Handle shutdown signals
  const shutdown = (): void => {
    print('');
    print('Shutting down server...');

    // Stop auto-processing first (v0.2.23 - Wave 2.1)
    const shutdownAsync = async (): Promise<void> => {
      if (options.autoProcess) {
        print('Stopping auto-processing...');
        await queueManager.stopAutoProcessing();
        print('Auto-processing stopped');
      }

      // Wait for running work orders to complete (with timeout)
      const stats = queueManager.getStats();
      if (stats.running > 0) {
        print(`Waiting for ${stats.running} running work order(s) to complete...`);
        // Give running work orders 30 seconds to complete
        const maxWaitMs = 30000;
        const startTime = Date.now();
        while (queueManager.getStats().running > 0 && Date.now() - startTime < maxWaitMs) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const currentStats = queueManager.getStats();
          if (currentStats.running > 0) {
            print(`  Still waiting for ${currentStats.running} work order(s)...`);
          }
        }
      }

      await server.close();
      print('Server stopped');
      process.exit(0);
    };

    shutdownAsync().catch((err: unknown) => {
      printError(formatError(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  print(`Server is running at ${cyan(`http://${options.host}:${options.port}`)}`);
  print('');
  print('Available endpoints:');
  print(`  ${cyan('GET')} /health              - Health check`);
  print(`  ${cyan('GET')} /health/ready        - Readiness check`);
  print(`  ${cyan('GET')} /health/live         - Liveness check`);
  print('');
  print('Work Order API:');
  print(`  ${cyan('GET')}    /api/v1/work-orders     - List work orders`);
  print(`  ${cyan('GET')}    /api/v1/work-orders/:id - Get work order details`);
  print(`  ${cyan('POST')}   /api/v1/work-orders     - Submit work order (auth required)`);
  print(`  ${cyan('DELETE')} /api/v1/work-orders/:id - Cancel work order (auth required)`);
  print('');
  print('Run API:');
  print(`  ${cyan('GET')} /api/v1/runs     - List runs`);
  print(`  ${cyan('GET')} /api/v1/runs/:id - Get run details`);
  print('');
  if (options.autoProcess) {
    print(`${bold('Auto-Processing:')} ${cyan('ENABLED')} - Queued work orders will start automatically`);
    print('');
  }
  print('Press Ctrl+C to stop the server');
}
