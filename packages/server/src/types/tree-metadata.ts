/**
 * Tree Metadata Types (v0.2.10)
 *
 * Defines the structure for tracking recursive agent spawning trees.
 * Each tree represents a hierarchy of work orders where parent agents
 * can spawn child agents.
 */

import type { WorkOrderStatus, IntegrationStatus } from './work-order.js';

/**
 * Tree status reflecting the state of the entire execution tree
 */
export const TreeStatus = {
  ACTIVE: 'active',           // Tree has work orders still executing
  WAITING: 'waiting',         // Root completed, waiting for children
  INTEGRATING: 'integrating', // All children done, integrating results
  COMPLETED: 'completed',     // All work orders succeeded and integrated
  FAILED: 'failed',           // One or more work orders failed
  CANCELED: 'canceled',       // Tree execution was canceled
} as const;

export type TreeStatus = (typeof TreeStatus)[keyof typeof TreeStatus];

/**
 * Node in the execution tree representing a single work order
 */
export interface TreeNode {
  /** Work order ID */
  workOrderId: string;

  /** Parent work order ID (null for root) */
  parentId: string | null;

  /** Child work order IDs */
  childIds: string[];

  /** Current status of the work order */
  status: WorkOrderStatus;

  /** Integration status if applicable */
  integrationStatus?: IntegrationStatus;

  /** Integration work order ID if created */
  integrationWorkOrderId?: string;

  /** Depth in tree (0 = root) */
  depth: number;

  /** Index among siblings */
  siblingIndex: number;

  /** When node was created */
  createdAt: Date;

  /** When node completed (if applicable) */
  completedAt?: Date;
}

/**
 * Tree metadata stored in ~/.agentgate/trees/{rootId}.json
 */
export interface TreeMetadata {
  /** Root work order ID (also serves as tree ID) */
  rootId: string;

  /** Current tree status */
  status: TreeStatus;

  /** Map of work order ID to tree node */
  nodes: Record<string, TreeNode>;

  /** When tree was created */
  createdAt: Date;

  /** When tree completed (if applicable) */
  completedAt?: Date;

  /** Total number of nodes in tree */
  nodeCount: number;
}
