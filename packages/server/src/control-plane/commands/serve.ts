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
import { getConfig, getQueueConfig } from '../../config/index.js';
import { getQueueManager } from '../queue-manager.js';
import { createStaleDetector, type StaleDetector } from '../stale-detector.js';
import { workOrderStore } from '../work-order-store.js';
import { createLogger } from '../../utils/logger.js';

// v0.2.22 - New queue system imports (Phase 1: Parallel implementation)
import {
  ResourceMonitor,
  Scheduler,
  RetryManager,
  QueueFacade,
} from '../../queue/index.js';

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
  // Stale detection options (v0.2.23 - Wave 2.2)
  staleCheck: z.boolean().default(true),
  staleCheckInterval: z.coerce.number().int().min(10000).default(60000),
  staleThreshold: z.coerce.number().int().min(60000).default(600000),
  maxRunningTime: z.coerce.number().int().min(300000).default(14400000),
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
    // Stale detection options (v0.2.23 - Wave 2.2)
    .option('--stale-check', 'Enable stale work order detection (default: true)', true)
    .option('--no-stale-check', 'Disable stale work order detection')
    .option('--stale-check-interval <ms>', 'How often to check for stale work orders (ms)', '60000')
    .option('--stale-threshold <ms>', 'Time without activity before considered stale (ms)', '600000')
    .option('--max-running-time <ms>', 'Maximum allowed running time for work orders (ms)', '14400000')
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

  // Stale detection configuration (v0.2.23 - Wave 2.2)
  print(`${bold('Stale Detection Configuration:')}`);
  print(`  ${bold('Stale Check:')} ${cyan(options.staleCheck ? 'enabled' : 'disabled')}`);
  if (options.staleCheck) {
    print(`  ${bold('Check Interval:')} ${cyan(String(options.staleCheckInterval) + 'ms')}`);
    print(`  ${bold('Stale Threshold:')} ${cyan(String(options.staleThreshold) + 'ms')}`);
    print(`  ${bold('Max Running Time:')} ${cyan(String(options.maxRunningTime) + 'ms')}`);
  }
  print('');

  // New queue system configuration (v0.2.22 - Thrust 7)
  const queueConfig = getQueueConfig();
  print(`${bold('New Queue System Configuration:')} ${cyan('(Phase 1: Parallel Implementation)')}`);
  print(`  ${bold('Use New Queue System:')} ${cyan(queueConfig.useNewQueueSystem ? 'enabled' : 'disabled')}`);
  print(`  ${bold('Shadow Mode:')} ${cyan(queueConfig.shadowMode ? 'enabled' : 'disabled')}`);
  print(`  ${bold('Rollout Percent:')} ${cyan(String(queueConfig.rolloutPercent) + '%')}`);
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
    const autoStartCallback = (workOrderId: string): Promise<void> => {
      log.info({ workOrderId }, 'Auto-processing: emitting ready event');
      // Emit ready event - the server's run trigger logic should handle this
      queueManager.emit('ready', workOrderId);
      return Promise.resolve();
    };

    queueManager.startAutoProcessing(autoStartCallback);
    print(`Auto-processing started`);
    print('');
  }

  // Initialize stale detector (v0.2.23 - Wave 2.2)
  let staleDetector: StaleDetector | null = null;
  if (options.staleCheck) {
    print(`${bold('Starting stale detector...')}`);

    staleDetector = createStaleDetector(workOrderStore, queueManager, {
      checkIntervalMs: options.staleCheckInterval,
      staleThresholdMs: options.staleThreshold,
      maxRunningTimeMs: options.maxRunningTime,
    });

    // Forward stale detector events to queue manager for consistent event handling
    staleDetector.on('staleDetected', (check: { workOrderId: string; reason?: string }) => {
      log.info({ workOrderId: check.workOrderId, reason: check.reason }, 'Stale work order detected');
      queueManager.emit('staleDetected', check.workOrderId, check.reason ?? 'Unknown');
    });

    staleDetector.on('deadProcessDetected', (workOrderId: string, reason: string) => {
      log.warn({ workOrderId, reason }, 'Dead process detected');
      queueManager.emit('deadProcessDetected', workOrderId, reason);
    });

    staleDetector.on('staleHandled', (workOrderId: string, killed: boolean) => {
      log.info({ workOrderId, killed }, 'Stale work order handled');
      queueManager.emit('staleHandled', workOrderId, killed);
    });

    staleDetector.start();
    print(`Stale detector started`);
    print('');
  }

  // Initialize new queue system components (v0.2.22 - Thrust 7: Phase 1)
  // These are initialized but NOT wired into the existing system yet
  // This allows us to verify the new components work correctly in isolation
  // Note: QueueObservability requires ExecutionManager which needs SandboxProvider
  // Full observability will be wired in Phase 2
  let newResourceMonitor: ResourceMonitor | null = null;
  let newScheduler: Scheduler | null = null;
  let newRetryManager: RetryManager | null = null;

  if (queueConfig.useNewQueueSystem || queueConfig.shadowMode) {
    print(`${bold('Initializing new queue system components...')}`);

    // Create resource monitor with config
    newResourceMonitor = new ResourceMonitor({
      maxConcurrentSlots: config.maxConcurrentRuns,
      memoryPerSlotMB: options.minMemory,
      pollIntervalMs: options.pollInterval,
    });

    // Create scheduler
    newScheduler = new Scheduler(newResourceMonitor, {
      pollIntervalMs: options.pollInterval,
      staggerDelayMs: options.staggerDelay,
      priorityEnabled: false,
      maxQueueDepth: 0, // Unlimited
    });

    // Create retry manager
    newRetryManager = new RetryManager({
      maxRetries: 3,
      baseDelayMs: 5000,
      maxDelayMs: 300000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
    });

    // Note: ExecutionManager requires SandboxProvider which is not available here
    // For Phase 1, we only initialize the components that don't require external dependencies
    // The full wiring will happen in Phase 2 when we integrate with the existing system

    // Log initialization (without creating full observability since we don't have ExecutionManager)
    log.info(
      {
        useNewQueueSystem: queueConfig.useNewQueueSystem,
        shadowMode: queueConfig.shadowMode,
        rolloutPercent: queueConfig.rolloutPercent,
        maxSlots: config.maxConcurrentRuns,
      },
      'New queue system components initialized (Phase 1)'
    );

    // Start resource monitor
    newResourceMonitor.start();

    print(`  ${bold('Resource Monitor:')} ${cyan('started')}`);
    print(`  ${bold('Scheduler:')} ${cyan('initialized (not started - awaiting Phase 2 wiring)')}`);
    print(`  ${bold('Retry Manager:')} ${cyan('initialized')}`);
    print(`New queue system components ready`);
    print('');
  }

  // Initialize QueueFacade for feature flag-based routing (v0.2.22 - Phase 2)
  let queueFacade: QueueFacade | null = null;
  if (queueConfig.useNewQueueSystem || queueConfig.shadowMode || queueConfig.rolloutPercent > 0) {
    print(`${bold('Initializing QueueFacade...')}`);

    // Build options conditionally to avoid exactOptionalPropertyTypes issues
    const facadeOptions: {
      scheduler?: Scheduler;
      resourceMonitor?: ResourceMonitor;
      retryManager?: RetryManager;
    } = {};
    if (newScheduler) {
      facadeOptions.scheduler = newScheduler;
    }
    if (newResourceMonitor) {
      facadeOptions.resourceMonitor = newResourceMonitor;
    }
    if (newRetryManager) {
      facadeOptions.retryManager = newRetryManager;
    }

    queueFacade = QueueFacade.fromConfig(
      queueManager,
      queueConfig,
      facadeOptions
    );

    log.info(
      {
        useNewQueueSystem: queueConfig.useNewQueueSystem,
        shadowMode: queueConfig.shadowMode,
        rolloutPercent: queueConfig.rolloutPercent,
      },
      'QueueFacade initialized (Phase 2)'
    );

    print(`  ${bold('Active System:')} ${cyan(queueConfig.useNewQueueSystem && queueConfig.rolloutPercent >= 100 ? 'new' : queueConfig.shadowMode ? 'both (shadow)' : 'legacy + gradual rollout')}`);
    print(`QueueFacade ready`);
    print('');
  }

  // Handle shutdown signals
  const shutdown = (): void => {
    print('');
    print('Shutting down server...');

    // Stop stale detection and auto-processing first
    const shutdownAsync = async (): Promise<void> => {
      // Stop stale detector first (v0.2.23 - Wave 2.2)
      if (staleDetector) {
        print('Stopping stale detector...');
        await staleDetector.stop();
        print('Stale detector stopped');
      }

      // Stop auto-processing (v0.2.23 - Wave 2.1)
      if (options.autoProcess) {
        print('Stopping auto-processing...');
        await queueManager.stopAutoProcessing();
        print('Auto-processing stopped');
      }

      // Stop new queue system components (v0.2.22 - Thrust 7 & Phase 2)
      if (queueFacade) {
        const stats = queueFacade.getStats();
        log.info({ stats: stats.counters }, 'QueueFacade final statistics');
      }
      if (newScheduler) {
        print('Stopping new scheduler...');
        newScheduler.stop();
        print('New scheduler stopped');
      }
      if (newResourceMonitor) {
        print('Stopping new resource monitor...');
        newResourceMonitor.stop();
        print('New resource monitor stopped');
      }
      if (newRetryManager) {
        print('Cancelling pending retries...');
        newRetryManager.cancelAll();
        print('Pending retries cancelled');
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
