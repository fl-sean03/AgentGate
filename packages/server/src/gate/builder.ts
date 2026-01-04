/**
 * Gate Plan Builder
 * Fluent API for building gate plans with dependencies and custom gates.
 *
 * (v0.2.27 - Thrust 14: Custom Gate Type Support)
 */

import { createLogger } from '../utils/logger.js';
import type { GatePlan, GateCheck, GateCheckType } from '../types/index.js';
import type { VerificationLevel } from '../types/verification.js';

const log = createLogger('gate-builder');

/**
 * Gate weight for prioritization
 */
export type GateWeight = 'critical' | 'high' | 'normal' | 'low' | 'advisory';

/**
 * Gate dependency specification
 */
interface GateDependency {
  /** Gate that must run first */
  from: string;
  /** Gate that depends on the other */
  to: string;
}

/**
 * Builder state for a single gate
 */
interface GateEntry {
  check: GateCheck;
  weight: GateWeight;
  dependencies: string[];
}

/**
 * Builder options
 */
export interface GatePlanBuilderOptions {
  /** Default gate weight */
  defaultWeight?: GateWeight;
  /** Fail fast on critical gate failure */
  failFast?: boolean;
  /** Maximum parallel gates */
  maxParallel?: number;
}

/**
 * Gate Plan Builder
 * Fluent API for constructing gate plans.
 */
export class GatePlanBuilder {
  private gates: Map<string, GateEntry> = new Map();
  private dependencies: GateDependency[] = [];
  private options: GatePlanBuilderOptions;
  private planName = 'default';

  constructor(options: GatePlanBuilderOptions = {}) {
    this.options = {
      defaultWeight: 'normal',
      failFast: true,
      maxParallel: 5,
      ...options,
    };
  }

  /**
   * Set the plan name
   */
  name(name: string): this {
    this.planName = name;
    return this;
  }

  /**
   * Add a verification level gate (L0-L3)
   */
  addVerification(options: {
    id?: string;
    levels?: VerificationLevel[];
    config?: Record<string, unknown>;
    weight?: GateWeight;
  } = {}): this {
    const id = options.id || `verification-${this.gates.size}`;
    const check: GateCheck = {
      type: 'verification-levels',
      config: {
        levels: options.levels || ['L0', 'L1', 'L2'],
        ...options.config,
      },
    };

    this.gates.set(id, {
      check,
      weight: options.weight || this.options.defaultWeight!,
      dependencies: [],
    });

    log.debug({ id, levels: options.levels }, 'Added verification gate');
    return this;
  }

  /**
   * Add a contract verification gate (L0)
   */
  addContract(options: {
    id?: string;
    config?: Record<string, unknown>;
    weight?: GateWeight;
  } = {}): this {
    const id = options.id || `contract-${this.gates.size}`;
    const check: GateCheck = {
      type: 'verification-levels',
      config: {
        levels: ['L0'],
        ...options.config,
      },
    };

    this.gates.set(id, {
      check,
      weight: options.weight || 'critical',
      dependencies: [],
    });

    log.debug({ id }, 'Added contract gate');
    return this;
  }

  /**
   * Add a test gate (L1)
   */
  addTest(options: {
    id?: string;
    config?: Record<string, unknown>;
    weight?: GateWeight;
  } = {}): this {
    const id = options.id || `test-${this.gates.size}`;
    const check: GateCheck = {
      type: 'verification-levels',
      config: {
        levels: ['L1'],
        ...options.config,
      },
    };

    this.gates.set(id, {
      check,
      weight: options.weight || 'high',
      dependencies: [],
    });

    log.debug({ id }, 'Added test gate');
    return this;
  }

  /**
   * Add a GitHub Actions gate
   */
  addGitHubActions(options: {
    id?: string;
    workflow?: string;
    config?: Record<string, unknown>;
    weight?: GateWeight;
  } = {}): this {
    const id = options.id || `github-actions-${this.gates.size}`;
    const check: GateCheck = {
      type: 'github-actions',
      config: {
        workflow: options.workflow,
        ...options.config,
      },
    };

    this.gates.set(id, {
      check,
      weight: options.weight || 'high',
      dependencies: [],
    });

    log.debug({ id, workflow: options.workflow }, 'Added GitHub Actions gate');
    return this;
  }

  /**
   * Add a custom command gate
   */
  addCustomCommand(options: {
    id?: string;
    command: string;
    config?: Record<string, unknown>;
    weight?: GateWeight;
  }): this {
    const id = options.id || `custom-${this.gates.size}`;
    const check: GateCheck = {
      type: 'custom',
      config: {
        command: options.command,
        ...options.config,
      },
    };

    this.gates.set(id, {
      check,
      weight: options.weight || this.options.defaultWeight!,
      dependencies: [],
    });

    log.debug({ id, command: options.command }, 'Added custom command gate');
    return this;
  }

  /**
   * Add a convergence gate
   */
  addConvergence(options: {
    id?: string;
    config?: Record<string, unknown>;
    weight?: GateWeight;
  } = {}): this {
    const id = options.id || `convergence-${this.gates.size}`;
    const check: GateCheck = {
      type: 'convergence',
      config: options.config,
    };

    this.gates.set(id, {
      check,
      weight: options.weight || 'normal',
      dependencies: [],
    });

    log.debug({ id }, 'Added convergence gate');
    return this;
  }

  /**
   * Add an approval gate
   */
  addApproval(options: {
    id?: string;
    requiredApprovers?: string[];
    config?: Record<string, unknown>;
    weight?: GateWeight;
  } = {}): this {
    const id = options.id || `approval-${this.gates.size}`;
    const check: GateCheck = {
      type: 'approval',
      config: {
        requiredApprovers: options.requiredApprovers,
        ...options.config,
      },
    };

    this.gates.set(id, {
      check,
      weight: options.weight || 'critical',
      dependencies: [],
    });

    log.debug({ id }, 'Added approval gate');
    return this;
  }

  /**
   * Add a custom gate by type
   */
  addCustomGate(options: {
    id?: string;
    type: GateCheckType;
    config?: Record<string, unknown>;
    weight?: GateWeight;
  }): this {
    const id = options.id || `${options.type}-${this.gates.size}`;
    const check: GateCheck = {
      type: options.type,
      config: options.config,
    };

    this.gates.set(id, {
      check,
      weight: options.weight || this.options.defaultWeight!,
      dependencies: [],
    });

    log.debug({ id, type: options.type }, 'Added custom gate');
    return this;
  }

  /**
   * Add a dependency between gates
   */
  withDependency(from: string, to: string): this {
    if (!this.gates.has(from)) {
      throw new Error(`Gate '${from}' not found`);
    }
    if (!this.gates.has(to)) {
      throw new Error(`Gate '${to}' not found`);
    }

    this.dependencies.push({ from, to });
    const entry = this.gates.get(to)!;
    entry.dependencies.push(from);

    log.debug({ from, to }, 'Added gate dependency');
    return this;
  }

  /**
   * Set weight for a gate
   */
  setWeight(gateId: string, weight: GateWeight): this {
    const entry = this.gates.get(gateId);
    if (!entry) {
      throw new Error(`Gate '${gateId}' not found`);
    }
    entry.weight = weight;
    return this;
  }

  /**
   * Build the gate plan
   */
  build(): GatePlan {
    // Validate no circular dependencies
    this.validateDependencies();

    // Sort gates by dependencies (topological sort)
    const sortedGates = this.topologicalSort();

    // Build checks array
    const checks: GateCheck[] = sortedGates.map(id => {
      const entry = this.gates.get(id)!;
      return entry.check;
    });

    const plan: GatePlan = {
      checks,
    };

    log.info(
      { name: this.planName, gateCount: checks.length },
      'Gate plan built'
    );

    return plan;
  }

  /**
   * Get gate info for debugging
   */
  getGateInfo(): Array<{ id: string; type: GateCheckType; weight: GateWeight; dependencies: string[] }> {
    return Array.from(this.gates.entries()).map(([id, entry]) => ({
      id,
      type: entry.check.type,
      weight: entry.weight,
      dependencies: entry.dependencies,
    }));
  }

  /**
   * Validate no circular dependencies
   */
  private validateDependencies(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (gateId: string): boolean => {
      visited.add(gateId);
      recursionStack.add(gateId);

      const entry = this.gates.get(gateId);
      if (entry) {
        for (const dep of entry.dependencies) {
          if (!visited.has(dep)) {
            if (hasCycle(dep)) return true;
          } else if (recursionStack.has(dep)) {
            return true;
          }
        }
      }

      recursionStack.delete(gateId);
      return false;
    };

    for (const gateId of this.gates.keys()) {
      if (!visited.has(gateId)) {
        if (hasCycle(gateId)) {
          throw new Error('Circular dependency detected in gate plan');
        }
      }
    }
  }

  /**
   * Topological sort of gates
   */
  private topologicalSort(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const visit = (gateId: string): void => {
      if (visited.has(gateId)) return;
      visited.add(gateId);

      const entry = this.gates.get(gateId);
      if (entry) {
        for (const dep of entry.dependencies) {
          visit(dep);
        }
      }
      result.push(gateId);
    };

    for (const gateId of this.gates.keys()) {
      visit(gateId);
    }

    return result;
  }
}

/**
 * Create a new gate plan builder
 */
export function createGatePlanBuilder(options?: GatePlanBuilderOptions): GatePlanBuilder {
  return new GatePlanBuilder(options);
}

/**
 * Convenience function to start building a gate plan
 */
export function GatePlan_builder(options?: GatePlanBuilderOptions): GatePlanBuilder {
  return createGatePlanBuilder(options);
}
