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

/**
 * Schema for serve command options
 */
const serveOptionsSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  host: z.string().default('0.0.0.0'),
  corsOrigin: z.string().optional(),
  apiKey: z.string().optional(),
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

  // Handle shutdown signals
  const shutdown = (): void => {
    print('');
    print('Shutting down server...');
    server.close().then(() => {
      print('Server stopped');
      process.exit(0);
    }).catch((err: unknown) => {
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
  print('Press Ctrl+C to stop the server');
}
