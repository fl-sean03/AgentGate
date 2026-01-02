# 03 - Thrust: Wave 2 Automation

## Objective

Implement auto-queue processing and stale detection. These features depend on Wave 1 completion (specifically cancel, force kill, and timeout capabilities).

## Dependencies

Wave 2 requires the following Wave 1 features to be merged:

| Dependency | Wave 1 Task | Required For |
|------------|-------------|--------------|
| Cancel running | 1.1 | Stop work orders during processing |
| Force kill | 1.3 | Terminate stuck processes |
| Timeout | 1.4 | Auto-fail long-running work orders |

## Task 2.1: Auto-Queue Processing

**Priority**: CRITICAL
**Complexity**: High

### Current Behavior

```bash
# Work orders require manual trigger
curl -X POST /api/v1/work-orders              # Submit (queued)
# ... work order sits in queue forever ...
curl -X POST /api/v1/work-orders/:id/runs     # Manual trigger (running)
```

### Target Behavior

```bash
# Work orders auto-process
curl -X POST /api/v1/work-orders              # Submit
# ... automatically starts when slot available ...
# No manual trigger needed
```

### Implementation

**File: `packages/server/src/control-plane/queue-manager.ts`**

```typescript
interface QueueManagerConfig {
  maxConcurrent: number;
  pollIntervalMs: number;
  staggerDelayMs: number;
  autoProcess: boolean;
}

const DEFAULT_CONFIG: QueueManagerConfig = {
  maxConcurrent: 2,
  pollIntervalMs: 5000,      // Check queue every 5 seconds
  staggerDelayMs: 30000,     // 30 seconds between starts
  autoProcess: true,
};

export class QueueManager {
  private readonly config: QueueManagerConfig;
  private readonly logger: Logger;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastStartTime: number = 0;
  private isProcessing: boolean = false;
  private shuttingDown: boolean = false;

  constructor(
    private readonly workOrderStore: WorkOrderStore,
    private readonly runExecutor: RunExecutor,
    config: Partial<QueueManagerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('queue-manager');
  }

  /**
   * Start auto-processing of queued work orders.
   */
  startProcessing(): void {
    if (this.pollTimer) {
      this.logger.warn('Processing already started');
      return;
    }

    this.logger.info(
      { config: this.config },
      'Starting queue processing'
    );

    this.pollTimer = setInterval(() => {
      this.processQueue().catch(err => {
        this.logger.error({ err }, 'Error processing queue');
      });
    }, this.config.pollIntervalMs);

    // Initial check
    this.processQueue().catch(err => {
      this.logger.error({ err }, 'Error in initial queue check');
    });
  }

  /**
   * Stop processing (for graceful shutdown).
   */
  async stopProcessing(): Promise<void> {
    this.shuttingDown = true;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.logger.info('Queue processing stopped');

    // Wait for any in-progress processing to complete
    if (this.isProcessing) {
      this.logger.info('Waiting for current processing to complete...');
      await this.waitForProcessingComplete();
    }
  }

  /**
   * Process the queue - start work orders if slots available.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.shuttingDown) return;

    this.isProcessing = true;

    try {
      const workOrders = await this.workOrderStore.list();
      const running = workOrders.filter(wo => wo.status === 'running');
      const queued = workOrders.filter(wo => wo.status === 'queued');

      // Check if we have capacity
      if (running.length >= this.config.maxConcurrent) {
        this.logger.debug(
          { running: running.length, max: this.config.maxConcurrent },
          'At capacity, skipping'
        );
        return;
      }

      // Check stagger delay
      const timeSinceLastStart = Date.now() - this.lastStartTime;
      if (timeSinceLastStart < this.config.staggerDelayMs && this.lastStartTime > 0) {
        this.logger.debug(
          { timeSinceLastStart, staggerDelay: this.config.staggerDelayMs },
          'Stagger delay not met'
        );
        return;
      }

      // Get next queued work order (FIFO)
      const nextWorkOrder = queued[0];
      if (!nextWorkOrder) {
        return;  // Nothing to process
      }

      // Check memory before starting
      const memInfo = await this.getMemoryInfo();
      if (memInfo.availableMB < 2048) {  // 2GB minimum
        this.logger.warn(
          { availableMB: memInfo.availableMB },
          'Insufficient memory, delaying start'
        );
        return;
      }

      // Start the work order
      this.logger.info(
        { workOrderId: nextWorkOrder.id, queuedCount: queued.length, runningCount: running.length },
        'Starting work order from queue'
      );

      this.lastStartTime = Date.now();
      await this.startWorkOrder(nextWorkOrder.id);

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get memory information.
   */
  private async getMemoryInfo(): Promise<{ totalMB: number; availableMB: number }> {
    const os = await import('os');
    const total = os.totalmem();
    const free = os.freemem();
    return {
      totalMB: Math.floor(total / 1024 / 1024),
      availableMB: Math.floor(free / 1024 / 1024),
    };
  }

  /**
   * Wait for processing to complete.
   */
  private async waitForProcessingComplete(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    while (this.isProcessing && Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // ... existing methods ...
}
```

**File: `packages/server/src/server/commands/serve.ts`**

```typescript
import { Command } from 'commander';

export function createServeCommand(): Command {
  return new Command('serve')
    .description('Start the AgentGate server')
    .option('--port <port>', 'Port to listen on', '3001')
    .option('--api-key <key>', 'API key for authentication')
    .option('--auto-process', 'Automatically process queued work orders', true)
    .option('--no-auto-process', 'Disable auto-processing')
    .option('--max-concurrent <n>', 'Maximum concurrent work orders', '2')
    .option('--stagger-delay <ms>', 'Delay between starting work orders', '30000')
    .action(async (options) => {
      // ... server setup ...

      if (options.autoProcess) {
        queueManager.startProcessing();
      }

      // Graceful shutdown
      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully');
        await queueManager.stopProcessing();
        await server.close();
        process.exit(0);
      });

      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully');
        await queueManager.stopProcessing();
        await server.close();
        process.exit(0);
      });
    });
}
```

### Verification

- [ ] Submit work order → automatically starts without manual trigger
- [ ] Submit 5 work orders with maxConcurrent=2 → 2 run, 3 queue
- [ ] As work orders complete → queued ones auto-start
- [ ] Stagger delay respected between starts
- [ ] Memory check prevents OOM
- [ ] Graceful shutdown waits for running work orders

---

## Task 2.2: Stale Work Order Detection

**Priority**: HIGH
**Complexity**: Medium
**Depends on**: 2.1 (Auto-Queue), 1.3 (Force Kill)

### Problem

```typescript
// Agent process dies externally (OOM killer, manual kill)
// Work order shows 'running' forever
// No way to detect and recover
```

### Solution

```typescript
// StaleDetector monitors running work orders
// Checks if process is still alive
// If dead, marks as failed and allows retry
```

### Implementation

**File: `packages/server/src/control-plane/stale-detector.ts` (NEW)**

```typescript
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type { WorkOrderStore } from './work-order-store.js';
import { agentProcessManager } from './agent-process-manager.js';

interface StaleDetectorConfig {
  checkIntervalMs: number;    // How often to check
  staleThresholdMs: number;   // How long without activity before considered stale
  maxRunningTimeMs: number;   // Maximum allowed running time
}

const DEFAULT_CONFIG: StaleDetectorConfig = {
  checkIntervalMs: 60000,           // Check every minute
  staleThresholdMs: 10 * 60000,     // 10 minutes without activity
  maxRunningTimeMs: 4 * 3600000,    // 4 hours max
};

interface StaleCheck {
  workOrderId: string;
  status: 'healthy' | 'stale' | 'dead';
  reason?: string;
  runningTime: number;
  lastActivity?: Date;
}

export class StaleDetector {
  private readonly logger: Logger;
  private readonly config: StaleDetectorConfig;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly workOrderStore: WorkOrderStore,
    config: Partial<StaleDetectorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('stale-detector');
  }

  /**
   * Start periodic stale detection.
   */
  start(): void {
    if (this.checkTimer) return;

    this.logger.info(
      { config: this.config },
      'Starting stale detector'
    );

    this.checkTimer = setInterval(() => {
      this.checkForStaleWorkOrders().catch(err => {
        this.logger.error({ err }, 'Error checking for stale work orders');
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop stale detection.
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      this.logger.info('Stale detector stopped');
    }
  }

  /**
   * Check all running work orders for staleness.
   */
  async checkForStaleWorkOrders(): Promise<StaleCheck[]> {
    const workOrders = await this.workOrderStore.list();
    const running = workOrders.filter(wo => wo.status === 'running');

    const results: StaleCheck[] = [];

    for (const wo of running) {
      const check = await this.checkWorkOrder(wo);
      results.push(check);

      if (check.status !== 'healthy') {
        await this.handleStaleWorkOrder(wo.id, check);
      }
    }

    return results;
  }

  /**
   * Check a single work order for staleness.
   */
  private async checkWorkOrder(wo: WorkOrder): Promise<StaleCheck> {
    const startTime = wo.startedAt ? new Date(wo.startedAt).getTime() : Date.now();
    const runningTime = Date.now() - startTime;

    // Check if process is still alive
    const proc = agentProcessManager.getProcess(wo.id);

    if (!proc) {
      // No process tracked - might have crashed
      return {
        workOrderId: wo.id,
        status: 'dead',
        reason: 'No process found',
        runningTime,
      };
    }

    // Check if process PID is still running
    const isAlive = this.isProcessAlive(proc.pid);

    if (!isAlive) {
      return {
        workOrderId: wo.id,
        status: 'dead',
        reason: `Process ${proc.pid} is not running`,
        runningTime,
      };
    }

    // Check if exceeded max running time
    if (runningTime > this.config.maxRunningTimeMs) {
      return {
        workOrderId: wo.id,
        status: 'stale',
        reason: `Running for ${Math.round(runningTime / 60000)} minutes (max: ${Math.round(this.config.maxRunningTimeMs / 60000)})`,
        runningTime,
      };
    }

    // Check last activity (if tracked)
    if (wo.lastActivityAt) {
      const timeSinceActivity = Date.now() - new Date(wo.lastActivityAt).getTime();
      if (timeSinceActivity > this.config.staleThresholdMs) {
        return {
          workOrderId: wo.id,
          status: 'stale',
          reason: `No activity for ${Math.round(timeSinceActivity / 60000)} minutes`,
          runningTime,
          lastActivity: new Date(wo.lastActivityAt),
        };
      }
    }

    return {
      workOrderId: wo.id,
      status: 'healthy',
      runningTime,
    };
  }

  /**
   * Check if a process is still alive.
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);  // Signal 0 checks if process exists
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle a stale or dead work order.
   */
  private async handleStaleWorkOrder(workOrderId: string, check: StaleCheck): Promise<void> {
    this.logger.warn(
      { workOrderId, check },
      'Detected stale work order'
    );

    // Try to kill the process if it exists
    const killed = await agentProcessManager.kill(workOrderId, true);

    // Mark as failed
    await this.workOrderStore.update(workOrderId, {
      status: 'failed',
      failedAt: new Date(),
      error: `Stale detection: ${check.reason}`,
    });

    this.logger.info(
      { workOrderId, killed, reason: check.reason },
      'Marked stale work order as failed'
    );
  }
}
```

**File: `packages/server/src/control-plane/queue-manager.ts`**

Add activity tracking:

```typescript
// When work order makes progress, update lastActivityAt
async recordActivity(workOrderId: string): Promise<void> {
  await this.workOrderStore.update(workOrderId, {
    lastActivityAt: new Date(),
  });
}
```

### Verification

- [ ] Work order running normally → status healthy
- [ ] Kill agent process externally → detected as dead within check interval
- [ ] Work order running > max time → detected as stale
- [ ] Stale work order → killed and marked failed
- [ ] Logs show detection events

---

## Work Order Submission Commands

Wave 2 tasks must be submitted **sequentially** after Wave 1 is merged:

```bash
# Wait for Wave 1 PRs to be merged first

# 2.1 Auto-Queue Processing
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement auto-queue processing (v0.2.23 Wave 2.1)\n\nFollow docs/DevGuides/DevGuide_v0.2.23/03-thrust-wave2-automation.md Task 2.1\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": { "type": "github", "url": "https://github.com/fl-sean03/AgentGate" },
    "agentType": "claude-code-subscription",
    "maxIterations": 10
  }'

# Wait for 2.1 to complete and merge before 2.2

# 2.2 Stale Work Order Detection
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement stale work order detection (v0.2.23 Wave 2.2)\n\nFollow docs/DevGuides/DevGuide_v0.2.23/03-thrust-wave2-automation.md Task 2.2\n\nValidation: pnpm typecheck && pnpm test",
    "workspaceSource": { "type": "github", "url": "https://github.com/fl-sean03/AgentGate" },
    "agentType": "claude-code-subscription",
    "maxIterations": 10
  }'
```

## Verification Checklist

After Wave 2 completes:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] Submit work order → auto-starts without trigger
- [ ] Kill agent process → detected and marked failed
- [ ] Server shutdown → graceful with running work order completion
- [ ] Merge Wave 2 PRs
- [ ] Proceed to Wave 3 (can run parallel)
