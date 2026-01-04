/**
 * Structured Logging Module
 * Re-exports all logging utilities.
 *
 * (v0.2.27 - Thrust 18: Structured Logging Overhaul)
 */

export {
  generateCorrelationId,
  getCorrelationContext,
  getCorrelationId,
  withCorrelation,
  withCorrelationAsync,
  updateCorrelationContext,
  createChildContext,
  getCorrelationFields,
  resetCorrelationStorage,
  type CorrelationContext,
} from './correlation.js';

export {
  REDACTED,
  DEFAULT_REDACT_KEYS,
  redactObject,
  redactString,
  shouldRedactKey,
  createPinoRedactConfig,
  redactEnv,
  type RedactionOptions,
} from './redaction.js';

export {
  getLoggerFactory,
  createModuleLogger,
  createContextLogger,
  getRootLogger,
  setLogLevel,
  getLogLevel,
  isLevelEnabled,
  resetLoggerFactory,
  formatLog,
  type LogLevel,
  type LoggerConfig,
  type StructuredLog,
} from './factory.js';
