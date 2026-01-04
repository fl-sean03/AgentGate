/**
 * Spawn Tracker - Detects and prevents deadlocks in process spawning.
 * Tracks spawn chains and prevents circular spawn dependencies.
 *
 * (v0.2.27 - Thrust 9: Deadlock Detection for Spawning)
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('spawn-tracker');

/**
 * Spawn chain entry
 */
export interface SpawnChainEntry {
  /** Parent PID */
  parentPid: number;
  /** Child PID */
  childPid: number;
  /** Spawn timestamp */
  timestamp: number;
  /** Resource key being held/awaited */
  resourceKey?: string;
}

/**
 * Deadlock detection result
 */
export interface DeadlockResult {
  /** Whether a deadlock was detected */
  hasDeadlock: boolean;
  /** The cycle of PIDs involved (if deadlock) */
  cycle: number[];
  /** Description of the deadlock */
  description: string;
}

/**
 * Options for spawn tracking
 */
export interface SpawnTrackerOptions {
  /** Maximum spawn depth to track (default: 100) */
  maxSpawnDepth: number;
  /** Maximum spawn rate per second (default: 50) */
  maxSpawnRatePerSecond: number;
  /** Time window for rate tracking in milliseconds (default: 1000) */
  rateWindowMs: number;
  /** Enable circular dependency detection (default: true) */
  detectCircular: boolean;
  /** Maximum waiting time before considering it stuck (default: 60000) */
  stuckThresholdMs: number;
}

const DEFAULT_OPTIONS: SpawnTrackerOptions = {
  maxSpawnDepth: 100,
  maxSpawnRatePerSecond: 50,
  rateWindowMs: 1000,
  detectCircular: true,
  stuckThresholdMs: 60000,
};

/**
 * Spawn Tracker for deadlock detection
 */
export class SpawnTracker {
  private static instance: SpawnTracker | null = null;

  private readonly options: SpawnTrackerOptions;
  private readonly spawnChain: Map<number, number> = new Map(); // child -> parent
  private readonly waitingFor: Map<number, string> = new Map(); // pid -> resource
  private readonly spawnTimes: number[] = [];
  private readonly resourceHolders: Map<string, number> = new Map(); // resource -> pid

  private constructor(options: Partial<SpawnTrackerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(options?: Partial<SpawnTrackerOptions>): SpawnTracker {
    if (!SpawnTracker.instance) {
      SpawnTracker.instance = new SpawnTracker(options);
    }
    return SpawnTracker.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    SpawnTracker.instance = null;
  }

  /**
   * Record a spawn event
   */
  recordSpawn(parentPid: number, childPid: number): boolean {
    // Check spawn rate
    if (!this.checkSpawnRate()) {
      log.warn({ parentPid, childPid }, 'Spawn rate limit exceeded');
      return false;
    }

    // Check spawn depth
    const depth = this.getSpawnDepth(parentPid);
    if (depth >= this.options.maxSpawnDepth) {
      log.warn({ parentPid, childPid, depth }, 'Maximum spawn depth exceeded');
      return false;
    }

    // Check for circular spawn
    if (this.options.detectCircular) {
      const circular = this.wouldCreateCycle(parentPid, childPid);
      if (circular) {
        log.error(
          { parentPid, childPid },
          'Circular spawn dependency detected'
        );
        return false;
      }
    }

    this.spawnChain.set(childPid, parentPid);
    this.spawnTimes.push(Date.now());

    log.debug({ parentPid, childPid, depth: depth + 1 }, 'Spawn recorded');
    return true;
  }

  /**
   * Record process waiting for a resource
   */
  recordWait(pid: number, resourceKey: string): void {
    this.waitingFor.set(pid, resourceKey);
    log.debug({ pid, resourceKey }, 'Process waiting for resource');
  }

  /**
   * Record process holding a resource
   */
  recordHold(pid: number, resourceKey: string): void {
    this.resourceHolders.set(resourceKey, pid);
    log.debug({ pid, resourceKey }, 'Process holding resource');
  }

  /**
   * Record process released a resource
   */
  recordRelease(pid: number, resourceKey: string): void {
    const holder = this.resourceHolders.get(resourceKey);
    if (holder === pid) {
      this.resourceHolders.delete(resourceKey);
      log.debug({ pid, resourceKey }, 'Process released resource');
    }
  }

  /**
   * Clear waiting status for a process
   */
  clearWait(pid: number): void {
    this.waitingFor.delete(pid);
  }

  /**
   * Record a process exit
   */
  recordExit(pid: number): void {
    this.spawnChain.delete(pid);
    this.waitingFor.delete(pid);

    // Release any resources held by this process
    for (const [resource, holder] of this.resourceHolders) {
      if (holder === pid) {
        this.resourceHolders.delete(resource);
      }
    }
  }

  /**
   * Get spawn depth for a process
   */
  getSpawnDepth(pid: number): number {
    let depth = 0;
    let current = pid;

    while (this.spawnChain.has(current)) {
      depth++;
      current = this.spawnChain.get(current)!;

      // Prevent infinite loop
      if (depth > this.options.maxSpawnDepth + 10) {
        break;
      }
    }

    return depth;
  }

  /**
   * Get parent chain for a process
   */
  getParentChain(pid: number): number[] {
    const chain: number[] = [];
    let current = pid;

    while (this.spawnChain.has(current)) {
      const parent = this.spawnChain.get(current)!;
      chain.push(parent);
      current = parent;

      if (chain.length > this.options.maxSpawnDepth + 10) {
        break;
      }
    }

    return chain;
  }

  /**
   * Check if adding a spawn would create a cycle
   */
  wouldCreateCycle(parentPid: number, childPid: number): boolean {
    // If child is in parent's ancestor chain, it's a cycle
    const ancestors = this.getParentChain(parentPid);
    return ancestors.includes(childPid);
  }

  /**
   * Check for resource-based deadlock
   */
  detectDeadlock(): DeadlockResult {
    // Build wait-for graph
    // Process A waits for resource R, which is held by process B
    const waitForGraph: Map<number, number[]> = new Map();

    for (const [waitingPid, resourceKey] of this.waitingFor) {
      const holderPid = this.resourceHolders.get(resourceKey);
      if (holderPid !== undefined && holderPid !== waitingPid) {
        const edges = waitForGraph.get(waitingPid) || [];
        edges.push(holderPid);
        waitForGraph.set(waitingPid, edges);
      }
    }

    // Detect cycles using DFS
    const visited = new Set<number>();
    const inStack = new Set<number>();
    const parent = new Map<number, number>();

    const dfs = (node: number): number[] | null => {
      visited.add(node);
      inStack.add(node);

      const neighbors = waitForGraph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          parent.set(neighbor, node);
          const cycle = dfs(neighbor);
          if (cycle) return cycle;
        } else if (inStack.has(neighbor)) {
          // Found cycle - reconstruct it
          const cycle: number[] = [neighbor];
          let current = node;
          while (current !== neighbor) {
            cycle.push(current);
            current = parent.get(current)!;
          }
          cycle.push(neighbor);
          return cycle;
        }
      }

      inStack.delete(node);
      return null;
    };

    for (const pid of waitForGraph.keys()) {
      if (!visited.has(pid)) {
        const cycle = dfs(pid);
        if (cycle) {
          return {
            hasDeadlock: true,
            cycle,
            description: `Deadlock detected: ${cycle.join(' -> ')}`,
          };
        }
      }
    }

    return {
      hasDeadlock: false,
      cycle: [],
      description: 'No deadlock detected',
    };
  }

  /**
   * Get stuck processes (waiting too long)
   */
  getStuckProcesses(): Array<{ pid: number; resource: string; waitTime: number }> {
    // Note: This is a simplified version. In production, you'd track wait start times.
    const stuck: Array<{ pid: number; resource: string; waitTime: number }> = [];

    // For now, just return all waiting processes
    for (const [pid, resource] of this.waitingFor) {
      stuck.push({ pid, resource, waitTime: 0 });
    }

    return stuck;
  }

  /**
   * Check spawn rate limit
   */
  private checkSpawnRate(): boolean {
    const now = Date.now();
    const windowStart = now - this.options.rateWindowMs;

    // Clean old entries
    while (this.spawnTimes.length > 0 && this.spawnTimes[0]! < windowStart) {
      this.spawnTimes.shift();
    }

    // Check rate
    const currentRate = this.spawnTimes.length * (1000 / this.options.rateWindowMs);
    return currentRate < this.options.maxSpawnRatePerSecond;
  }

  /**
   * Get spawn rate statistics
   */
  getSpawnRateStats(): {
    currentRate: number;
    maxRate: number;
    isLimited: boolean;
  } {
    const now = Date.now();
    const windowStart = now - this.options.rateWindowMs;

    // Clean old entries
    while (this.spawnTimes.length > 0 && this.spawnTimes[0]! < windowStart) {
      this.spawnTimes.shift();
    }

    const currentRate = this.spawnTimes.length * (1000 / this.options.rateWindowMs);

    return {
      currentRate,
      maxRate: this.options.maxSpawnRatePerSecond,
      isLimited: currentRate >= this.options.maxSpawnRatePerSecond,
    };
  }

  /**
   * Get statistics
   */
  getStats(): {
    trackedProcesses: number;
    waitingProcesses: number;
    heldResources: number;
    maxDepth: number;
  } {
    let maxDepth = 0;

    for (const pid of this.spawnChain.keys()) {
      const depth = this.getSpawnDepth(pid);
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      trackedProcesses: this.spawnChain.size,
      waitingProcesses: this.waitingFor.size,
      heldResources: this.resourceHolders.size,
      maxDepth,
    };
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.spawnChain.clear();
    this.waitingFor.clear();
    this.resourceHolders.clear();
    this.spawnTimes.length = 0;
    log.debug('Spawn tracker cleared');
  }
}

/**
 * Get the spawn tracker singleton
 */
export function getSpawnTracker(options?: Partial<SpawnTrackerOptions>): SpawnTracker {
  return SpawnTracker.getInstance(options);
}
