# 10 - Phase 3: Gradual Rollout

## Overview

Phase 3 enables gradual migration from legacy to new queue system using percentage-based routing. This allows:
- Safe production validation
- Metrics comparison between systems
- Quick rollback if issues arise

## Prerequisites

- Phase 2 complete (QueueFacade implemented and tested)
- Feature flags working correctly

## Implementation Tasks

### Task 1: Add Rollout Metrics Endpoint

Create `packages/server/src/server/routes/queue-rollout.ts`:

```typescript
/**
 * Queue Rollout API - Metrics and comparison for gradual migration
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/logger.js';
import { getQueueConfig } from '../../config/index.js';
import { getQueueFacade } from '../../queue/queue-facade.js';

const log = createLogger('queue-rollout-api');
const router = Router();

/**
 * GET /api/v1/queue/rollout - Get rollout status and metrics
 */
router.get('/rollout', async (req: Request, res: Response) => {
  try {
    const queueConfig = getQueueConfig();
    const facade = getQueueFacade();

    const response = {
      status: 'ok',
      rollout: {
        useNewQueueSystem: queueConfig.useNewQueueSystem,
        shadowMode: queueConfig.shadowMode,
        rolloutPercent: queueConfig.rolloutPercent,
      },
      stats: facade.getStats(),
      metrics: facade.getMetrics(),
      health: await facade.getHealth(),
    };

    res.json(response);
  } catch (error) {
    log.error({ error }, 'Failed to get rollout status');
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/queue/rollout/comparison - Compare legacy vs new metrics
 */
router.get('/rollout/comparison', async (req: Request, res: Response) => {
  try {
    const facade = getQueueFacade();
    const auditEvents = facade.getAuditEvents({ limit: 100 });

    // Analyze audit events for comparison
    const comparison = {
      legacyProcessed: 0,
      newProcessed: 0,
      shadowMismatches: [],
      recentEvents: auditEvents.slice(0, 10),
    };

    res.json({
      status: 'ok',
      comparison,
    });
  } catch (error) {
    log.error({ error }, 'Failed to get comparison');
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
```

### Task 2: Add Rollout Routes to Server

Modify `packages/server/src/server/index.ts` to include rollout routes:

```typescript
import queueRolloutRoutes from './routes/queue-rollout.js';

// In createApp():
app.use('/api/v1/queue', queueRolloutRoutes);
```

### Task 3: Add Rollout CLI Commands

Add to `packages/server/src/control-plane/commands/queue.ts`:

```typescript
/**
 * queue rollout - Show rollout status
 */
queueCommand
  .command('rollout')
  .description('Show queue system rollout status')
  .action(async () => {
    // Fetch from /api/v1/queue/rollout
    // Display status
  });

/**
 * queue rollout compare - Compare legacy vs new metrics
 */
queueCommand
  .command('rollout:compare')
  .description('Compare legacy vs new queue metrics')
  .action(async () => {
    // Fetch from /api/v1/queue/rollout/comparison
    // Display comparison
  });
```

### Task 4: Update Implementation Priority Tracker

After Phase 3 completion, update the tracker with validation status.

## Verification Checklist

- [ ] Rollout status endpoint works
- [ ] Comparison endpoint provides useful metrics
- [ ] CLI commands display status correctly
- [ ] Rollout percentage correctly routes work orders
- [ ] No performance regression at each rollout level
- [ ] All tests pass

## Rollout Schedule

1. **0%** - Development only (current)
2. **10%** - Initial validation
3. **25%** - Expanded testing
4. **50%** - Confidence building
5. **100%** - Full rollout

## Monitoring Checklist

At each rollout level, verify:

| Metric | Expected | Threshold |
|--------|----------|-----------|
| Error rate | Same as legacy | < 1% increase |
| p99 latency | Same as legacy | < 2x |
| Memory usage | Similar | < 20% increase |
| Queue depth | Stable | No growth |

## Rollback Procedure

If issues arise:

1. Set `AGENTGATE_QUEUE_USE_NEW_SYSTEM=false`
2. Restart server
3. Investigate logs and metrics
4. Fix issue and re-deploy
5. Resume rollout from previous percentage

## Next Steps

After Phase 3 validation at 100%:
- Phase 4: Remove legacy queue implementation
