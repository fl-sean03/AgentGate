# DevGuide v0.2.10: Appendices

## Appendix A: Implementation Checklist

### Pre-Implementation

- [ ] DevGuide v0.2.9 completed (integration tests)
- [ ] All packages build successfully (`pnpm build`)
- [ ] CI pipeline passing
- [ ] Git working directory clean

### Thrust 1: WorkOrder Tree Fields

- [ ] Add parentId, childIds, rootId, depth to WorkOrder
- [ ] Add WAITING_FOR_CHILDREN, INTEGRATING statuses
- [ ] Add IntegrationStatus type
- [ ] Update Zod schemas
- [ ] Tests pass

### Thrust 2: Spawn Types

- [ ] Create types/spawn.ts
- [ ] Define SpawnRequest, ChildWorkOrderRequest
- [ ] Define SpawnLimits
- [ ] Create Zod schemas
- [ ] Export from types/index.ts
- [ ] Tests pass

### Thrust 3: Spawn Processor

- [ ] Create orchestrator/spawn-processor.ts
- [ ] Implement checkForSpawnRequest
- [ ] Implement validateSpawnRequest
- [ ] Implement createChildWorkOrders
- [ ] Unit tests pass

### Thrust 4: CLAUDE.md Injection

- [ ] Create spawn instructions template
- [ ] Modify command-builder.ts
- [ ] Add spawnLimits to orchestrator config
- [ ] Tests pass

### Thrust 5: Tree Coordinator

- [ ] Create control-plane/tree-store.ts
- [ ] Create orchestrator/tree-coordinator.ts
- [ ] Implement tree completion detection
- [ ] Implement tree status aggregation
- [ ] Tests pass

### Thrust 6: Run Executor Spawn Detection

- [ ] Add spawn check after BUILD phase
- [ ] Implement spawn handling
- [ ] Update branch naming to hierarchical
- [ ] Handle parent resume after children complete
- [ ] Tests pass

### Thrust 7: Integration Service

- [ ] Create integration/integration-service.ts
- [ ] Implement merge strategy
- [ ] Implement integration agent spawning
- [ ] Tests pass

### Thrust 8: Git Merge Operations

- [ ] Add merge function to git-ops.ts
- [ ] Add hasConflicts function
- [ ] Add abortMerge function
- [ ] Add deleteBranch function
- [ ] Add getChangedFiles function
- [ ] Tests pass

### Thrust 9: Configurable Limits

- [ ] Read env vars in orchestrator
- [ ] Update serve command
- [ ] Add limits to health endpoint
- [ ] Tests pass

### Thrust 10: Docker Compose

- [ ] Create docker/Dockerfile.server
- [ ] Create docker/Dockerfile.dashboard
- [ ] Create docker/nginx.conf
- [ ] Create docker-compose.yml
- [ ] Create .env.example
- [ ] Create scripts/docker-setup.sh
- [ ] docker-compose build succeeds
- [ ] docker-compose up works

### Post-Implementation

- [ ] All existing tests still pass
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Documentation updated
- [ ] DevGuides README updated

---

## Appendix B: AgentGate Work Order Prompts

### Work Order 1: Data Model (Thrusts 1-2)

```
Implement data model extensions for recursive agent spawning.

CONTEXT:
This is DevGuide v0.2.10 - enabling recursive agent spawning.
Work orders need parent-child relationships and tree tracking.

TASKS:
1. Extend WorkOrder interface in packages/server/src/types/work-order.ts:
   - Add parentId (string | null)
   - Add childIds (string[])
   - Add rootId (string)
   - Add depth (number)
   - Add siblingIndex (number)
   - Add integrationStatus (optional)
   - Add integrationWorkOrderId (optional)

2. Add new WorkOrderStatus values:
   - WAITING_FOR_CHILDREN
   - INTEGRATING

3. Create IntegrationStatus type:
   - PENDING, READY, IN_PROGRESS, SUCCEEDED, FAILED

4. Create packages/server/src/types/spawn.ts with:
   - SpawnRequest interface
   - ChildWorkOrderRequest interface
   - SpawnLimits interface
   - IntegrationStrategy type
   - Zod schemas for all types

5. Export new types from types/index.ts

6. Update submitRequestSchema with new optional fields

VERIFICATION:
- pnpm --filter @agentgate/server typecheck passes
- pnpm --filter @agentgate/server test passes

FILES TO READ FIRST:
- packages/server/src/types/work-order.ts
- packages/server/src/types/index.ts
```

### Work Order 2: Spawn Mechanism (Thrusts 3-4)

```
Implement spawn processor and CLAUDE.md injection for agent spawning.

CONTEXT:
This is DevGuide v0.2.10 - enabling recursive agent spawning.
Agents spawn children by creating .agentgate/spawn-requests.json.

TASKS:
1. Create packages/server/src/orchestrator/spawn-processor.ts:
   - SpawnProcessor class with methods:
     - checkForSpawnRequest(workspacePath): Promise<SpawnRequest | null>
     - validateSpawnRequest(request, parent, limits): ValidationResult
     - createChildWorkOrders(parent, request, workspace): Promise<WorkOrder[]>
     - deleteSpawnRequestFile(workspacePath): Promise<void>

2. Modify packages/server/src/agent/command-builder.ts:
   - Add buildSpawnInstructions(limits: SpawnLimits): string function
   - Append spawn instructions to system prompt
   - Document the spawn file format for agents

3. Add spawnLimits to OrchestratorConfig in orchestrator.ts:
   - enableSpawning: boolean (default: true)
   - spawnLimits: SpawnLimits

4. Create unit tests for spawn-processor

VERIFICATION:
- pnpm --filter @agentgate/server typecheck passes
- pnpm --filter @agentgate/server test passes
- Spawn instructions appear in agent prompt when enabled

FILES TO READ FIRST:
- packages/server/src/agent/command-builder.ts
- packages/server/src/orchestrator/orchestrator.ts
- packages/server/src/types/spawn.ts (created in WO1)
```

### Work Order 3: Tree Execution (Thrusts 5-6)

```
Implement tree coordinator and run executor spawn detection.

CONTEXT:
This is DevGuide v0.2.10 - enabling recursive agent spawning.
After BUILD phase, check for spawn requests and coordinate tree execution.

TASKS:
1. Create packages/server/src/control-plane/tree-store.ts:
   - Store tree metadata as JSON in ~/.agentgate/trees/
   - Methods: createTree, getTree, updateTree, addNode, updateNode

2. Create packages/server/src/orchestrator/tree-coordinator.ts:
   - TreeCoordinator class with methods:
     - onWorkOrderCreated(workOrder)
     - onWorkOrderStatusChange(id, status)
     - areAllChildrenComplete(workOrderId): boolean
     - getTreeStatus(rootId): TreeStatus
     - triggerIntegration(workOrderId)

3. Modify packages/server/src/orchestrator/run-executor.ts:
   - After BUILD phase, call spawnProcessor.checkForSpawnRequest
   - If spawn found, validate and create children
   - Transition parent to WAITING_FOR_CHILDREN
   - Return run with spawnedChildren: true

4. Update branch naming to hierarchical:
   - Pattern: agentgate/<root-id>/<depth>-<sibling>-<work-order-id>

5. Create unit tests for tree-coordinator

VERIFICATION:
- pnpm --filter @agentgate/server typecheck passes
- pnpm --filter @agentgate/server test passes
- Tree files persist in ~/.agentgate/trees/

FILES TO READ FIRST:
- packages/server/src/orchestrator/run-executor.ts
- packages/server/src/orchestrator/orchestrator.ts
- packages/server/src/orchestrator/spawn-processor.ts (created in WO2)
```

### Work Order 4: Integration (Thrusts 7-8)

```
Implement branch integration service and git merge operations.

CONTEXT:
This is DevGuide v0.2.10 - enabling recursive agent spawning.
When children complete, their branches must be integrated.

TASKS:
1. Add git operations to packages/server/src/workspace/git-ops.ts:
   - merge(repoPath, branchToMerge, options?): Promise<MergeResult>
   - hasConflicts(repoPath): Promise<boolean>
   - abortMerge(repoPath): Promise<void>
   - deleteBranch(repoPath, branchName, remote?): Promise<void>
   - getChangedFiles(repoPath, baseBranch, compareBranch): Promise<string[]>

2. Create packages/server/src/integration/conflict-detector.ts:
   - detectConflicts(baseBranch, branches[], workspacePath): Promise<ConflictInfo[]>
   - ConflictInfo: { file, branches, conflictType, autoResolvable }

3. Create packages/server/src/integration/integration-service.ts:
   - IntegrationService class with methods:
     - integrate(parentWorkOrder, strategy): Promise<IntegrationResult>
     - performMerge(parentBranch, childBranch, workspace): Promise<MergeResult>
     - spawnIntegrationAgent(parentWorkOrder, childWorkOrders): Promise<WorkOrder>

4. Create unit tests for git operations and integration service

VERIFICATION:
- pnpm --filter @agentgate/server typecheck passes
- pnpm --filter @agentgate/server test passes
- Merge operations work correctly

FILES TO READ FIRST:
- packages/server/src/workspace/git-ops.ts
- packages/server/src/orchestrator/tree-coordinator.ts (created in WO3)
```

### Work Order 5: Deployment (Thrusts 9-10)

```
Implement configurable limits and Docker Compose setup.

CONTEXT:
This is DevGuide v0.2.10 - enabling deployment hardening.
Users need configurable concurrency and easy Docker deployment.

TASKS:
1. Update packages/server/src/orchestrator/orchestrator.ts:
   - Read AGENTGATE_MAX_CONCURRENT_RUNS from env (default: 5)
   - Read AGENTGATE_MAX_SPAWN_DEPTH from env (default: 3)
   - Read AGENTGATE_MAX_CHILDREN_PER_PARENT from env (default: 5)
   - Read AGENTGATE_MAX_TREE_SIZE from env (default: 20)

2. Update packages/server/src/server/routes/health.ts:
   - Add configured limits to health endpoint response

3. Create docker/Dockerfile.server:
   - Multi-stage build with Node 20 Alpine
   - Install git, create non-root user
   - Health check on /health/ready

4. Create docker/Dockerfile.dashboard:
   - Build Vite app, serve with nginx

5. Create docker/nginx.conf:
   - SPA routing, API/WebSocket proxy

6. Create docker-compose.yml:
   - server and dashboard services
   - Volume for data persistence
   - Resource limits

7. Create .env.example with all documented variables

8. Create scripts/docker-setup.sh

VERIFICATION:
- docker-compose build succeeds
- docker-compose up starts both containers
- Health endpoint shows correct limits
- Dashboard accessible at localhost:5173

FILES TO READ FIRST:
- packages/server/src/orchestrator/orchestrator.ts
- packages/server/src/server/routes/health.ts
- packages/dashboard/package.json
```

---

## Appendix C: File Structure After Implementation

```
packages/server/src/
├── types/
│   ├── work-order.ts        # Extended with tree fields
│   ├── spawn.ts             # NEW: Spawn types
│   └── index.ts             # Updated exports
├── orchestrator/
│   ├── orchestrator.ts      # Modified for env vars
│   ├── run-executor.ts      # Modified for spawn detection
│   ├── spawn-processor.ts   # NEW: Spawn handling
│   └── tree-coordinator.ts  # NEW: Tree lifecycle
├── control-plane/
│   └── tree-store.ts        # NEW: Tree persistence
├── integration/
│   ├── integration-service.ts   # NEW: Branch integration
│   └── conflict-detector.ts     # NEW: Conflict detection
├── workspace/
│   └── git-ops.ts           # Extended with merge ops
├── agent/
│   └── command-builder.ts   # Modified for spawn instructions
└── server/routes/
    └── health.ts            # Extended with limits

docker/
├── Dockerfile.server        # NEW
├── Dockerfile.dashboard     # NEW
└── nginx.conf              # NEW

docker-compose.yml          # NEW
docker-compose.dev.yml      # NEW
.env.example                # NEW
scripts/docker-setup.sh     # NEW
```

---

## Appendix D: Resource Guidelines

| Concurrent Runs | Recommended Memory | Recommended CPU |
|-----------------|-------------------|-----------------|
| 5 (default) | 2 GB | 2 cores |
| 10 | 4 GB | 4 cores |
| 20 | 8 GB | 8 cores |
| 50 | 16 GB | 16 cores |

**Per-agent estimates**:
- Claude Code subprocess: ~200-400 MB
- Node.js orchestrator overhead: ~100 MB per active run
- Git operations: ~50 MB temporary

---

## Appendix E: Troubleshooting

### Spawn request not detected

**Symptoms**: Agent creates `.agentgate/spawn-requests.json` but children not created

**Solutions**:
1. Verify file is valid JSON (check for syntax errors)
2. Verify file is in workspace root (not subdirectory)
3. Check orchestrator logs for validation errors
4. Verify spawn limits are not exceeded

### Children not executing

**Symptoms**: Children created but remain in QUEUED state

**Solutions**:
1. Check maxConcurrentRuns limit
2. Verify orchestrator is running
3. Check for errors in child work order creation

### Integration fails

**Symptoms**: Children complete but branches not merged

**Solutions**:
1. Check integration-service logs
2. Verify all children succeeded (failed children block integration)
3. Check for git conflicts in child branches
4. Verify GitHub token has push access

### Docker build fails

**Symptoms**: `docker-compose build` errors

**Solutions**:
1. Ensure pnpm-lock.yaml is committed
2. Run `pnpm install` locally first
3. Check Docker daemon is running
4. Verify sufficient disk space
