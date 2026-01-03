/**
 * Configuration Module Tests
 *
 * Comprehensive tests for environment variable loading and validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, resetConfig, getConfig, getConfigLimits, getSDKConfig, buildSDKDriverConfig, getQueueConfig } from '../src/config/index.js';

describe('Configuration Module', () => {
  // Store original env for restoration
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
    // Use vi.stubEnv for proper isolation
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('AGENTGATE_')) {
        vi.stubEnv(key, undefined as unknown as string);
      }
    });
  });

  afterEach(() => {
    // Restore original environment using vi.unstubAllEnvs
    vi.unstubAllEnvs();
    // Additionally restore original values
    process.env = { ...originalEnv };
    resetConfig();
  });

  describe('loadConfig', () => {
    describe('defaults', () => {
      it('should return correct defaults when no env vars set', () => {
        const config = loadConfig();

        expect(config.maxConcurrentRuns).toBe(5);
        expect(config.maxSpawnDepth).toBe(3);
        expect(config.maxChildrenPerParent).toBe(10);
        expect(config.maxTreeSize).toBe(100);
        expect(config.defaultTimeoutSeconds).toBe(3600);
        expect(config.pollIntervalMs).toBe(5000);
        expect(config.leaseDurationSeconds).toBe(3600);
        expect(config.dataDir).toBe('.agentgate/data');
        expect(config.port).toBe(3001);
        expect(config.host).toBe('0.0.0.0');
      });
    });

    describe('environment variable parsing', () => {
      it('should parse AGENTGATE_MAX_CONCURRENT_RUNS', () => {
        vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '20');
        const config = loadConfig();
        expect(config.maxConcurrentRuns).toBe(20);
      });

      it('should parse AGENTGATE_MAX_SPAWN_DEPTH', () => {
        vi.stubEnv('AGENTGATE_MAX_SPAWN_DEPTH', '5');
        const config = loadConfig();
        expect(config.maxSpawnDepth).toBe(5);
      });

      it('should parse AGENTGATE_MAX_CHILDREN_PER_PARENT', () => {
        vi.stubEnv('AGENTGATE_MAX_CHILDREN_PER_PARENT', '25');
        const config = loadConfig();
        expect(config.maxChildrenPerParent).toBe(25);
      });

      it('should parse AGENTGATE_MAX_TREE_SIZE', () => {
        vi.stubEnv('AGENTGATE_MAX_TREE_SIZE', '500');
        const config = loadConfig();
        expect(config.maxTreeSize).toBe(500);
      });

      it('should parse AGENTGATE_DEFAULT_TIMEOUT_SECONDS', () => {
        vi.stubEnv('AGENTGATE_DEFAULT_TIMEOUT_SECONDS', '7200');
        const config = loadConfig();
        expect(config.defaultTimeoutSeconds).toBe(7200);
      });

      it('should parse AGENTGATE_POLL_INTERVAL_MS', () => {
        vi.stubEnv('AGENTGATE_POLL_INTERVAL_MS', '10000');
        const config = loadConfig();
        expect(config.pollIntervalMs).toBe(10000);
      });

      it('should parse AGENTGATE_LEASE_DURATION_SECONDS', () => {
        vi.stubEnv('AGENTGATE_LEASE_DURATION_SECONDS', '7200');
        const config = loadConfig();
        expect(config.leaseDurationSeconds).toBe(7200);
      });

      it('should parse AGENTGATE_DATA_DIR', () => {
        vi.stubEnv('AGENTGATE_DATA_DIR', '/custom/data/path');
        const config = loadConfig();
        expect(config.dataDir).toBe('/custom/data/path');
      });

      it('should parse AGENTGATE_PORT', () => {
        vi.stubEnv('AGENTGATE_PORT', '8080');
        const config = loadConfig();
        expect(config.port).toBe(8080);
      });

      it('should parse AGENTGATE_HOST', () => {
        vi.stubEnv('AGENTGATE_HOST', '127.0.0.1');
        const config = loadConfig();
        expect(config.host).toBe('127.0.0.1');
      });

      it('should parse multiple env vars simultaneously', () => {
        vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '50');
        vi.stubEnv('AGENTGATE_MAX_SPAWN_DEPTH', '7');
        vi.stubEnv('AGENTGATE_PORT', '9000');

        const config = loadConfig();

        expect(config.maxConcurrentRuns).toBe(50);
        expect(config.maxSpawnDepth).toBe(7);
        expect(config.port).toBe(9000);
        // Other values should remain default
        expect(config.maxChildrenPerParent).toBe(10);
      });
    });

    describe('validation', () => {
      describe('maxConcurrentRuns', () => {
        it('should reject value below minimum (0)', () => {
          vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '0');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (101)', () => {
          vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '101');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary value (1)', () => {
          vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '1');
          const config = loadConfig();
          expect(config.maxConcurrentRuns).toBe(1);
        });

        it('should accept boundary value (100)', () => {
          vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '100');
          const config = loadConfig();
          expect(config.maxConcurrentRuns).toBe(100);
        });

        it('should reject non-numeric value', () => {
          vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', 'not-a-number');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject float value', () => {
          vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '5.5');
          // Zod coerce + int rejects floats
          expect(() => loadConfig()).toThrow();
        });

        it('should reject negative value', () => {
          vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '-5');
          expect(() => loadConfig()).toThrow();
        });
      });

      describe('maxSpawnDepth', () => {
        it('should reject value below minimum (0)', () => {
          vi.stubEnv('AGENTGATE_MAX_SPAWN_DEPTH', '0');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (11)', () => {
          vi.stubEnv('AGENTGATE_MAX_SPAWN_DEPTH', '11');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary values (1 and 10)', () => {
          vi.stubEnv('AGENTGATE_MAX_SPAWN_DEPTH', '1');
          expect(loadConfig().maxSpawnDepth).toBe(1);

          resetConfig();
          vi.stubEnv('AGENTGATE_MAX_SPAWN_DEPTH', '10');
          expect(loadConfig().maxSpawnDepth).toBe(10);
        });
      });

      describe('maxChildrenPerParent', () => {
        it('should reject value below minimum (0)', () => {
          vi.stubEnv('AGENTGATE_MAX_CHILDREN_PER_PARENT', '0');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (51)', () => {
          vi.stubEnv('AGENTGATE_MAX_CHILDREN_PER_PARENT', '51');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary values (1 and 50)', () => {
          vi.stubEnv('AGENTGATE_MAX_CHILDREN_PER_PARENT', '1');
          expect(loadConfig().maxChildrenPerParent).toBe(1);

          resetConfig();
          vi.stubEnv('AGENTGATE_MAX_CHILDREN_PER_PARENT', '50');
          expect(loadConfig().maxChildrenPerParent).toBe(50);
        });
      });

      describe('maxTreeSize', () => {
        it('should reject value below minimum (0)', () => {
          vi.stubEnv('AGENTGATE_MAX_TREE_SIZE', '0');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (1001)', () => {
          vi.stubEnv('AGENTGATE_MAX_TREE_SIZE', '1001');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary values (1 and 1000)', () => {
          vi.stubEnv('AGENTGATE_MAX_TREE_SIZE', '1');
          expect(loadConfig().maxTreeSize).toBe(1);

          resetConfig();
          vi.stubEnv('AGENTGATE_MAX_TREE_SIZE', '1000');
          expect(loadConfig().maxTreeSize).toBe(1000);
        });
      });

      describe('defaultTimeoutSeconds', () => {
        it('should reject value below minimum (59)', () => {
          vi.stubEnv('AGENTGATE_DEFAULT_TIMEOUT_SECONDS', '59');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (86401)', () => {
          vi.stubEnv('AGENTGATE_DEFAULT_TIMEOUT_SECONDS', '86401');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept minimum (60 = 1 minute)', () => {
          vi.stubEnv('AGENTGATE_DEFAULT_TIMEOUT_SECONDS', '60');
          const config = loadConfig();
          expect(config.defaultTimeoutSeconds).toBe(60);
        });

        it('should accept maximum (86400 = 24 hours)', () => {
          vi.stubEnv('AGENTGATE_DEFAULT_TIMEOUT_SECONDS', '86400');
          const config = loadConfig();
          expect(config.defaultTimeoutSeconds).toBe(86400);
        });
      });

      describe('pollIntervalMs', () => {
        it('should reject value below minimum (999)', () => {
          vi.stubEnv('AGENTGATE_POLL_INTERVAL_MS', '999');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (60001)', () => {
          vi.stubEnv('AGENTGATE_POLL_INTERVAL_MS', '60001');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary values (1000 and 60000)', () => {
          vi.stubEnv('AGENTGATE_POLL_INTERVAL_MS', '1000');
          expect(loadConfig().pollIntervalMs).toBe(1000);

          resetConfig();
          vi.stubEnv('AGENTGATE_POLL_INTERVAL_MS', '60000');
          expect(loadConfig().pollIntervalMs).toBe(60000);
        });
      });

      describe('leaseDurationSeconds', () => {
        it('should reject value below minimum (299)', () => {
          vi.stubEnv('AGENTGATE_LEASE_DURATION_SECONDS', '299');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (86401)', () => {
          vi.stubEnv('AGENTGATE_LEASE_DURATION_SECONDS', '86401');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary values (300 and 86400)', () => {
          vi.stubEnv('AGENTGATE_LEASE_DURATION_SECONDS', '300');
          expect(loadConfig().leaseDurationSeconds).toBe(300);

          resetConfig();
          vi.stubEnv('AGENTGATE_LEASE_DURATION_SECONDS', '86400');
          expect(loadConfig().leaseDurationSeconds).toBe(86400);
        });
      });

      describe('port', () => {
        it('should reject port 0', () => {
          vi.stubEnv('AGENTGATE_PORT', '0');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject port above 65535', () => {
          vi.stubEnv('AGENTGATE_PORT', '65536');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept valid ports', () => {
          vi.stubEnv('AGENTGATE_PORT', '80');
          expect(loadConfig().port).toBe(80);

          resetConfig();
          vi.stubEnv('AGENTGATE_PORT', '443');
          expect(loadConfig().port).toBe(443);

          resetConfig();
          vi.stubEnv('AGENTGATE_PORT', '65535');
          expect(loadConfig().port).toBe(65535);
        });
      });
    });

    describe('error messages', () => {
      it('should provide meaningful error for invalid maxConcurrentRuns', () => {
        vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '-1');
        expect(() => loadConfig()).toThrow(/validation/i);
      });
    });
  });

  describe('getConfig (singleton)', () => {
    it('should return cached config on subsequent calls', () => {
      const config1 = getConfig();
      const config2 = getConfig();
      expect(config1).toBe(config2);
    });

    it('should reload after resetConfig', () => {
      const config1 = getConfig();
      expect(config1.maxConcurrentRuns).toBe(5);

      vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '99');
      // Still returns cached value
      expect(getConfig().maxConcurrentRuns).toBe(5);

      // Reset and reload
      resetConfig();
      const config2 = getConfig();
      expect(config2.maxConcurrentRuns).toBe(99);
    });
  });

  describe('resetConfig', () => {
    it('should clear cached configuration', () => {
      // Load initial config
      getConfig();

      // Change env
      vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '77');

      // Reset
      resetConfig();

      // Should load new value
      expect(getConfig().maxConcurrentRuns).toBe(77);
    });
  });

  describe('getConfigLimits', () => {
    it('should return only limit-related configuration', () => {
      vi.stubEnv('AGENTGATE_MAX_CONCURRENT_RUNS', '25');
      vi.stubEnv('AGENTGATE_MAX_SPAWN_DEPTH', '5');
      vi.stubEnv('AGENTGATE_MAX_CHILDREN_PER_PARENT', '15');
      vi.stubEnv('AGENTGATE_MAX_TREE_SIZE', '200');
      vi.stubEnv('AGENTGATE_DEFAULT_TIMEOUT_SECONDS', '1800');

      const limits = getConfigLimits();

      expect(limits.maxConcurrentRuns).toBe(25);
      expect(limits.maxSpawnDepth).toBe(5);
      expect(limits.maxChildrenPerParent).toBe(15);
      expect(limits.maxTreeSize).toBe(200);
      expect(limits.defaultTimeoutSeconds).toBe(1800);

      // Should not include non-limit properties
      expect(limits).not.toHaveProperty('port');
      expect(limits).not.toHaveProperty('host');
      expect(limits).not.toHaveProperty('dataDir');
    });

    it('should use default values when no env vars set', () => {
      const limits = getConfigLimits();

      expect(limits.maxConcurrentRuns).toBe(5);
      expect(limits.maxSpawnDepth).toBe(3);
      expect(limits.maxChildrenPerParent).toBe(10);
      expect(limits.maxTreeSize).toBe(100);
      expect(limits.defaultTimeoutSeconds).toBe(3600);
    });
  });

  describe('SDK Configuration', () => {
    describe('defaults', () => {
      it('should return correct SDK defaults when no env vars set', () => {
        const config = loadConfig();

        expect(config.sdk.timeoutMs).toBe(300000);
        expect(config.sdk.enableSandbox).toBe(true);
        expect(config.sdk.logToolUse).toBe(true);
        expect(config.sdk.trackFileChanges).toBe(true);
        expect(config.sdk.maxTurns).toBe(100);
      });
    });

    describe('environment variable parsing', () => {
      it('should parse AGENTGATE_SDK_TIMEOUT_MS', () => {
        vi.stubEnv('AGENTGATE_SDK_TIMEOUT_MS', '600000');
        const config = loadConfig();
        expect(config.sdk.timeoutMs).toBe(600000);
      });

      it('should parse AGENTGATE_SDK_ENABLE_SANDBOX', () => {
        vi.stubEnv('AGENTGATE_SDK_ENABLE_SANDBOX', 'false');
        const config = loadConfig();
        expect(config.sdk.enableSandbox).toBe(false);
      });

      it('should parse AGENTGATE_SDK_LOG_TOOL_USE', () => {
        vi.stubEnv('AGENTGATE_SDK_LOG_TOOL_USE', 'false');
        const config = loadConfig();
        expect(config.sdk.logToolUse).toBe(false);
      });

      it('should parse AGENTGATE_SDK_TRACK_FILE_CHANGES', () => {
        vi.stubEnv('AGENTGATE_SDK_TRACK_FILE_CHANGES', 'false');
        const config = loadConfig();
        expect(config.sdk.trackFileChanges).toBe(false);
      });

      it('should parse AGENTGATE_SDK_MAX_TURNS', () => {
        vi.stubEnv('AGENTGATE_SDK_MAX_TURNS', '200');
        const config = loadConfig();
        expect(config.sdk.maxTurns).toBe(200);
      });
    });

    describe('validation', () => {
      describe('sdkTimeoutMs', () => {
        it('should reject value below minimum (9999)', () => {
          vi.stubEnv('AGENTGATE_SDK_TIMEOUT_MS', '9999');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (3600001)', () => {
          vi.stubEnv('AGENTGATE_SDK_TIMEOUT_MS', '3600001');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary values (10000 and 3600000)', () => {
          vi.stubEnv('AGENTGATE_SDK_TIMEOUT_MS', '10000');
          expect(loadConfig().sdk.timeoutMs).toBe(10000);

          resetConfig();
          vi.stubEnv('AGENTGATE_SDK_TIMEOUT_MS', '3600000');
          expect(loadConfig().sdk.timeoutMs).toBe(3600000);
        });
      });

      describe('sdkMaxTurns', () => {
        it('should reject value below minimum (0)', () => {
          vi.stubEnv('AGENTGATE_SDK_MAX_TURNS', '0');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (501)', () => {
          vi.stubEnv('AGENTGATE_SDK_MAX_TURNS', '501');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary values (1 and 500)', () => {
          vi.stubEnv('AGENTGATE_SDK_MAX_TURNS', '1');
          expect(loadConfig().sdk.maxTurns).toBe(1);

          resetConfig();
          vi.stubEnv('AGENTGATE_SDK_MAX_TURNS', '500');
          expect(loadConfig().sdk.maxTurns).toBe(500);
        });
      });
    });
  });

  describe('getSDKConfig', () => {
    it('should return SDK configuration', () => {
      vi.stubEnv('AGENTGATE_SDK_TIMEOUT_MS', '120000');
      vi.stubEnv('AGENTGATE_SDK_MAX_TURNS', '50');

      const sdkConfig = getSDKConfig();

      expect(sdkConfig.timeoutMs).toBe(120000);
      expect(sdkConfig.maxTurns).toBe(50);
      expect(sdkConfig.enableSandbox).toBe(true);
      expect(sdkConfig.logToolUse).toBe(true);
      expect(sdkConfig.trackFileChanges).toBe(true);
    });
  });

  describe('buildSDKDriverConfig', () => {
    it('should build driver config from environment config', () => {
      vi.stubEnv('AGENTGATE_SDK_TIMEOUT_MS', '180000');
      vi.stubEnv('AGENTGATE_SDK_ENABLE_SANDBOX', 'false');
      vi.stubEnv('AGENTGATE_SDK_MAX_TURNS', '75');
      vi.stubEnv('AGENTGATE_SDK_LOG_TOOL_USE', 'true');
      vi.stubEnv('AGENTGATE_SDK_TRACK_FILE_CHANGES', 'false');

      const driverConfig = buildSDKDriverConfig();

      expect(driverConfig.timeoutMs).toBe(180000);
      expect(driverConfig.enableSandbox).toBe(false);
      expect(driverConfig.maxTurns).toBe(75);
      expect(driverConfig.hooks.logToolUse).toBe(true);
      expect(driverConfig.hooks.trackFileChanges).toBe(false);
    });
  });

  describe('Queue Configuration (v0.2.22)', () => {
    describe('defaults', () => {
      it('should return correct queue defaults when no env vars set', () => {
        const config = loadConfig();

        expect(config.queue.useNewQueueSystem).toBe(false);
        expect(config.queue.shadowMode).toBe(false);
        expect(config.queue.rolloutPercent).toBe(0);
      });
    });

    describe('environment variable parsing', () => {
      it('should parse AGENTGATE_QUEUE_USE_NEW_SYSTEM', () => {
        vi.stubEnv('AGENTGATE_QUEUE_USE_NEW_SYSTEM', 'true');
        const config = loadConfig();
        expect(config.queue.useNewQueueSystem).toBe(true);
      });

      it('should parse AGENTGATE_QUEUE_SHADOW_MODE', () => {
        vi.stubEnv('AGENTGATE_QUEUE_SHADOW_MODE', 'true');
        const config = loadConfig();
        expect(config.queue.shadowMode).toBe(true);
      });

      it('should parse AGENTGATE_QUEUE_ROLLOUT_PERCENT', () => {
        vi.stubEnv('AGENTGATE_QUEUE_ROLLOUT_PERCENT', '50');
        const config = loadConfig();
        expect(config.queue.rolloutPercent).toBe(50);
      });
    });

    describe('validation', () => {
      describe('rolloutPercent', () => {
        it('should reject value below minimum (-1)', () => {
          vi.stubEnv('AGENTGATE_QUEUE_ROLLOUT_PERCENT', '-1');
          expect(() => loadConfig()).toThrow();
        });

        it('should reject value above maximum (101)', () => {
          vi.stubEnv('AGENTGATE_QUEUE_ROLLOUT_PERCENT', '101');
          expect(() => loadConfig()).toThrow();
        });

        it('should accept boundary values (0 and 100)', () => {
          vi.stubEnv('AGENTGATE_QUEUE_ROLLOUT_PERCENT', '0');
          expect(loadConfig().queue.rolloutPercent).toBe(0);

          resetConfig();
          vi.stubEnv('AGENTGATE_QUEUE_ROLLOUT_PERCENT', '100');
          expect(loadConfig().queue.rolloutPercent).toBe(100);
        });
      });
    });
  });

  describe('getQueueConfig', () => {
    it('should return queue configuration', () => {
      vi.stubEnv('AGENTGATE_QUEUE_USE_NEW_SYSTEM', 'true');
      vi.stubEnv('AGENTGATE_QUEUE_SHADOW_MODE', 'true');
      vi.stubEnv('AGENTGATE_QUEUE_ROLLOUT_PERCENT', '25');

      const queueConfig = getQueueConfig();

      expect(queueConfig.useNewQueueSystem).toBe(true);
      expect(queueConfig.shadowMode).toBe(true);
      expect(queueConfig.rolloutPercent).toBe(25);
    });
  });
});
