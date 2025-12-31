# DevGuide v0.2.10: Data Model Extensions

## Thrust 1: WorkOrder Tree Fields

### 1.1 Objective

Extend the WorkOrder type to support parent-child relationships and tree tracking.

### 1.2 Background

Currently, WorkOrder is a flat structure with no hierarchy. To support recursive spawning, we need fields to track:
- Parent-child relationships
- Tree depth and position
- Integration status

### 1.3 Subtasks

#### 1.3.1 Add Tree Relationship Fields

Extend the WorkOrder interface in `packages/server/src/types/work-order.ts`:

- `parentId: string | null` - ID of parent work order (null for root)
- `childIds: string[]` - IDs of spawned child work orders
- `rootId: string` - ID of tree root (equals own ID for root work orders)
- `depth: number` - Tree depth (0 = root, 1 = child, etc.)
- `siblingIndex: number` - Position among siblings (0-based)

#### 1.3.2 Add New WorkOrder Statuses

Add two new statuses to `WorkOrderStatus`:

- `WAITING_FOR_CHILDREN` - Parent waiting for children to complete
- `INTEGRATING` - Integration agent running

#### 1.3.3 Add Integration Status Type

Create a new type for tracking integration progress:

- `PENDING` - Waiting for children
- `READY` - All children complete, ready to integrate
- `IN_PROGRESS` - Integration agent running
- `SUCCEEDED` - Integration complete
- `FAILED` - Integration failed

Add to WorkOrder:
- `integrationStatus?: IntegrationStatus`
- `integrationWorkOrderId?: string`

#### 1.3.4 Update Zod Schemas

Update `submitRequestSchema` and related schemas to include new fields with appropriate defaults:
- `parentId` defaults to `null`
- `childIds` defaults to `[]`
- `depth` defaults to `0`

### 1.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Run `pnpm --filter @agentgate/server test` - all existing tests pass
3. Verify new fields are optional with proper defaults

### 1.5 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/types/work-order.ts` | Modified |

---

## Thrust 2: Spawn Types

### 2.1 Objective

Create type definitions for spawn requests and spawn limits.

### 2.2 Subtasks

#### 2.2.1 Create Spawn Request Types

Create `packages/server/src/types/spawn.ts` with:

**SpawnRequest** - The structure agents write to `.agentgate/spawn-requests.json`:
- `children: ChildWorkOrderRequest[]` - Array of child tasks
- `integrationStrategy: IntegrationStrategy` - How to merge
- `pauseUntilComplete: boolean` - Wait for children before continuing

**ChildWorkOrderRequest** - Individual child task:
- `taskPrompt: string` - Task for the child agent
- `rationale: string` - Why this subtask was split out
- `estimatedComplexity: 'low' | 'medium' | 'high'`
- `dependencies?: string[]` - IDs of sibling children this depends on
- `targetPath?: string` - Subdirectory focus (optional)

**IntegrationStrategy** - How to merge branches:
- `merge-branches` - Git merge all child branches
- `cherry-pick` - Cherry-pick commits
- `manual` - No auto-integration
- `integration-agent` - Spawn integration agent

#### 2.2.2 Create Spawn Limits Type

**SpawnLimits** - Configurable limits:
- `maxDepth: number` - Maximum tree depth (default: 3)
- `maxChildrenPerParent: number` - Max children per parent (default: 5)
- `maxTotalDescendants: number` - Max total work orders in tree (default: 20)
- `maxConcurrentInTree: number` - Max concurrent runs per tree (default: 10)

#### 2.2.3 Create Zod Schemas

Add Zod schemas for:
- `spawnRequestSchema`
- `childWorkOrderRequestSchema`
- `spawnLimitsSchema`

#### 2.2.4 Export from Types Index

Export new types from `packages/server/src/types/index.ts`.

### 2.3 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Verify types can be imported from `types/index.ts`
3. Test Zod schema parsing with valid/invalid inputs

### 2.4 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/types/spawn.ts` | Created |
| `packages/server/src/types/index.ts` | Modified |
