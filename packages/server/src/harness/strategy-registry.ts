/**
 * Strategy Registry
 *
 * Factory pattern registry for creating loop strategies.
 * Manages strategy registration and instantiation.
 */

import type { LoopStrategy, LoopStrategyFactory } from '../types/loop-strategy.js';
import type { LoopStrategyConfig, LoopStrategyMode } from '../types/harness-config.js';
import { LoopStrategyMode as Modes } from '../types/harness-config.js';
import { FixedStrategy } from './strategies/fixed-strategy.js';
import { HybridStrategy } from './strategies/hybrid-strategy.js';
import { RalphStrategy } from './strategies/ralph-strategy.js';
import { CustomStrategy } from './strategies/custom-strategy.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('strategy-registry');

/**
 * Error thrown when a strategy is not found in the registry.
 */
export class StrategyNotFoundError extends Error {
  constructor(
    public readonly strategyMode: string,
    public readonly availableStrategies: string[]
  ) {
    super(
      `Strategy '${strategyMode}' not found. Available strategies: ${availableStrategies.join(', ')}`
    );
    this.name = 'StrategyNotFoundError';
  }
}

/**
 * Error thrown when attempting to register a duplicate strategy.
 */
export class DuplicateStrategyError extends Error {
  constructor(public readonly strategyMode: string) {
    super(`Strategy '${strategyMode}' is already registered`);
    this.name = 'DuplicateStrategyError';
  }
}

/**
 * Strategy Registration entry.
 */
interface StrategyRegistration {
  mode: LoopStrategyMode;
  factory: LoopStrategyFactory;
  description: string;
}

/**
 * Strategy Registry
 *
 * Central registry for loop strategies using the factory pattern.
 * Supports:
 * - Built-in strategies (fixed, ralph, hybrid)
 * - Custom strategy registration
 * - Strategy instantiation from config
 */
export class StrategyRegistry {
  private static instance: StrategyRegistry | null = null;
  private readonly strategies: Map<LoopStrategyMode, StrategyRegistration> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): StrategyRegistry {
    if (!StrategyRegistry.instance) {
      StrategyRegistry.instance = new StrategyRegistry();
      StrategyRegistry.instance.registerBuiltInStrategies();
    }
    return StrategyRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance(): void {
    StrategyRegistry.instance = null;
  }

  /**
   * Register a strategy factory.
   *
   * @param mode - The strategy mode identifier
   * @param factory - Factory function to create the strategy
   * @param description - Human-readable description
   * @param allowOverwrite - If true, allows overwriting existing registration
   */
  register(
    mode: LoopStrategyMode,
    factory: LoopStrategyFactory,
    description: string,
    allowOverwrite = false
  ): void {
    if (this.strategies.has(mode) && !allowOverwrite) {
      throw new DuplicateStrategyError(mode);
    }

    this.strategies.set(mode, { mode, factory, description });

    logger.debug({ mode, description }, 'Strategy registered');
  }

  /**
   * Unregister a strategy.
   *
   * @param mode - The strategy mode to unregister
   * @returns true if the strategy was unregistered, false if not found
   */
  unregister(mode: LoopStrategyMode): boolean {
    const deleted = this.strategies.delete(mode);
    if (deleted) {
      logger.debug({ mode }, 'Strategy unregistered');
    }
    return deleted;
  }

  /**
   * Create a strategy instance from configuration.
   *
   * @param config - The loop strategy configuration
   * @returns An initialized LoopStrategy instance
   */
  async createStrategy(config: LoopStrategyConfig): Promise<LoopStrategy> {
    const registration = this.strategies.get(config.mode);

    if (!registration) {
      throw new StrategyNotFoundError(
        config.mode,
        this.getAvailableStrategies()
      );
    }

    const strategy = registration.factory(config);
    await strategy.initialize(config);

    logger.info({ mode: config.mode }, 'Strategy created and initialized');

    return strategy;
  }

  /**
   * Check if a strategy is registered.
   */
  has(mode: LoopStrategyMode): boolean {
    return this.strategies.has(mode);
  }

  /**
   * Get the list of available strategy modes.
   */
  getAvailableStrategies(): LoopStrategyMode[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get strategy descriptions for documentation/help.
   */
  getStrategyDescriptions(): Array<{ mode: LoopStrategyMode; description: string }> {
    return Array.from(this.strategies.values()).map(({ mode, description }) => ({
      mode,
      description,
    }));
  }

  /**
   * Get a strategy registration by mode.
   */
  getRegistration(mode: LoopStrategyMode): StrategyRegistration | undefined {
    return this.strategies.get(mode);
  }

  /**
   * Register all built-in strategies.
   */
  private registerBuiltInStrategies(): void {
    // Fixed strategy
    this.register(
      Modes.FIXED,
      () => new FixedStrategy(),
      'Fixed iteration count strategy. Runs exactly N iterations unless early termination conditions are met.'
    );

    // Hybrid strategy (recommended default)
    this.register(
      Modes.HYBRID,
      () => new HybridStrategy(),
      'Hybrid strategy combining progress tracking with multiple completion criteria. Recommended default for most tasks.'
    );

    // Ralph strategy (Geoffrey Huntley's Ralph Wiggum technique)
    this.register(
      Modes.RALPH,
      () => new RalphStrategy(),
      'Ralph Wiggum strategy. Loops until agent signals completion or output similarity loop is detected.'
    );

    // Custom strategy
    this.register(
      Modes.CUSTOM,
      () => new CustomStrategy(),
      'Custom strategy that loads user-defined strategy modules dynamically.'
    );

    // All built-in strategies registered

    logger.debug(
      { strategies: this.getAvailableStrategies() },
      'Built-in strategies registered'
    );
  }
}

/**
 * Get the global strategy registry instance.
 */
export function getStrategyRegistry(): StrategyRegistry {
  return StrategyRegistry.getInstance();
}

/**
 * Create a strategy from configuration using the global registry.
 *
 * Convenience function for creating strategies without directly
 * accessing the registry.
 */
export async function createStrategy(config: LoopStrategyConfig): Promise<LoopStrategy> {
  return getStrategyRegistry().createStrategy(config);
}
