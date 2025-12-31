# DevGuide v0.2.10: Tree Execution

## Thrust 5: Tree Coordinator

### 5.1 Objective

Implement the tree coordinator that manages work order tree lifecycle and state.

### 5.2 Background

When agents spawn children, we need to:
- Track the entire tree structure
- Coordinate child execution
- Detect when all children are complete
- Trigger integration at the right time

### 5.3 Subtasks

#### 5.3.1 Create Tree Store

Create `packages/server/src/control-plane/tree-store.ts` with:

**TreeStore class** for persisting tree metadata:
- `createTree(rootWorkOrderId: string, baseBranch: string): Promise<WorkOrderTree>`
- `getTree(rootWorkOrderId: string): Promise<WorkOrderTree | null>`
- `updateTree(rootWorkOrderId: string, updates: Partial<WorkOrderTree>): Promise<void>`
- `addNode(rootWorkOrderId: string, workOrder: WorkOrder): Promise<void>`
- `updateNode(rootWorkOrderId: string, workOrderId: string, updates: Partial<TreeNode>): Promise<void>`

Store trees as JSON files in `~/.agentgate/trees/<root-id>.json`.

#### 5.3.2 Create Tree Coordinator

Create `packages/server/src/orchestrator/tree-coordinator.ts` with:

**TreeCoordinator class**:
- `onWorkOrderCreated(workOrder: WorkOrder): Promise<void>` - Track new work order
- `onWorkOrderStatusChange(workOrderId: string, status: WorkOrderStatus): Promise<void>` - Handle status changes
- `areAllChildrenComplete(workOrderId: string): Promise<boolean>` - Check completion
- `getTreeStatus(rootId: string): Promise<TreeStatus>` - Get aggregate status
- `triggerIntegration(workOrderId: string): Promise<void>` - Start integration

#### 5.3.3 Implement Child Completion Detection

When a work order completes:
1. Check if it has a parent
2. If yes, check if all siblings are complete
3. If all siblings complete, update parent's integrationStatus to READY
4. Trigger integration for parent

#### 5.3.4 Implement Tree Status Aggregation

The `getTreeStatus` method returns:
- Total nodes in tree
- Completed count
- Failed count
- Running count
- Queued count
- Current depth (deepest active node)
- Is tree complete (all nodes terminal)

### 5.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Create unit tests for tree-coordinator
3. Test tree completion detection with mock work orders
4. Verify tree files are persisted correctly

### 5.5 Files Created

| File | Action |
|------|--------|
| `packages/server/src/control-plane/tree-store.ts` | Created |
| `packages/server/src/orchestrator/tree-coordinator.ts` | Created |

---

## Thrust 6: Run Executor Spawn Detection

### 6.1 Objective

Modify the run executor to detect spawn requests after BUILD phase and coordinate child execution.

### 6.2 Background

The run executor currently follows: BUILD → SNAPSHOT → VERIFY → FEEDBACK loop.

We need to insert spawn detection after BUILD:
BUILD → CHECK_SPAWN → (spawn found? create children, wait) : continue

### 6.3 Subtasks

#### 6.3.1 Add Spawn Check After BUILD

Modify `packages/server/src/orchestrator/run-executor.ts`:

After BUILD phase completes successfully:
1. Call `spawnProcessor.checkForSpawnRequest(workspace.rootPath)`
2. If spawn request found:
   - Validate against limits
   - If invalid, log warning and continue normal flow
   - If valid, proceed to spawn handling

#### 6.3.2 Implement Spawn Handling

When valid spawn request detected:
1. Create child work orders via spawn processor
2. Update run state to indicate spawning occurred
3. Transition parent work order to WAITING_FOR_CHILDREN
4. Clean up spawn request file
5. Return run with `spawnedChildren: true`

#### 6.3.3 Add Child Execution Trigger

After child work orders are created:
1. For each child, check if within concurrent run limit
2. Queue children for execution
3. Set up completion callbacks via tree coordinator

#### 6.3.4 Handle Parent Resume

When all children complete:
1. Tree coordinator triggers integration
2. If integration succeeds, resume parent verification
3. Parent can continue to final SUCCEEDED state

#### 6.3.5 Update Branch Naming

Modify branch creation logic to use hierarchical naming:
`agentgate/<root-id>/<depth>-<sibling>-<work-order-id>`

This replaces the current `agentgate/<work-order-id>` pattern.

### 6.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Run existing tests - all should pass
3. Create integration test with mock spawn request
4. Verify child work orders are created correctly
5. Verify parent enters WAITING_FOR_CHILDREN state

### 6.5 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/orchestrator/run-executor.ts` | Modified |
| `packages/server/src/orchestrator/orchestrator.ts` | Modified |
