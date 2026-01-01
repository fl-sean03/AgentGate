/**
 * Custom Strategy
 *
 * A loop strategy that loads user-defined strategy modules dynamically.
 * Enables advanced users to define their own loop control logic without
 * modifying AgentGate core.
 *
 * Strategies are loaded from a specified module path and must implement
 * the LoopStrategy interface.
 */

import type {
  LoopStrategy,
  LoopDecision,
  LoopProgress,
  LoopDetectionData,
  LoopContext,
} from '../../types/loop-strategy.js';
import {
  LoopStrategyMode,
  type CustomStrategyConfig,
  type LoopStrategyConfig,
} from '../../types/harness-config.js';
import { BaseStrategy } from './base-strategy.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('custom-strategy');

/**
 * Error thrown when a custom strategy module cannot be loaded.
 */
export class CustomStrategyLoadError extends Error {
  constructor(
    public readonly modulePath: string,
    public readonly cause: Error | string
  ) {
    const message = typeof cause === 'string' ? cause : cause.message;
    super(`Failed to load custom strategy from '${modulePath}': ${message}`);
    this.name = 'CustomStrategyLoadError';
  }
}

/**
 * Error thrown when a custom strategy module does not export the expected strategy.
 */
export class CustomStrategyNotFoundError extends Error {
  constructor(
    public readonly modulePath: string,
    public readonly strategyName: string,
    public readonly availableExports: string[]
  ) {
    super(
      `Strategy '${strategyName}' not found in module '${modulePath}'. ` +
        `Available exports: ${availableExports.length > 0 ? availableExports.join(', ') : 'none'}`
    );
    this.name = 'CustomStrategyNotFoundError';
  }
}

/**
 * Error thrown when a custom strategy does not implement the required interface.
 */
export class CustomStrategyInvalidError extends Error {
  constructor(
    public readonly modulePath: string,
    public readonly strategyName: string,
    public readonly missingMethods: string[]
  ) {
    super(
      `Strategy '${strategyName}' from '${modulePath}' does not implement LoopStrategy interface. ` +
        `Missing: ${missingMethods.join(', ')}`
    );
    this.name = 'CustomStrategyInvalidError';
  }
}

/**
 * Required methods for a valid LoopStrategy implementation.
 */
const REQUIRED_STRATEGY_METHODS = [
  'initialize',
  'onLoopStart',
  'onIterationStart',
  'shouldContinue',
  'onIterationEnd',
  'onLoopEnd',
  'getProgress',
  'detectLoop',
  'reset',
] as const;

/**
 * Custom loop strategy that delegates to a user-defined strategy module.
 *
 * The custom strategy:
 * 1. Loads a strategy module from the specified path during initialization
 * 2. Validates the module exports a valid LoopStrategy implementation
 * 3. Delegates all LoopStrategy method calls to the loaded strategy
 */
export class CustomStrategy extends BaseStrategy {
  readonly name = 'custom';
  readonly mode = LoopStrategyMode.CUSTOM;

  private delegateStrategy: LoopStrategy | null = null;
  private customConfig: CustomStrategyConfig | null = null;

  /**
   * Initialize the custom strategy by loading the delegate module.
   *
   * @param config - The loop strategy configuration
   * @throws CustomStrategyLoadError if the module cannot be loaded
   * @throws CustomStrategyNotFoundError if the strategy is not found in the module
   * @throws CustomStrategyInvalidError if the strategy does not implement the interface
   */
  override async initialize(config: LoopStrategyConfig): Promise<void> {
    await super.initialize(config);

    if (config.mode !== LoopStrategyMode.CUSTOM) {
      throw new Error(`CustomStrategy requires 'custom' mode, got '${config.mode}'`);
    }

    this.customConfig = config;
    await this.loadDelegateStrategy();
  }

  /**
   * Load the delegate strategy from the configured module path.
   */
  private async loadDelegateStrategy(): Promise<void> {
    if (!this.customConfig) {
      throw new Error('CustomStrategy not initialized');
    }

    const { strategyName, params } = this.customConfig;

    logger.debug(
      { strategyName, params },
      'Loading custom strategy'
    );

    // Load the module dynamically
    let module: Record<string, unknown>;
    try {
      module = await import(strategyName);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ strategyName, error: err.message }, 'Failed to load custom strategy module');
      throw new CustomStrategyLoadError(strategyName, err);
    }

    // Find the strategy export
    const strategyExport = this.findStrategyExport(module, strategyName);

    // Instantiate the strategy
    const strategy = this.instantiateStrategy(strategyExport, strategyName, params);

    // Validate the strategy interface
    this.validateStrategyInterface(strategy, strategyName);

    // Initialize the delegate strategy with the custom config
    await strategy.initialize(this.customConfig);

    this.delegateStrategy = strategy;

    logger.info(
      { strategyName, delegateName: strategy.name },
      'Custom strategy loaded and initialized'
    );
  }

  /**
   * Find the strategy export from the loaded module.
   */
  private findStrategyExport(
    module: Record<string, unknown>,
    strategyName: string
  ): unknown {
    // Check for default export
    if ('default' in module) {
      return module.default;
    }

    // Check for named export matching strategy name or common names
    const exportNames = Object.keys(module);
    const possibleNames = [
      'Strategy',
      'CustomStrategy',
      'LoopStrategy',
      strategyName.split('/').pop()?.replace(/\.(ts|js)$/, ''),
    ].filter(Boolean);

    for (const name of possibleNames) {
      if (name && name in module) {
        return module[name];
      }
    }

    // Return the first export that looks like a class/function
    for (const key of exportNames) {
      const value = module[key];
      if (typeof value === 'function') {
        return value;
      }
    }

    throw new CustomStrategyNotFoundError(strategyName, 'default', exportNames);
  }

  /**
   * Instantiate the strategy from the export.
   */
  private instantiateStrategy(
    strategyExport: unknown,
    strategyName: string,
    params: Record<string, unknown>
  ): LoopStrategy {
    // If it's already an instance, return it
    if (this.isLoopStrategyInstance(strategyExport)) {
      return strategyExport as LoopStrategy;
    }

    // If it's a constructor/class, instantiate it
    if (typeof strategyExport === 'function') {
      try {
        // Try as constructor
        const StrategyClass = strategyExport as new (params?: Record<string, unknown>) => LoopStrategy;
        return new StrategyClass(params);
      } catch (error) {
        // Try as factory function
        try {
          const factory = strategyExport as (params?: Record<string, unknown>) => LoopStrategy;
          const result = factory(params);
          if (this.isLoopStrategyInstance(result)) {
            return result;
          }
        } catch {
          // Fall through to error
        }

        const err = error instanceof Error ? error : new Error(String(error));
        throw new CustomStrategyLoadError(
          strategyName,
          `Failed to instantiate strategy: ${err.message}`
        );
      }
    }

    throw new CustomStrategyLoadError(
      strategyName,
      `Export is not a valid strategy class, constructor, or instance`
    );
  }

  /**
   * Check if a value looks like a LoopStrategy instance.
   */
  private isLoopStrategyInstance(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const obj = value as Record<string, unknown>;
    return (
      typeof obj.name === 'string' &&
      typeof obj.mode === 'string' &&
      typeof obj.shouldContinue === 'function'
    );
  }

  /**
   * Validate that the strategy implements the required interface.
   */
  private validateStrategyInterface(strategy: unknown, strategyName: string): void {
    const missingMethods: string[] = [];

    for (const method of REQUIRED_STRATEGY_METHODS) {
      if (typeof (strategy as Record<string, unknown>)[method] !== 'function') {
        missingMethods.push(method);
      }
    }

    if (missingMethods.length > 0) {
      throw new CustomStrategyInvalidError(strategyName, strategyName, missingMethods);
    }
  }

  /**
   * Ensure the delegate strategy is loaded.
   */
  private ensureDelegateLoaded(): LoopStrategy {
    if (!this.delegateStrategy) {
      throw new Error('CustomStrategy delegate not loaded. Call initialize() first.');
    }
    return this.delegateStrategy;
  }

  // ===============================
  // Delegated LoopStrategy Methods
  // ===============================

  /**
   * Called before the first iteration - delegates to loaded strategy.
   */
  override async onLoopStart(context: LoopContext): Promise<void> {
    const delegate = this.ensureDelegateLoaded();
    logger.debug({ workOrderId: context.workOrderId }, 'Delegating onLoopStart');
    await delegate.onLoopStart(context);
  }

  /**
   * Called before each iteration - delegates to loaded strategy.
   */
  override async onIterationStart(context: LoopContext): Promise<void> {
    const delegate = this.ensureDelegateLoaded();
    logger.debug(
      { workOrderId: context.workOrderId, iteration: context.state.iteration },
      'Delegating onIterationStart'
    );
    await delegate.onIterationStart(context);
  }

  /**
   * Determine whether to continue the loop - delegates to loaded strategy.
   */
  override async shouldContinue(context: LoopContext): Promise<LoopDecision> {
    const delegate = this.ensureDelegateLoaded();
    logger.debug(
      { workOrderId: context.workOrderId, iteration: context.state.iteration },
      'Delegating shouldContinue'
    );

    try {
      const decision = await delegate.shouldContinue(context);
      logger.debug(
        {
          workOrderId: context.workOrderId,
          iteration: context.state.iteration,
          decision: decision.action,
          reason: decision.reason,
        },
        'Delegate shouldContinue returned'
      );
      return decision;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(
        { workOrderId: context.workOrderId, error: err.message },
        'Delegate shouldContinue threw error'
      );
      throw new CustomStrategyLoadError(
        this.customConfig?.strategyName ?? 'unknown',
        `shouldContinue failed: ${err.message}`
      );
    }
  }

  /**
   * Called after each iteration completes - delegates to loaded strategy.
   */
  override async onIterationEnd(context: LoopContext, decision: LoopDecision): Promise<void> {
    const delegate = this.ensureDelegateLoaded();
    logger.debug(
      { workOrderId: context.workOrderId, iteration: context.state.iteration },
      'Delegating onIterationEnd'
    );
    await delegate.onIterationEnd(context, decision);
  }

  /**
   * Called when the loop terminates - delegates to loaded strategy.
   */
  override async onLoopEnd(context: LoopContext, finalDecision: LoopDecision): Promise<void> {
    const delegate = this.ensureDelegateLoaded();
    logger.debug(
      { workOrderId: context.workOrderId, finalAction: finalDecision.action },
      'Delegating onLoopEnd'
    );
    await delegate.onLoopEnd(context, finalDecision);
  }

  /**
   * Get current progress estimate - delegates to loaded strategy.
   */
  override getProgress(context: LoopContext): LoopProgress {
    const delegate = this.ensureDelegateLoaded();
    return delegate.getProgress(context);
  }

  /**
   * Detect if the loop is stuck in a cycle - delegates to loaded strategy.
   */
  override detectLoop(context: LoopContext): LoopDetectionData {
    const delegate = this.ensureDelegateLoaded();
    return delegate.detectLoop(context);
  }

  /**
   * Reset strategy state - resets both custom and delegate strategy.
   */
  override reset(): void {
    super.reset();
    if (this.delegateStrategy) {
      this.delegateStrategy.reset();
    }
    logger.debug('CustomStrategy reset');
  }

  /**
   * Get the loaded delegate strategy (for testing).
   */
  getDelegateStrategy(): LoopStrategy | null {
    return this.delegateStrategy;
  }
}

/**
 * Factory function to create a CustomStrategy instance.
 */
export function createCustomStrategy(): CustomStrategy {
  return new CustomStrategy();
}
