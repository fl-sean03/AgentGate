/**
 * Config Resolver Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import {
  resolveHarnessConfig,
  resolveInheritance,
  mergeConfigs,
  applyDefaults,
  applyCLIOverrides,
  cliOptionsToOverrides,
  computeConfigHash,
  createDefaultConfig,
  CircularInheritanceError,
  InheritanceDepthError,
} from '../../src/harness/config-resolver.js';
import {
  type HarnessConfig,
  LoopStrategyMode,
  GitOperationMode,
} from '../../src/types/harness-config.js';
import { HARNESS_DIR } from '../../src/harness/config-loader.js';

describe('Config Resolver', () => {
  const testDir = path.join(os.tmpdir(), 'agentgate-test-resolver');

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('mergeConfigs', () => {
    it('should return empty config for empty array', () => {
      const result = mergeConfigs([]);
      expect(result.version).toBe('1.0');
    });

    it('should return single config unchanged', () => {
      const config: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 5,
          completionDetection: ['verification_pass'],
        },
      };

      const result = mergeConfigs([config]);
      expect(result).toEqual(config);
    });

    it('should merge objects recursively', () => {
      const parent: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.HYBRID,
          baseIterations: 3,
          maxBonusIterations: 2,
          progressThreshold: 0.1,
          completionDetection: ['verification_pass'],
          progressTracking: 'git_history',
        },
        verification: {
          skipLevels: [],
          timeoutMs: 300000,
        },
      };

      const child: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.HYBRID,
          baseIterations: 5,
          maxBonusIterations: 2,
          progressThreshold: 0.1,
          completionDetection: ['verification_pass'],
          progressTracking: 'git_history',
        },
      };

      const result = mergeConfigs([parent, child]);

      // Loop strategy should be merged with child's baseIterations
      expect(result.loopStrategy.mode).toBe(LoopStrategyMode.HYBRID);
      if (result.loopStrategy.mode === LoopStrategyMode.HYBRID) {
        expect(result.loopStrategy.baseIterations).toBe(5);
      }

      // Verification should be preserved from parent
      expect(result.verification?.timeoutMs).toBe(300000);
    });

    it('should replace arrays (not merge)', () => {
      const parent: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 3,
          completionDetection: ['verification_pass', 'no_changes'],
        },
      };

      const child: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 3,
          completionDetection: ['ci_pass'],
        },
      };

      const result = mergeConfigs([parent, child]);

      // Array should be replaced, not merged
      expect(result.loopStrategy.completionDetection).toEqual(['ci_pass']);
    });

    it('should merge multiple configs in order', () => {
      const config1: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 1,
          completionDetection: [],
        },
      };

      const config2: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 2,
          completionDetection: [],
        },
      };

      const config3: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 3,
          completionDetection: [],
        },
      };

      const result = mergeConfigs([config1, config2, config3]);

      // Latest value should win
      expect(result.loopStrategy.mode).toBe(LoopStrategyMode.FIXED);
      if (result.loopStrategy.mode === LoopStrategyMode.FIXED) {
        expect(result.loopStrategy.maxIterations).toBe(3);
      }
    });
  });

  describe('applyDefaults', () => {
    it('should apply all defaults for minimal config', () => {
      const config: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 3,
          completionDetection: [],
        },
      };

      const resolved = applyDefaults(config);

      expect(resolved.version).toBe('1.0');
      expect(resolved.agentDriver).toBeDefined();
      expect(resolved.agentDriver.type).toBe('claude-code-subscription');
      expect(resolved.verification).toBeDefined();
      expect(resolved.verification.timeoutMs).toBe(300000);
      expect(resolved.gitOps).toBeDefined();
      expect(resolved.gitOps.mode).toBe(GitOperationMode.LOCAL);
      expect(resolved.executionLimits).toBeDefined();
      expect(resolved.executionLimits.maxWallClockSeconds).toBe(3600);
    });

    it('should preserve provided values', () => {
      const config: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.RALPH,
          minIterations: 2,
          maxIterations: 15,
          convergenceThreshold: 0.1,
          windowSize: 5,
          completionDetection: ['agent_signal'],
          progressTracking: 'verification_levels',
        },
        executionLimits: {
          maxWallClockSeconds: 7200,
        },
      };

      const resolved = applyDefaults(config);

      expect(resolved.loopStrategy.mode).toBe(LoopStrategyMode.RALPH);
      expect(resolved.executionLimits.maxWallClockSeconds).toBe(7200);
    });
  });

  describe('applyCLIOverrides', () => {
    it('should apply simple overrides', () => {
      const config: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 3,
          completionDetection: [],
        },
      };

      const overrides: Partial<HarnessConfig> = {
        executionLimits: {
          maxWallClockSeconds: 7200,
        },
      };

      const result = applyCLIOverrides(config, overrides);

      expect(result.executionLimits?.maxWallClockSeconds).toBe(7200);
    });

    it('should deeply merge overrides', () => {
      const config: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.HYBRID,
          baseIterations: 3,
          maxBonusIterations: 2,
          progressThreshold: 0.1,
          completionDetection: ['verification_pass'],
          progressTracking: 'git_history',
        },
        verification: {
          timeoutMs: 300000,
        },
      };

      const overrides: Partial<HarnessConfig> = {
        verification: {
          skipLevels: ['lint'],
        },
      };

      const result = applyCLIOverrides(config, overrides);

      // Original timeout should be preserved
      expect(result.verification?.timeoutMs).toBe(300000);
      // Override should be applied
      expect(result.verification?.skipLevels).toEqual(['lint']);
    });
  });

  describe('cliOptionsToOverrides', () => {
    it('should map maxIterations', () => {
      const overrides = cliOptionsToOverrides({ maxIterations: 10 });
      const loopStrategy = overrides.loopStrategy as Record<string, unknown>;
      expect(loopStrategy.maxIterations).toBe(10);
    });

    it('should map maxTime', () => {
      const overrides = cliOptionsToOverrides({ maxTime: 7200 });
      expect(overrides.executionLimits?.maxWallClockSeconds).toBe(7200);
    });

    it('should map agent type', () => {
      const overrides = cliOptionsToOverrides({ agent: 'claude-agent-sdk' });
      expect(overrides.agentDriver?.type).toBe('claude-agent-sdk');
    });

    it('should map loopStrategy', () => {
      const overrides = cliOptionsToOverrides({ loopStrategy: 'ralph' });
      const loopStrategy = overrides.loopStrategy as Record<string, unknown>;
      expect(loopStrategy.mode).toBe('ralph');
    });

    it('should handle combined options', () => {
      const overrides = cliOptionsToOverrides({
        maxIterations: 5,
        maxTime: 1800,
        loopStrategy: 'fixed',
      });

      const loopStrategy = overrides.loopStrategy as Record<string, unknown>;
      expect(loopStrategy.maxIterations).toBe(5);
      expect(loopStrategy.mode).toBe('fixed');
      expect(overrides.executionLimits?.maxWallClockSeconds).toBe(1800);
    });
  });

  describe('computeConfigHash', () => {
    it('should produce deterministic hash', () => {
      const config = createDefaultConfig();

      const hash1 = computeConfigHash(config);
      const hash2 = computeConfigHash(config);

      expect(hash1).toBe(hash2);
    });

    it('should produce 16-character hex hash', () => {
      const config = createDefaultConfig();
      const hash = computeConfigHash(config);

      expect(hash).toHaveLength(16);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('should produce different hashes for different configs', () => {
      const config1 = createDefaultConfig();
      const config2 = createDefaultConfig();
      config2.executionLimits.maxWallClockSeconds = 9999;

      const hash1 = computeConfigHash(config1);
      const hash2 = computeConfigHash(config2);

      expect(hash1).not.toBe(hash2);
    });

    it('should be order-independent for object keys', () => {
      // Create two configs with same values but potentially different key order
      const config = createDefaultConfig();

      // Stringify and parse to potentially change key order
      const configCopy = JSON.parse(JSON.stringify(config));

      const hash1 = computeConfigHash(config);
      const hash2 = computeConfigHash(configCopy);

      expect(hash1).toBe(hash2);
    });
  });

  describe('createDefaultConfig', () => {
    it('should return valid resolved config', () => {
      const config = createDefaultConfig();

      expect(config.version).toBe('1.0');
      expect(config.loopStrategy).toBeDefined();
      expect(config.agentDriver).toBeDefined();
      expect(config.verification).toBeDefined();
      expect(config.gitOps).toBeDefined();
      expect(config.executionLimits).toBeDefined();
    });

    it('should have all required fields populated', () => {
      const config = createDefaultConfig();

      // Check all required fields are present
      expect(config.agentDriver.type).toBeDefined();
      expect(config.verification.timeoutMs).toBeDefined();
      expect(config.gitOps.mode).toBeDefined();
      expect(config.executionLimits.maxWallClockSeconds).toBeDefined();
    });
  });

  describe('resolveHarnessConfig', () => {
    it('should resolve with defaults when no options provided', async () => {
      const resolved = await resolveHarnessConfig();

      expect(resolved.version).toBe('1.0');
      expect(resolved.agentDriver).toBeDefined();
      expect(resolved.verification).toBeDefined();
      expect(resolved.gitOps).toBeDefined();
      expect(resolved.executionLimits).toBeDefined();
    });

    it('should apply CLI overrides with highest priority', async () => {
      const resolved = await resolveHarnessConfig({
        cliOverrides: {
          executionLimits: {
            maxWallClockSeconds: 1234,
          },
        },
      });

      expect(resolved.executionLimits.maxWallClockSeconds).toBe(1234);
    });
  });
});

describe('resolveInheritance', () => {
  it('should return single config for no extends', async () => {
    const config: HarnessConfig = {
      version: '1.0',
      loopStrategy: {
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [],
      },
    };

    const chain = await resolveInheritance(config);

    expect(chain).toHaveLength(1);
    expect(chain[0]).toEqual(config);
  });

  it('should detect circular inheritance via same profile name', async () => {
    // This tests that if a config has its own name in the extends chain,
    // it will be detected as circular when we encounter it again
    const config: HarnessConfig = {
      version: '1.0',
      loopStrategy: {
        mode: LoopStrategyMode.FIXED,
        maxIterations: 3,
        completionDetection: [],
      },
      metadata: {
        name: 'self-referencing-profile',
      },
    };

    // Call with a chain that already contains this profile name
    await expect(
      resolveInheritance(config, ['self-referencing-profile'])
    ).rejects.toThrow(CircularInheritanceError);
  });
});

describe('CircularInheritanceError', () => {
  it('should contain chain information', () => {
    const error = new CircularInheritanceError(
      ['parent', 'child'],
      'parent'
    );

    expect(error.chain).toEqual(['parent', 'child']);
    expect(error.duplicateProfile).toBe('parent');
    expect(error.message).toContain('parent');
    expect(error.message).toContain('child');
    expect(error.name).toBe('CircularInheritanceError');
  });
});

describe('InheritanceDepthError', () => {
  it('should contain depth information', () => {
    const chain = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const error = new InheritanceDepthError(chain, 10);

    expect(error.chain).toEqual(chain);
    expect(error.maxDepth).toBe(10);
    expect(error.message).toContain('10');
    expect(error.name).toBe('InheritanceDepthError');
  });
});
