/**
 * Tests for Structured Logging System.
 * (v0.2.27 - Thrust 18: Structured Logging Overhaul)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCorrelationId,
  getCorrelationContext,
  getCorrelationId,
  withCorrelation,
  withCorrelationAsync,
  updateCorrelationContext,
  createChildContext,
  getCorrelationFields,
} from '../../src/logging/correlation.js';
import {
  REDACTED,
  redactObject,
  redactString,
  shouldRedactKey,
  createPinoRedactConfig,
  redactEnv,
} from '../../src/logging/redaction.js';
import {
  getLoggerFactory,
  createModuleLogger,
  setLogLevel,
  getLogLevel,
  isLevelEnabled,
  resetLoggerFactory,
  formatLog,
} from '../../src/logging/factory.js';

describe('Correlation', () => {
  describe('generateCorrelationId', () => {
    it('should generate unique UUIDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('withCorrelation', () => {
    it('should set correlation context', () => {
      const correlationId = 'test-correlation-id';

      withCorrelation({ correlationId }, () => {
        const context = getCorrelationContext();
        expect(context?.correlationId).toBe(correlationId);
      });
    });

    it('should include work order context', () => {
      withCorrelation({ workOrderId: 'wo-123', runId: 'run-456' }, () => {
        const context = getCorrelationContext();
        expect(context?.workOrderId).toBe('wo-123');
        expect(context?.runId).toBe('run-456');
      });
    });

    it('should be undefined outside of context', () => {
      const context = getCorrelationContext();
      expect(context).toBeUndefined();
    });
  });

  describe('withCorrelationAsync', () => {
    it('should work with async functions', async () => {
      const correlationId = 'async-correlation-id';

      await withCorrelationAsync({ correlationId }, async () => {
        await Promise.resolve();
        const context = getCorrelationContext();
        expect(context?.correlationId).toBe(correlationId);
      });
    });
  });

  describe('getCorrelationId', () => {
    it('should return existing ID in context', () => {
      withCorrelation({ correlationId: 'existing-id' }, () => {
        expect(getCorrelationId()).toBe('existing-id');
      });
    });

    it('should generate new ID outside context', () => {
      const id = getCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-/);
    });
  });

  describe('updateCorrelationContext', () => {
    it('should update context fields', () => {
      withCorrelation({ correlationId: 'update-test' }, () => {
        updateCorrelationContext({ iteration: 5 });
        const context = getCorrelationContext();
        expect(context?.iteration).toBe(5);
      });
    });

    it('should do nothing outside context', () => {
      // Should not throw
      updateCorrelationContext({ iteration: 10 });
    });
  });

  describe('createChildContext', () => {
    it('should inherit parent context', () => {
      withCorrelation({ correlationId: 'parent', workOrderId: 'wo-1' }, () => {
        const child = createChildContext({ iteration: 2 });
        expect(child.correlationId).toBe('parent');
        expect(child.workOrderId).toBe('wo-1');
        expect(child.iteration).toBe(2);
      });
    });

    it('should work without parent', () => {
      const child = createChildContext({ iteration: 1 });
      expect(child.correlationId).toBeDefined();
      expect(child.iteration).toBe(1);
    });
  });

  describe('getCorrelationFields', () => {
    it('should return empty object outside context', () => {
      const fields = getCorrelationFields();
      expect(fields).toEqual({});
    });

    it('should return fields in context', () => {
      withCorrelation(
        { correlationId: 'fields-test', workOrderId: 'wo-x', iteration: 3 },
        () => {
          const fields = getCorrelationFields();
          expect(fields.correlationId).toBe('fields-test');
          expect(fields.workOrderId).toBe('wo-x');
          expect(fields.iteration).toBe(3);
        }
      );
    });
  });
});

describe('Redaction', () => {
  describe('shouldRedactKey', () => {
    it('should redact password keys', () => {
      expect(shouldRedactKey('password')).toBe(true);
      expect(shouldRedactKey('PASSWORD')).toBe(true);
    });

    it('should redact token keys', () => {
      expect(shouldRedactKey('token')).toBe(true);
      expect(shouldRedactKey('accessToken')).toBe(true);
      expect(shouldRedactKey('GITHUB_TOKEN')).toBe(true);
    });

    it('should not redact normal keys', () => {
      expect(shouldRedactKey('username')).toBe(false);
      expect(shouldRedactKey('email')).toBe(false);
      expect(shouldRedactKey('id')).toBe(false);
    });

    it('should support additional keys', () => {
      expect(shouldRedactKey('customSecret', ['customSecret'])).toBe(true);
    });
  });

  describe('redactObject', () => {
    it('should redact sensitive keys', () => {
      const obj = {
        username: 'testuser',
        password: 'secret123',
        token: 'abc123',
      };

      const redacted = redactObject(obj);

      expect(redacted.username).toBe('testuser');
      expect(redacted.password).toBe(REDACTED);
      expect(redacted.token).toBe(REDACTED);
    });

    it('should redact nested objects', () => {
      const obj = {
        user: {
          name: 'test',
          credentials: {
            password: 'secret',
          },
        },
      };

      const redacted = redactObject(obj);

      expect((redacted.user as Record<string, unknown>).name).toBe('test');
      expect(
        ((redacted.user as Record<string, unknown>).credentials as Record<string, unknown>)
          .password
      ).toBe(REDACTED);
    });

    it('should handle arrays', () => {
      const obj = {
        users: [{ name: 'a', password: 'p1' }, { name: 'b', password: 'p2' }],
      };

      const redacted = redactObject(obj);
      const users = redacted.users as Array<Record<string, unknown>>;

      expect(users[0].name).toBe('a');
      expect(users[0].password).toBe(REDACTED);
    });

    it('should handle max depth', () => {
      const deep: Record<string, unknown> = { level: 0 };
      let current = deep;
      for (let i = 1; i <= 15; i++) {
        current.nested = { level: i };
        current = current.nested as Record<string, unknown>;
      }

      const redacted = redactObject(deep as Record<string, unknown>, { maxDepth: 5 });
      expect(redacted).toBeDefined();
    });
  });

  describe('redactString', () => {
    it('should redact GitHub tokens', () => {
      const str = 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const redacted = redactString(str);
      expect(redacted).toContain('ghp_[REDACTED]');
      expect(redacted).not.toContain('1234567890');
    });

    it('should redact JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const redacted = redactString(jwt);
      expect(redacted).toBe('[JWT_REDACTED]');
    });
  });

  describe('createPinoRedactConfig', () => {
    it('should create valid redact config', () => {
      const config = createPinoRedactConfig();

      expect(config.paths).toContain('password');
      expect(config.paths).toContain('token');
      expect(config.censor).toBe(REDACTED);
    });

    it('should include additional paths', () => {
      const config = createPinoRedactConfig(['custom.secret']);

      expect(config.paths).toContain('custom.secret');
    });
  });

  describe('redactEnv', () => {
    it('should redact sensitive env vars', () => {
      const env = {
        NODE_ENV: 'production',
        GITHUB_TOKEN: 'ghp_secret',
        API_KEY: 'key123',
      };

      const redacted = redactEnv(env);

      expect(redacted.NODE_ENV).toBe('production');
      expect(redacted.GITHUB_TOKEN).toBe(REDACTED);
    });
  });
});

describe('Logger Factory', () => {
  beforeEach(() => {
    resetLoggerFactory();
  });

  describe('getLoggerFactory', () => {
    it('should return singleton instance', () => {
      const factory1 = getLoggerFactory();
      const factory2 = getLoggerFactory();

      expect(factory1).toBe(factory2);
    });

    it('should accept initial config', () => {
      const factory = getLoggerFactory({ level: 'debug' });
      expect(factory.getLevel()).toBe('debug');
    });
  });

  describe('createModuleLogger', () => {
    it('should create child logger with module', () => {
      const logger = createModuleLogger('test-module');
      expect(logger).toBeDefined();
      // Pino child loggers have bindings
      expect(logger.bindings().module).toBe('test-module');
    });

    it('should reuse same module logger', () => {
      const logger1 = createModuleLogger('cached-module');
      const logger2 = createModuleLogger('cached-module');

      expect(logger1).toBe(logger2);
    });
  });

  describe('setLogLevel / getLogLevel', () => {
    it('should update log level', () => {
      setLogLevel('warn');
      expect(getLogLevel()).toBe('warn');
    });
  });

  describe('isLevelEnabled', () => {
    it('should check if level is enabled', () => {
      setLogLevel('info');

      expect(isLevelEnabled('error')).toBe(true);
      expect(isLevelEnabled('info')).toBe(true);
      expect(isLevelEnabled('debug')).toBe(false);
    });
  });

  describe('formatLog', () => {
    it('should format log entry', () => {
      const log = formatLog('Test message', { foo: 'bar' });

      expect(log.message).toBe('Test message');
      expect(log.foo).toBe('bar');
    });

    it('should work without data', () => {
      const log = formatLog('Simple message');
      expect(log.message).toBe('Simple message');
    });
  });
});
