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

/**
 * Schema for serve command options
 */
const serveOptionsSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  host: z.string().default('0.0.0.0'),
  corsOrigin: z.string().optional(),
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

  print(`Starting AgentGate server...`);
  print('');
  print(`${bold('Port:')} ${cyan(String(options.port))}`);
  print(`${bold('Host:')} ${cyan(options.host)}`);
  print(`${bold('CORS Origins:')} ${cyan(corsOrigins.join(', '))}`);
  print('');

  // Start the server
  const server = await startServer({
    port: options.port,
    host: options.host,
    corsOrigins,
  });

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
  print(`  ${cyan('GET')} /health       - Health check`);
  print(`  ${cyan('GET')} /health/ready - Readiness check`);
  print(`  ${cyan('GET')} /health/live  - Liveness check`);
  print('');
  print('Press Ctrl+C to stop the server');
}
