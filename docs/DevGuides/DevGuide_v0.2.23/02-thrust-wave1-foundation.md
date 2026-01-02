# 02 - Thrust: Wave 1 Foundation Fixes

## Objective

Implement 8 parallel foundation fixes that address critical bugs in the current queue system. All tasks in Wave 1 are independent and can be executed concurrently.

## Task 1.1: Cancel Running Work Orders

**Priority**: CRITICAL
**Complexity**: Medium

### Current Behavior
```typescript
// Only queued work orders can be canceled
if (workOrder.status !== 'queued') {
  throw new Error('Can only cancel queued work orders');
}
```

### Target Behavior
```typescript
// Cancel works for both queued and running
// Running work orders have their process terminated
await workOrderService.cancel(id);  // Works for any non-terminal status
```

### Implementation

**File: `packages/server/src/control-plane/work-order-service.ts`**

```typescript
// Add PID tracking
interface RunningWorkOrder {
  workOrderId: string;
  pid: number;
  startedAt: Date;
}

// Track running processes
private runningProcesses: Map<string, RunningWorkOrder> = new Map();

async cancel(id: string): Promise<{ killed: boolean }> {
  const workOrder = await this.store.get(id);

  // Already terminal
  if (['completed', 'failed', 'cancelled'].includes(workOrder.status)) {
    throw new Error(`Work order ${id} is already in terminal state: ${workOrder.status}`);
  }

  // If running, kill the process
  let killed = false;
  if (workOrder.status === 'running') {
    const running = this.runningProcesses.get(id);
    if (running) {
      try {
        process.kill(running.pid, 'SIGTERM');
        killed = true;
        this.logger.info({ workOrderId: id, pid: running.pid }, 'Sent SIGTERM to running process');
      } catch (err) {
        this.logger.warn({ workOrderId: id, pid: running.pid, err }, 'Failed to kill process');
      }
    }
  }

  // Update status
  await this.store.update(id, { status: 'cancelled', cancelledAt: new Date() });
  this.runningProcesses.delete(id);

  return { killed };
}
```

**File: `packages/server/src/server/routes/work-orders.ts`**

```typescript
// Update cancel endpoint response
router.post('/:id/cancel', async (req, res) => {
  const { killed } = await workOrderService.cancel(req.params.id);
  res.json({ success: true, killed });
});
```

### Verification
- [ ] Cancel queued work order → succeeds
- [ ] Cancel running work order → process terminated, status = cancelled
- [ ] Cancel completed work order → error thrown
- [ ] Unit tests pass

---

## Task 1.2: Work Order Purge API

**Priority**: HIGH
**Complexity**: Low

### Implementation

**File: `packages/server/src/control-plane/work-order-store.ts`**

```typescript
async purge(id: string): Promise<void> {
  const filePath = this.getFilePath(id);

  if (!await exists(filePath)) {
    throw new NotFoundError(`Work order ${id} not found`);
  }

  await fs.unlink(filePath);
  this.logger.info({ workOrderId: id }, 'Work order purged');
}

async purgeByStatus(status: WorkOrderStatus): Promise<number> {
  const workOrders = await this.list();
  const toPurge = workOrders.filter(wo => wo.status === status);

  for (const wo of toPurge) {
    await this.purge(wo.id);
  }

  return toPurge.length;
}
```

**File: `packages/server/src/server/routes/work-orders.ts`**

```typescript
// Single purge
router.delete('/:id', async (req, res) => {
  const { purge } = req.query;

  if (purge === 'true') {
    // First cancel if running
    const workOrder = await workOrderService.get(req.params.id);
    if (workOrder.status === 'running') {
      await workOrderService.cancel(req.params.id);
    }
    await workOrderStore.purge(req.params.id);
    res.json({ success: true, purged: true });
  } else {
    // Standard cancel
    await workOrderService.cancel(req.params.id);
    res.json({ success: true, cancelled: true });
  }
});

// Batch purge
router.delete('/', async (req, res) => {
  const { status, purge } = req.query;

  if (purge !== 'true') {
    return res.status(400).json({ error: 'Batch delete requires purge=true' });
  }

  if (!status) {
    return res.status(400).json({ error: 'Status filter required for batch purge' });
  }

  const count = await workOrderStore.purgeByStatus(status as WorkOrderStatus);
  res.json({ success: true, purged: count });
});
```

### Verification
- [ ] Purge single work order → file deleted from storage
- [ ] Purge running work order → canceled first, then purged
- [ ] Batch purge by status → all matching work orders purged
- [ ] Purge non-existent → 404 error

---

## Task 1.3: Force Kill Capability

**Priority**: CRITICAL
**Complexity**: Medium

### Implementation

**File: `packages/server/src/control-plane/agent-process-manager.ts` (NEW)**

```typescript
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';

interface ManagedProcess {
  workOrderId: string;
  pid: number;
  startedAt: Date;
  command: string;
}

export class AgentProcessManager {
  private readonly logger: Logger;
  private readonly processes: Map<string, ManagedProcess> = new Map();

  constructor() {
    this.logger = createLogger('agent-process-manager');
  }

  register(workOrderId: string, pid: number, command: string): void {
    this.processes.set(workOrderId, {
      workOrderId,
      pid,
      startedAt: new Date(),
      command,
    });
    this.logger.info({ workOrderId, pid }, 'Process registered');
  }

  unregister(workOrderId: string): void {
    this.processes.delete(workOrderId);
  }

  getProcess(workOrderId: string): ManagedProcess | undefined {
    return this.processes.get(workOrderId);
  }

  async kill(workOrderId: string, force: boolean = false): Promise<boolean> {
    const proc = this.processes.get(workOrderId);
    if (!proc) {
      this.logger.warn({ workOrderId }, 'No process found to kill');
      return false;
    }

    try {
      if (force) {
        // Immediate SIGKILL
        process.kill(proc.pid, 'SIGKILL');
        this.logger.info({ workOrderId, pid: proc.pid }, 'Force killed (SIGKILL)');
      } else {
        // Graceful: SIGTERM, wait 5s, then SIGKILL
        process.kill(proc.pid, 'SIGTERM');
        this.logger.info({ workOrderId, pid: proc.pid }, 'Sent SIGTERM');

        // Wait 5 seconds for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check if still running
        try {
          process.kill(proc.pid, 0);  // Check if process exists
          // Still running, force kill
          process.kill(proc.pid, 'SIGKILL');
          this.logger.info({ workOrderId, pid: proc.pid }, 'Force killed after timeout');
        } catch {
          // Process already dead, good
        }
      }

      this.processes.delete(workOrderId);
      return true;
    } catch (err) {
      this.logger.error({ workOrderId, pid: proc.pid, err }, 'Failed to kill process');
      return false;
    }
  }

  getAll(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }
}

export const agentProcessManager = new AgentProcessManager();
```

**File: `packages/server/src/server/routes/work-orders.ts`**

```typescript
// Add kill endpoint
router.post('/:id/kill', async (req, res) => {
  const { force } = req.query;
  const workOrder = await workOrderService.get(req.params.id);

  if (workOrder.status !== 'running') {
    return res.status(400).json({
      error: `Work order ${req.params.id} is not running (status: ${workOrder.status})`
    });
  }

  const killed = await agentProcessManager.kill(req.params.id, force === 'true');

  if (killed) {
    await workOrderService.markFailed(req.params.id, 'Force killed by user');
  }

  res.json({ success: killed, force: force === 'true' });
});
```

### Verification
- [ ] Kill running work order → SIGTERM sent, process terminates
- [ ] Force kill → SIGKILL sent immediately
- [ ] Kill non-running → 400 error
- [ ] Kill with stuck process → escalates to SIGKILL after 5s

---

## Task 1.4: Work Order Timeout Enforcement

**Priority**: HIGH
**Complexity**: Medium

### Implementation

**File: `packages/server/src/control-plane/queue-manager.ts`**

```typescript
interface TimeoutTracker {
  workOrderId: string;
  timeoutAt: Date;
  timerId: NodeJS.Timeout;
}

private timeouts: Map<string, TimeoutTracker> = new Map();

async startWorkOrder(workOrderId: string): Promise<void> {
  const workOrder = await this.workOrderStore.get(workOrderId);
  const maxTimeMs = workOrder.config?.maxTime ?? 3600000;  // Default 1 hour

  // Calculate timeout
  const timeoutAt = new Date(Date.now() + maxTimeMs);

  // Set timer
  const timerId = setTimeout(() => {
    this.handleTimeout(workOrderId);
  }, maxTimeMs);

  this.timeouts.set(workOrderId, { workOrderId, timeoutAt, timerId });

  // Update work order with timeout info
  await this.workOrderStore.update(workOrderId, {
    status: 'running',
    startedAt: new Date(),
    timeoutAt,
  });

  // ... start execution
}

private async handleTimeout(workOrderId: string): Promise<void> {
  this.logger.warn({ workOrderId }, 'Work order timed out');

  // Kill the process
  await agentProcessManager.kill(workOrderId, true);

  // Mark as failed
  await this.workOrderStore.update(workOrderId, {
    status: 'failed',
    failedAt: new Date(),
    error: 'Execution timed out',
  });

  this.timeouts.delete(workOrderId);
}

// Clear timeout when work order completes normally
async completeWorkOrder(workOrderId: string): Promise<void> {
  const tracker = this.timeouts.get(workOrderId);
  if (tracker) {
    clearTimeout(tracker.timerId);
    this.timeouts.delete(workOrderId);
  }
  // ... rest of completion logic
}
```

### Verification
- [ ] Work order with maxTime: 60s → auto-killed after 60s
- [ ] Work order completes before timeout → timeout cleared
- [ ] timeoutAt visible in work order response

---

## Task 1.5: Storage Validation on Startup

**Priority**: MEDIUM
**Complexity**: Low

### Implementation

**File: `packages/server/src/control-plane/work-order-store.ts`**

```typescript
private readonly quarantineDir: string;

constructor(baseDir: string) {
  this.baseDir = baseDir;
  this.quarantineDir = path.join(baseDir, '.quarantine');
}

async validateStorage(): Promise<{ valid: number; quarantined: number }> {
  await fs.mkdir(this.quarantineDir, { recursive: true });

  const files = await fs.readdir(this.baseDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  let valid = 0;
  let quarantined = 0;

  for (const file of jsonFiles) {
    const filePath = path.join(this.baseDir, file);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      JSON.parse(content);  // Validate JSON
      valid++;
    } catch (err) {
      // Quarantine corrupted file
      const quarantinePath = path.join(this.quarantineDir, file);
      await fs.rename(filePath, quarantinePath);

      this.logger.warn(
        { file, quarantinePath, error: err instanceof Error ? err.message : String(err) },
        'Quarantined corrupted work order file'
      );

      quarantined++;
    }
  }

  this.logger.info({ valid, quarantined }, 'Storage validation complete');
  return { valid, quarantined };
}
```

**File: `packages/server/src/server/app.ts`**

```typescript
// On startup
await workOrderStore.validateStorage();
```

### Verification
- [ ] Place malformed JSON in work-orders/ → quarantined on startup
- [ ] Valid files remain in place
- [ ] Quarantine directory created if missing

---

## Task 1.6: Run Store Orphan Cleanup

**Priority**: MEDIUM
**Complexity**: Low

### Implementation

**File: `packages/server/src/control-plane/run-store.ts`**

```typescript
async cleanupOrphans(workOrderStore: WorkOrderStore): Promise<number> {
  const workOrders = await workOrderStore.list();
  let cleanedUp = 0;

  for (const wo of workOrders) {
    if (wo.currentRunId) {
      const runExists = await this.exists(wo.currentRunId);

      if (!runExists) {
        this.logger.warn(
          { workOrderId: wo.id, runId: wo.currentRunId },
          'Found orphaned run reference'
        );

        // Remove the orphaned reference
        await workOrderStore.update(wo.id, { currentRunId: undefined });
        cleanedUp++;
      }
    }
  }

  this.logger.info({ cleanedUp }, 'Orphan cleanup complete');
  return cleanedUp;
}

private async exists(runId: string): Promise<boolean> {
  const filePath = this.getFilePath(runId);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
```

### Verification
- [ ] Work order with missing run → reference removed
- [ ] Valid run references preserved

---

## Task 1.7: Queue Health Dashboard Endpoint

**Priority**: MEDIUM
**Complexity**: Low

### Implementation

**File: `packages/server/src/server/routes/queue.ts` (NEW)**

```typescript
import { Router } from 'express';
import type { QueueManager } from '../../control-plane/queue-manager.js';
import type { WorkOrderStore } from '../../control-plane/work-order-store.js';

interface QueueHealthResponse {
  runningCount: number;
  maxConcurrent: number;
  queuedCount: number;
  completedCount: number;
  failedCount: number;
  oldestRunningAge: number | null;
  stuckThreshold: number;
  alerts: string[];
  timestamp: string;
}

export function createQueueRoutes(
  queueManager: QueueManager,
  workOrderStore: WorkOrderStore
): Router {
  const router = Router();

  router.get('/health', async (req, res) => {
    const workOrders = await workOrderStore.list();

    const running = workOrders.filter(wo => wo.status === 'running');
    const queued = workOrders.filter(wo => wo.status === 'queued');
    const completed = workOrders.filter(wo => wo.status === 'completed');
    const failed = workOrders.filter(wo => wo.status === 'failed');

    // Calculate oldest running age
    let oldestRunningAge: number | null = null;
    if (running.length > 0) {
      const ages = running.map(wo =>
        wo.startedAt ? Date.now() - new Date(wo.startedAt).getTime() : 0
      );
      oldestRunningAge = Math.max(...ages);
    }

    // Detect alerts
    const alerts: string[] = [];
    const stuckThreshold = 30 * 60 * 1000;  // 30 minutes

    if (oldestRunningAge && oldestRunningAge > stuckThreshold) {
      alerts.push(`Work order running for ${Math.round(oldestRunningAge / 60000)} minutes`);
    }

    if (queued.length > 10) {
      alerts.push(`High queue depth: ${queued.length} work orders waiting`);
    }

    const health: QueueHealthResponse = {
      runningCount: running.length,
      maxConcurrent: queueManager.maxConcurrent,
      queuedCount: queued.length,
      completedCount: completed.length,
      failedCount: failed.length,
      oldestRunningAge,
      stuckThreshold,
      alerts,
      timestamp: new Date().toISOString(),
    };

    res.json(health);
  });

  return router;
}
```

### Verification
- [ ] Endpoint returns accurate counts
- [ ] Alerts generated for stuck work orders
- [ ] Alerts generated for high queue depth

---

## Task 1.8: Fix Workspace Source API

**Priority**: HIGH
**Complexity**: Low

### Implementation

**File: `packages/server/src/server/routes/work-orders.ts`**

```typescript
function mapWorkspaceSource(input: WorkspaceSourceInput): WorkspaceSource {
  // Priority 1: GitHub URL
  if (input.url) {
    const match = input.url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return {
        type: 'github',
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
        branch: input.branch,
      };
    }
    throw new Error(`Invalid GitHub URL: ${input.url}`);
  }

  // Priority 2: Explicit owner field
  if (input.owner && input.repo) {
    return {
      type: 'github',
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
    };
  }

  // Priority 3: Combined repo (owner/repo format)
  if (input.repo && input.repo.includes('/')) {
    const [owner, repo] = input.repo.split('/');
    return {
      type: 'github',
      owner,
      repo,
      branch: input.branch,
    };
  }

  // Priority 4: Fallback to env var
  const defaultOwner = process.env.AGENTGATE_GITHUB_OWNER;
  if (defaultOwner && input.repo) {
    return {
      type: 'github',
      owner: defaultOwner,
      repo: input.repo,
      branch: input.branch,
    };
  }

  throw new Error('Could not determine repository owner. Provide url, owner+repo, or owner/repo format.');
}
```

**File: `packages/shared/src/types/api.ts`**

```typescript
// Update schema to document supported formats
export interface WorkspaceSourceInput {
  type: 'github';
  /** GitHub URL (e.g., "https://github.com/owner/repo") - preferred */
  url?: string;
  /** Repository owner (e.g., "anthropics") */
  owner?: string;
  /** Repository name (e.g., "claude-code") or combined "owner/repo" */
  repo?: string;
  /** Branch name (optional, defaults to main) */
  branch?: string;
}
```

### Verification
- [ ] Submit with URL → works
- [ ] Submit with owner + repo → works
- [ ] Submit with owner/repo format → works
- [ ] Submit with only repo + env var → works
- [ ] Submit with insufficient info → clear error

---

## Work Order Submission Commands

All Wave 1 work orders can be submitted simultaneously:

```bash
# See docs/proposals/queue-robustness-v0.2.23.md for full curl commands
# Submit all 8, then trigger with 60s stagger:

for id in $WORK_ORDER_IDS; do
  curl -X POST "http://localhost:3001/api/v1/work-orders/$id/runs" \
    -H "Authorization: Bearer $API_KEY"
  echo "Triggered $id, waiting 60s..."
  sleep 60
done
```

## Verification Checklist

After all Wave 1 work orders complete:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] All 8 PRs created
- [ ] Manual testing of each feature
- [ ] Merge all PRs
- [ ] Proceed to Wave 2
