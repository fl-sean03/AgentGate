# DevGuide v0.2.10: Branch Integration

## Thrust 7: Integration Service

### 7.1 Objective

Implement the integration service that merges child branches when all children complete.

### 7.2 Background

When all children of a parent complete, their branches need to be integrated:
1. Either via automatic git merge
2. Or via an integration agent that handles conflicts

### 7.3 Subtasks

#### 7.3.1 Create Integration Service

Create `packages/server/src/integration/integration-service.ts` with:

**IntegrationService class**:
- `integrate(parentWorkOrder: WorkOrder, strategy: IntegrationStrategy): Promise<IntegrationResult>`
- `detectConflicts(parentBranch: string, childBranches: string[], workspace: Workspace): Promise<ConflictInfo[]>`
- `performMerge(parentBranch: string, childBranch: string, workspace: Workspace): Promise<MergeResult>`
- `spawnIntegrationAgent(parentWorkOrder: WorkOrder, childWorkOrders: WorkOrder[]): Promise<WorkOrder>`

#### 7.3.2 Implement Merge Strategy

The `merge-branches` strategy:
1. Checkout parent branch
2. For each child branch (in order by siblingIndex):
   - Attempt git merge
   - If conflict, record conflict info
3. If all merges succeed, return success
4. If any conflicts, either:
   - Auto-resolve simple conflicts
   - Or spawn integration agent for complex conflicts

#### 7.3.3 Implement Conflict Detection

Create `packages/server/src/integration/conflict-detector.ts`:

- `detectConflicts(baseBranch, branches[], workspacePath): Promise<ConflictInfo[]>`
- For each pair of branches, find overlapping file changes
- Categorize conflicts: CONTENT, ADD_DELETE, RENAME, BINARY

#### 7.3.4 Implement Integration Agent Spawning

When conflicts require agent assistance:
1. Create integration work order with:
   - Task prompt explaining the integration task
   - List of branches to integrate
   - Conflict details
2. Submit as child of parent work order
3. Mark parent as INTEGRATING

Integration agent prompt template:
```
You are integrating changes from multiple agent branches.

Branches to integrate: [list]
Target branch: [parent branch]
Conflicts detected: [details]

Tasks:
1. Merge all changes
2. Resolve conflicts (prefer functionality over formatting)
3. Ensure tests pass
4. Create cohesive result
```

### 7.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Create unit tests for integration-service
3. Test merge with non-conflicting branches
4. Test conflict detection with overlapping changes
5. Verify integration agent is spawned for conflicts

### 7.5 Files Created

| File | Action |
|------|--------|
| `packages/server/src/integration/integration-service.ts` | Created |
| `packages/server/src/integration/conflict-detector.ts` | Created |

---

## Thrust 8: Git Merge Operations

### 8.1 Objective

Add git merge operations to git-ops module for branch integration.

### 8.2 Background

The existing git-ops module has branch, commit, and push operations. We need to add merge-related operations for integration.

### 8.3 Subtasks

#### 8.3.1 Add Merge Function

Add to `packages/server/src/workspace/git-ops.ts`:

```typescript
async function merge(
  repoPath: string,
  branchToMerge: string,
  options?: { noCommit?: boolean, strategy?: string }
): Promise<MergeResult>
```

- Returns `{ success: boolean, conflicts?: string[], commitSha?: string }`
- Handle merge conflicts gracefully

#### 8.3.2 Add Conflict Check Function

```typescript
async function hasConflicts(repoPath: string): Promise<boolean>
```

- Check if working directory has unresolved conflicts

#### 8.3.3 Add Abort Merge Function

```typescript
async function abortMerge(repoPath: string): Promise<void>
```

- Abort an in-progress merge with conflicts

#### 8.3.4 Add Branch Delete Function

```typescript
async function deleteBranch(
  repoPath: string,
  branchName: string,
  remote?: boolean
): Promise<void>
```

- Delete local and/or remote branch
- Used for cleanup after integration

#### 8.3.5 Add Get Changed Files Function

```typescript
async function getChangedFiles(
  repoPath: string,
  baseBranch: string,
  compareBranch: string
): Promise<string[]>
```

- List files changed between two branches
- Used for conflict detection

### 8.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Create unit tests for new git operations
3. Test merge with simple branches
4. Test conflict detection and abort

### 8.5 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/workspace/git-ops.ts` | Modified |
