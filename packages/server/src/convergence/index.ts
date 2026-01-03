/**
 * Convergence Module (v0.2.24)
 *
 * Provides convergence policies and controller for determining when
 * the agent has reached the desired state.
 *
 * @module convergence
 */

// Controller
export {
  type BuildResult,
  type ConvergenceContext,
  type ConvergenceController,
  DefaultConvergenceController,
  createConvergenceController,
} from './controller.js';

// Strategy
export {
  type ConvergenceStrategy,
  type StrategyFactory,
  BaseConvergenceStrategy,
} from './strategy.js';

// Progress Tracker
export {
  type ProgressTracker,
  DefaultProgressTracker,
  createProgressTracker,
} from './progress.js';

// Registry
export {
  type StrategyRegistry,
  StrategyNotFoundError,
  DuplicateStrategyError,
  strategyRegistry,
  createStrategyRegistry,
} from './registry.js';

// Strategies
export { FixedStrategy, createFixedStrategy } from './strategies/fixed.js';
export { HybridStrategy, createHybridStrategy } from './strategies/hybrid.js';
export { RalphStrategy, createRalphStrategy } from './strategies/ralph.js';
export { ManualStrategy, createManualStrategy } from './strategies/manual.js';
export { AdaptiveStrategy, createAdaptiveStrategy } from './strategies/adaptive.js';
