/**
 * Logger Factory
 * Creates structured loggers with consistent formatting and correlation.
 *
 * (v0.2.27 - Thrust 18: Structured Logging Overhaul)
 */

import { pino, type Logger, type LoggerOptions } from 'pino';
import { getCorrelationFields } from './correlation.js';
import { createPinoRedactConfig } from './redaction.js';

/**
 * Log level type
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Base log level */
  level?: LogLevel;
  /** Pretty print in development */
  pretty?: boolean;
  /** Include timestamps */
  timestamp?: boolean;
  /** Additional redaction paths */
  redactPaths?: string[];
  /** Service name for structured logs */
  serviceName?: string;
  /** Environment name */
  environment?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<LoggerConfig> = {
  level: 'info',
  pretty: process.env['NODE_ENV'] !== 'production',
  timestamp: true,
  redactPaths: [],
  serviceName: 'agentgate',
  environment: process.env['NODE_ENV'] ?? 'development',
};

/**
 * Singleton logger factory
 */
class LoggerFactory {
  private static instance: LoggerFactory | null = null;
  private rootLogger: Logger;
  private config: Required<LoggerConfig>;
  private childLoggers: Map<string, Logger> = new Map();

  private constructor(config: LoggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rootLogger = this.createRootLogger();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: LoggerConfig): LoggerFactory {
    if (!LoggerFactory.instance) {
      LoggerFactory.instance = new LoggerFactory(config);
    }
    return LoggerFactory.instance;
  }

  /**
   * Reset singleton for testing
   */
  static resetInstance(): void {
    LoggerFactory.instance = null;
  }

  /**
   * Create the root logger
   */
  private createRootLogger(): Logger {
    const options: LoggerOptions = {
      level: process.env['AGENTGATE_LOG_LEVEL'] ?? this.config.level,
      base: {
        service: this.config.serviceName,
        env: this.config.environment,
        pid: undefined,
        hostname: undefined,
      },
      redact: createPinoRedactConfig(this.config.redactPaths),
      formatters: {
        level: (label) => ({ level: label }),
        log: (object) => ({
          ...object,
          ...getCorrelationFields(),
        }),
      },
    };

    if (this.config.timestamp) {
      options.timestamp = pino.stdTimeFunctions.isoTime;
    }

    if (this.config.pretty) {
      options.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      };
    }

    return pino(options);
  }

  /**
   * Get the root logger
   */
  getRootLogger(): Logger {
    return this.rootLogger;
  }

  /**
   * Create a child logger for a module
   */
  createLogger(module: string): Logger {
    let logger = this.childLoggers.get(module);
    if (!logger) {
      logger = this.rootLogger.child({ module });
      this.childLoggers.set(module, logger);
    }
    return logger;
  }

  /**
   * Create a child logger with additional context
   */
  createContextLogger(context: Record<string, unknown>): Logger {
    return this.rootLogger.child(context);
  }

  /**
   * Update log level at runtime
   */
  setLevel(level: LogLevel): void {
    this.rootLogger.level = level;
    for (const logger of this.childLoggers.values()) {
      logger.level = level;
    }
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.rootLogger.level as LogLevel;
  }

  /**
   * Check if a level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return this.rootLogger.isLevelEnabled(level);
  }

  /**
   * Get logger configuration
   */
  getConfig(): Readonly<Required<LoggerConfig>> {
    return this.config;
  }

  /**
   * Flush all logs
   */
  async flush(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.rootLogger.flush();
      resolve();
    });
  }
}

/**
 * Get the logger factory instance
 */
export function getLoggerFactory(config?: LoggerConfig): LoggerFactory {
  return LoggerFactory.getInstance(config);
}

/**
 * Create a logger for a module
 */
export function createModuleLogger(module: string): Logger {
  return getLoggerFactory().createLogger(module);
}

/**
 * Create a context logger
 */
export function createContextLogger(context: Record<string, unknown>): Logger {
  return getLoggerFactory().createContextLogger(context);
}

/**
 * Get the root logger
 */
export function getRootLogger(): Logger {
  return getLoggerFactory().getRootLogger();
}

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  getLoggerFactory().setLevel(level);
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return getLoggerFactory().getLevel();
}

/**
 * Check if a level is enabled
 */
export function isLevelEnabled(level: LogLevel): boolean {
  return getLoggerFactory().isLevelEnabled(level);
}

/**
 * Reset logger factory for testing
 */
export function resetLoggerFactory(): void {
  LoggerFactory.resetInstance();
}

/**
 * Type-safe log helpers
 */
export interface StructuredLog {
  message: string;
  [key: string]: unknown;
}

/**
 * Format a structured log entry
 */
export function formatLog(message: string, data?: Record<string, unknown>): StructuredLog {
  return {
    message,
    ...data,
  };
}
