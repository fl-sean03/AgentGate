/**
 * Strategy Registry Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  StrategyRegistry,
  getStrategyRegistry,
  createStrategy,
  StrategyNotFoundError,
  DuplicateStrategyError,
} from '../../src/harness/strategy-registry.js';
import { FixedStrategy } from '../../src/harness/strategies/fixed-strategy.js';
import {
  LoopStrategyMode,
  CompletionDetection,
  type FixedStrategyConfig,
} from '../../src/types/harness-config.js';

describe('StrategyRegistry', () => {
  beforeEach(() => {
    StrategyRegistry.resetInstance();
  });

  afterEach(() => {
    StrategyRegistry.resetInstance();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const registry1 = StrategyRegistry.getInstance();
      const registry2 = StrategyRegistry.getInstance();

      expect(registry1).toBe(registry2);
    });

    it('should reset instance', () => {
      const registry1 = StrategyRegistry.getInstance();
      StrategyRegistry.resetInstance();
      const registry2 = StrategyRegistry.getInstance();

      expect(registry1).not.toBe(registry2);
    });
  });

  describe('built-in strategies', () => {
    it('should have fixed strategy registered', () => {
      const registry = StrategyRegistry.getInstance();

      expect(registry.has(LoopStrategyMode.FIXED)).toBe(true);
    });

    it('should have custom strategy registered', () => {
      const registry = StrategyRegistry.getInstance();

      expect(registry.has(LoopStrategyMode.CUSTOM)).toBe(true);
    });

    it('should list available strategies', () => {
      const registry = StrategyRegistry.getInstance();
      const strategies = registry.getAvailableStrategies();

      expect(strategies).toContain(LoopStrategyMode.FIXED);
      expect(strategies).toContain(LoopStrategyMode.CUSTOM);
    });

    it('should provide strategy descriptions', () => {
      const registry = StrategyRegistry.getInstance();
      const descriptions = registry.getStrategyDescriptions();

      const fixedDesc = descriptions.find(d => d.mode === LoopStrategyMode.FIXED);
      expect(fixedDesc).toBeDefined();
      expect(fixedDesc?.description).toContain('Fixed');

      const customDesc = descriptions.find(d => d.mode === LoopStrategyMode.CUSTOM);
      expect(customDesc).toBeDefined();
      expect(customDesc?.description).toContain('Custom');
    });
  });

  describe('register', () => {
    it('should register a new strategy', () => {
      const registry = StrategyRegistry.getInstance();

      // Use 'ralph' mode for testing custom registration (not yet built-in)
      registry.register(
        LoopStrategyMode.RALPH,
        () => new FixedStrategy(),
        'Test ralph strategy'
      );

      expect(registry.has(LoopStrategyMode.RALPH)).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      const registry = StrategyRegistry.getInstance();

      // Fixed is already registered
      expect(() =>
        registry.register(
          LoopStrategyMode.FIXED,
          () => new FixedStrategy(),
          'Duplicate fixed'
        )
      ).toThrow(DuplicateStrategyError);
    });

    it('should allow overwrite when specified', () => {
      const registry = StrategyRegistry.getInstance();

      registry.register(
        LoopStrategyMode.FIXED,
        () => new FixedStrategy(),
        'Overwritten fixed',
        true // allowOverwrite
      );

      const desc = registry.getRegistration(LoopStrategyMode.FIXED);
      expect(desc?.description).toBe('Overwritten fixed');
    });
  });

  describe('unregister', () => {
    it('should unregister a strategy', () => {
      const registry = StrategyRegistry.getInstance();

      // Register a ralph one first (not yet built-in)
      registry.register(
        LoopStrategyMode.RALPH,
        () => new FixedStrategy(),
        'Test ralph'
      );

      expect(registry.has(LoopStrategyMode.RALPH)).toBe(true);

      const result = registry.unregister(LoopStrategyMode.RALPH);

      expect(result).toBe(true);
      expect(registry.has(LoopStrategyMode.RALPH)).toBe(false);
    });

    it('should return false for non-existent strategy', () => {
      const registry = StrategyRegistry.getInstance();

      const result = registry.unregister('nonexistent' as LoopStrategyMode);

      expect(result).toBe(false);
    });
  });

  describe('createStrategy', () => {
    it('should create a fixed strategy from config', async () => {
      const registry = StrategyRegistry.getInstance();
      const config: FixedStrategyConfig = {
        mode: LoopStrategyMode.FIXED,
        maxIterations: 5,
        completionDetection: [CompletionDetection.VERIFICATION_PASS],
      };

      const strategy = await registry.createStrategy(config);

      expect(strategy).toBeDefined();
      expect(strategy.name).toBe('fixed');
      expect(strategy.mode).toBe(LoopStrategyMode.FIXED);
    });

    it('should throw for unknown strategy mode', async () => {
      const registry = StrategyRegistry.getInstance();
      const config = {
        mode: 'unknown' as LoopStrategyMode,
        maxIterations: 3,
        completionDetection: [],
      };

      await expect(registry.createStrategy(config)).rejects.toThrow(
        StrategyNotFoundError
      );
    });

    it('should include available strategies in error message', async () => {
      const registry = StrategyRegistry.getInstance();
      const config = {
        mode: 'unknown' as LoopStrategyMode,
        maxIterations: 3,
        completionDetection: [],
      };

      try {
        await registry.createStrategy(config);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StrategyNotFoundError);
        const strategyError = error as StrategyNotFoundError;
        expect(strategyError.availableStrategies).toContain(LoopStrategyMode.FIXED);
      }
    });
  });

  describe('getRegistration', () => {
    it('should return registration for existing strategy', () => {
      const registry = StrategyRegistry.getInstance();

      const registration = registry.getRegistration(LoopStrategyMode.FIXED);

      expect(registration).toBeDefined();
      expect(registration?.mode).toBe(LoopStrategyMode.FIXED);
      expect(registration?.factory).toBeDefined();
      expect(registration?.description).toBeDefined();
    });

    it('should return undefined for non-existent strategy', () => {
      const registry = StrategyRegistry.getInstance();

      const registration = registry.getRegistration('nonexistent' as LoopStrategyMode);

      expect(registration).toBeUndefined();
    });
  });
});

describe('getStrategyRegistry', () => {
  beforeEach(() => {
    StrategyRegistry.resetInstance();
  });

  afterEach(() => {
    StrategyRegistry.resetInstance();
  });

  it('should return the singleton instance', () => {
    const registry = getStrategyRegistry();

    expect(registry).toBeInstanceOf(StrategyRegistry);
    expect(registry).toBe(StrategyRegistry.getInstance());
  });
});

describe('createStrategy convenience function', () => {
  beforeEach(() => {
    StrategyRegistry.resetInstance();
  });

  afterEach(() => {
    StrategyRegistry.resetInstance();
  });

  it('should create strategy using global registry', async () => {
    const config: FixedStrategyConfig = {
      mode: LoopStrategyMode.FIXED,
      maxIterations: 3,
      completionDetection: [CompletionDetection.VERIFICATION_PASS],
    };

    const strategy = await createStrategy(config);

    expect(strategy).toBeDefined();
    expect(strategy.name).toBe('fixed');
  });
});

describe('StrategyNotFoundError', () => {
  it('should contain strategy mode and available strategies', () => {
    const error = new StrategyNotFoundError('unknown', ['fixed', 'ralph']);

    expect(error.strategyMode).toBe('unknown');
    expect(error.availableStrategies).toEqual(['fixed', 'ralph']);
    expect(error.message).toContain('unknown');
    expect(error.message).toContain('fixed');
    expect(error.message).toContain('ralph');
    expect(error.name).toBe('StrategyNotFoundError');
  });
});

describe('DuplicateStrategyError', () => {
  it('should contain strategy mode', () => {
    const error = new DuplicateStrategyError('fixed');

    expect(error.strategyMode).toBe('fixed');
    expect(error.message).toContain('fixed');
    expect(error.message).toContain('already registered');
    expect(error.name).toBe('DuplicateStrategyError');
  });
});
