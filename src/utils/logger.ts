import { pino, type LoggerOptions } from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';

// Build options conditionally to satisfy exactOptionalPropertyTypes
const options: LoggerOptions = {
  level: process.env['AGENTGATE_LOG_LEVEL'] ?? (isDev ? 'debug' : 'info'),
  base: {
    pid: undefined,
    hostname: undefined,
  },
};

// Only add transport in dev mode
if (isDev) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(options);

export function createLogger(module: string): pino.Logger {
  return logger.child({ module });
}
