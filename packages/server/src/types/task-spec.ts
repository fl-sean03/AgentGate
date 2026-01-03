/**
 * TaskSpec Type System (v0.2.24)
 *
 * TaskSpec is the primary configuration unit for AgentGate, replacing HarnessConfig.
 * It uses a Kubernetes-style resource definition to declaratively specify:
 * - Goal: What we're trying to achieve
 * - Convergence: How to reach the goal (strategy + gates + limits)
 * - Execution: Where to run (workspace + sandbox + agent)
 * - Delivery: How to ship (git + PR)
 *
 * @module types/task-spec
 */

import { z } from 'zod';
import type { ConvergenceSpec } from './convergence.js';
import type { ExecutionSpec } from './execution-spec.js';
import type { DeliverySpec } from './delivery-spec.js';

// ═══════════════════════════════════════════════════════════════════════════
// TASK METADATA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Metadata for a TaskSpec resource
 */
export interface TaskMetadata {
  /** Unique identifier for the task */
  name: string;
  /** Optional namespace for grouping tasks */
  namespace?: string;
  /** Key-value labels for filtering and organization */
  labels?: Record<string, string>;
  /** Extended metadata and annotations */
  annotations?: Record<string, string>;
}

/**
 * Zod schema for TaskMetadata
 */
export const taskMetadataSchema = z.object({
  name: z.string().min(1).max(128),
  namespace: z.string().max(64).optional(),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// GOAL SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Defines the desired end state for a task
 */
export interface DesiredState {
  /** All configured gates must pass */
  allGatesPassed?: boolean;
  /** Only these specific gates must pass */
  specificGates?: string[];
  /** Custom state definition for extensibility */
  custom?: Record<string, unknown>;
}

/**
 * Defines what we're trying to achieve
 */
export interface GoalSpec {
  /** Task description/prompt for the agent */
  prompt: string;
  /** Additional context to provide to the agent */
  context?: string;
  /** Definition of what "done" looks like */
  desiredState?: DesiredState;
}

/**
 * Zod schema for DesiredState
 */
export const desiredStateSchema = z.object({
  allGatesPassed: z.boolean().optional(),
  specificGates: z.array(z.string()).optional(),
  custom: z.record(z.unknown()).optional(),
});

/**
 * Zod schema for GoalSpec
 */
export const goalSpecSchema = z.object({
  prompt: z.string().min(1),
  context: z.string().optional(),
  desiredState: desiredStateSchema.optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK SPEC BODY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The main body of a TaskSpec containing all configuration
 */
export interface TaskSpecBody {
  /** What we're trying to achieve */
  goal: GoalSpec;
  /** How to reach the goal (strategy + gates + limits) */
  convergence: ConvergenceSpec;
  /** Where to run (workspace + sandbox + agent) */
  execution: ExecutionSpec;
  /** How to ship (git + PR) */
  delivery: DeliverySpec;
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TaskSpec is the primary configuration unit for AgentGate.
 * It follows Kubernetes resource conventions with apiVersion, kind, metadata, and spec.
 */
export interface TaskSpec {
  /** API version, always 'agentgate.io/v1' */
  apiVersion: 'agentgate.io/v1';
  /** Resource kind, always 'TaskSpec' */
  kind: 'TaskSpec';
  /** Resource metadata */
  metadata: TaskMetadata;
  /** Task specification body */
  spec: TaskSpecBody;
}

/**
 * Source tracking for resolved TaskSpecs
 */
export type TaskSpecSource =
  | { type: 'file'; path: string }
  | { type: 'profile'; name: string }
  | { type: 'inline' }
  | { type: 'api-request' }
  | { type: 'legacy-harness' };

/**
 * A fully resolved TaskSpec with metadata
 */
export interface ResolvedTaskSpec extends TaskSpec {
  /** Marker indicating this TaskSpec has been resolved */
  _resolved: true;
  /** SHA256 hash of the resolved spec for change detection */
  _hash: string;
  /** Timestamp when the spec was resolved */
  _resolvedAt: Date;
  /** Source information for audit trail */
  _source: TaskSpecSource;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type guard to check if an object is a TaskSpec
 */
export function isTaskSpec(obj: unknown): obj is TaskSpec {
  if (typeof obj !== 'object' || obj === null) return false;
  const candidate = obj as Record<string, unknown>;
  return (
    candidate.apiVersion === 'agentgate.io/v1' &&
    candidate.kind === 'TaskSpec' &&
    typeof candidate.metadata === 'object' &&
    typeof candidate.spec === 'object'
  );
}

/**
 * Type guard to check if a TaskSpec is resolved
 */
export function isResolvedTaskSpec(obj: unknown): obj is ResolvedTaskSpec {
  if (!isTaskSpec(obj)) return false;
  // Check for _resolved property which marks a resolved TaskSpec
  return '_resolved' in obj && (obj as ResolvedTaskSpec)._resolved === true;
}
