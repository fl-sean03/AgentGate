/**
 * Gate Runner Registry (v0.2.24)
 *
 * Registry for gate runner implementations.
 *
 * @module gate/registry
 */

import type { GateCheckType, GateCheck } from '../types/index.js';
import type { GateRunner, ValidationResult } from './runner-types.js';
import { createVerificationGateRunner } from './runners/verification.js';
import { createGitHubActionsGateRunner } from './runners/github-actions.js';
import { createCustomCommandGateRunner } from './runners/custom.js';
import { createConvergenceGateRunner } from './runners/convergence.js';
import { createApprovalGateRunner } from './runners/approval.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('gate-registry');

/**
 * Factory function type for creating gate runners
 */
export type GateRunnerFactory = () => GateRunner;

/**
 * Registry for gate runner implementations
 */
export class GateRunnerRegistry {
  private factories: Map<GateCheckType, GateRunnerFactory> = new Map();
  private instances: Map<GateCheckType, GateRunner> = new Map();

  /**
   * Register a gate runner factory
   * @param type Gate check type
   * @param factory Factory function to create runner
   */
  register(type: GateCheckType, factory: GateRunnerFactory): void {
    if (this.factories.has(type)) {
      log.warn({ type }, 'Overwriting existing gate runner registration');
    }
    this.factories.set(type, factory);
    // Clear cached instance
    this.instances.delete(type);
    log.debug({ type }, 'Gate runner registered');
  }

  /**
   * Unregister a gate runner
   * @param type Gate check type
   */
  unregister(type: GateCheckType): boolean {
    const existed = this.factories.delete(type);
    this.instances.delete(type);
    if (existed) {
      log.debug({ type }, 'Gate runner unregistered');
    }
    return existed;
  }

  /**
   * Get a gate runner instance (cached)
   * @param type Gate check type
   * @returns Gate runner instance or undefined
   */
  get(type: GateCheckType): GateRunner | undefined {
    // Return cached instance if available
    const cached = this.instances.get(type);
    if (cached) {
      return cached;
    }

    // Create new instance from factory
    const factory = this.factories.get(type);
    if (!factory) {
      log.warn({ type }, 'No gate runner registered for type');
      return undefined;
    }

    const instance = factory();
    this.instances.set(type, instance);
    return instance;
  }

  /**
   * Create a new gate runner instance (not cached)
   * @param type Gate check type
   * @returns New gate runner instance or undefined
   */
  create(type: GateCheckType): GateRunner | undefined {
    const factory = this.factories.get(type);
    if (!factory) {
      log.warn({ type }, 'No gate runner registered for type');
      return undefined;
    }
    return factory();
  }

  /**
   * Check if a gate runner is registered
   * @param type Gate check type
   */
  has(type: GateCheckType): boolean {
    return this.factories.has(type);
  }

  /**
   * Get all registered gate check types
   */
  getTypes(): GateCheckType[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Validate a gate check configuration
   * @param check Gate check configuration
   * @returns Validation result
   */
  validate(check: GateCheck): ValidationResult {
    const runner = this.get(check.type);
    if (!runner) {
      return { valid: false, error: `No runner registered for type '${check.type}'` };
    }
    return runner.validate(check);
  }

  /**
   * Clear all cached instances
   */
  clearCache(): void {
    this.instances.clear();
    log.debug('Gate runner cache cleared');
  }

  /**
   * Reset registry to empty state
   */
  reset(): void {
    this.factories.clear();
    this.instances.clear();
    log.debug('Gate runner registry reset');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a gate runner registry with default runners registered
 */
export function createGateRunnerRegistry(): GateRunnerRegistry {
  const registry = new GateRunnerRegistry();

  // Register default runners
  registry.register('verification-levels', createVerificationGateRunner);
  registry.register('github-actions', createGitHubActionsGateRunner);
  registry.register('custom', createCustomCommandGateRunner);
  registry.register('convergence', createConvergenceGateRunner);
  registry.register('approval', createApprovalGateRunner);

  return registry;
}

/**
 * Global gate runner registry instance
 */
export const gateRunnerRegistry = createGateRunnerRegistry();
