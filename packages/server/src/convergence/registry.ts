/**
 * Strategy Registry (v0.2.24)
 *
 * Registry for convergence strategy implementations.
 *
 * @module convergence/registry
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type { ConvergenceStrategyType } from '../types/index.js';
import type { ConvergenceStrategy, StrategyFactory } from './strategy.js';
import { createFixedStrategy } from './strategies/fixed.js';
import { createHybridStrategy } from './strategies/hybrid.js';
import { createRalphStrategy } from './strategies/ralph.js';
import { createManualStrategy } from './strategies/manual.js';
import { createAdaptiveStrategy } from './strategies/adaptive.js';

// ═══════════════════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when a strategy is not found
 */
export class StrategyNotFoundError extends Error {
  constructor(type: string) {
    super(`Convergence strategy not found: ${type}`);
    this.name = 'StrategyNotFoundError';
  }
}

/**
 * Error thrown when trying to register a duplicate strategy
 */
export class DuplicateStrategyError extends Error {
  constructor(type: string) {
    super(`Convergence strategy already registered: ${type}`);
    this.name = 'DuplicateStrategyError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strategy registry interface
 */
export interface StrategyRegistry {
  /** Register a strategy implementation */
  register(type: ConvergenceStrategyType, factory: StrategyFactory): void;

  /** Create strategy instance */
  create(type: ConvergenceStrategyType): ConvergenceStrategy;

  /** List available strategies */
  list(): ConvergenceStrategyType[];

  /** Check if strategy exists */
  has(type: ConvergenceStrategyType): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default strategy registry implementation
 */
class DefaultStrategyRegistry implements StrategyRegistry {
  private factories = new Map<ConvergenceStrategyType, StrategyFactory>();

  constructor() {
    // Register built-in strategies
    this.factories.set('fixed', createFixedStrategy);
    this.factories.set('hybrid', createHybridStrategy);
    this.factories.set('ralph', createRalphStrategy);
    this.factories.set('manual', createManualStrategy);
    this.factories.set('adaptive', createAdaptiveStrategy);
  }

  register(type: ConvergenceStrategyType, factory: StrategyFactory): void {
    if (this.factories.has(type)) {
      throw new DuplicateStrategyError(type);
    }
    this.factories.set(type, factory);
  }

  create(type: ConvergenceStrategyType): ConvergenceStrategy {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new StrategyNotFoundError(type);
    }
    return factory();
  }

  list(): ConvergenceStrategyType[] {
    return [...this.factories.keys()];
  }

  has(type: ConvergenceStrategyType): boolean {
    return this.factories.has(type);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default strategy registry singleton
 */
export const strategyRegistry: StrategyRegistry = new DefaultStrategyRegistry();

/**
 * Create a new strategy registry (for testing)
 */
export function createStrategyRegistry(): StrategyRegistry {
  return new DefaultStrategyRegistry();
}
