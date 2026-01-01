# 05: Run Streaming API

This document covers Thrust 4: implementing Server-Sent Events (SSE) for real-time run updates.

---

## Thrust 4: Run Streaming API

### 4.1 Objective

Implement SSE endpoints for streaming real-time run events to clients, enabling live monitoring of work order execution without polling.

### 4.2 Background

Currently, clients must poll the API to get run status updates. SSE provides a more efficient push-based mechanism. SSE is preferred over WebSocket for this unidirectional use case due to simpler implementation and better proxy compatibility.

### 4.3 Subtasks

#### 4.3.1 Create Stream Event Types

Create `packages/server/src/server/types/stream.ts`:

```typescript
import { z } from 'zod';

// Base event schema
export const baseEventSchema = z.object({
  runId: z.string(),
  timestamp: z.string(), // ISO date
});

// Event type enum
export const streamEventType = z.enum([
  'connected',
  'run-start',
  'iteration-start',
  'agent-output',
  'verification-start',
  'verification-complete',
  'ci-start',
  'ci-complete',
  'iteration-complete',
  'run-complete',
  'error',
  'heartbeat',
]);

export type StreamEventType = z.infer<typeof streamEventType>;

// Connected event
export const connectedEventSchema = baseEventSchema.extend({
  type: z.literal('connected'),
  data: z.object({
    clientId: z.string(),
    runStatus: z.string(),
    currentIteration: z.number(),
  }),
});

// Run start event
export const runStartEventSchema = baseEventSchema.extend({
  type: z.literal('run-start'),
  data: z.object({
    workOrderId: z.string(),
    config: z.object({
      loopStrategy: z.object({
        mode: z.string(),
        maxIterations: z.number(),
      }),
    }),
  }),
});

// Iteration start event
export const iterationStartEventSchema = baseEventSchema.extend({
  type: z.literal('iteration-start'),
  data: z.object({
    iteration: z.number(),
    maxIterations: z.number(),
  }),
});

// Agent output event (incremental)
export const agentOutputEventSchema = baseEventSchema.extend({
  type: z.literal('agent-output'),
  data: z.object({
    iteration: z.number(),
    chunk: z.string(),         // Text chunk
    isComplete: z.boolean(),   // True if agent finished
  }),
});

// Verification events
export const verificationStartEventSchema = baseEventSchema.extend({
  type: z.literal('verification-start'),
  data: z.object({
    iteration: z.number(),
    level: z.string(),
  }),
});

export const verificationCompleteEventSchema = baseEventSchema.extend({
  type: z.literal('verification-complete'),
  data: z.object({
    iteration: z.number(),
    level: z.string(),
    passed: z.boolean(),
    message: z.string().optional(),
  }),
});

// CI events
export const ciStartEventSchema = baseEventSchema.extend({
  type: z.literal('ci-start'),
  data: z.object({
    iteration: z.number(),
    prUrl: z.string().optional(),
  }),
});

export const ciCompleteEventSchema = baseEventSchema.extend({
  type: z.literal('ci-complete'),
  data: z.object({
    iteration: z.number(),
    passed: z.boolean(),
    checkUrl: z.string().optional(),
  }),
});

// Iteration complete event
export const iterationCompleteEventSchema = baseEventSchema.extend({
  type: z.literal('iteration-complete'),
  data: z.object({
    iteration: z.number(),
    decision: z.object({
      shouldContinue: z.boolean(),
      reason: z.string(),
      action: z.string(),
    }),
    verificationPassed: z.boolean(),
  }),
});

// Run complete event
export const runCompleteEventSchema = baseEventSchema.extend({
  type: z.literal('run-complete'),
  data: z.object({
    status: z.enum(['succeeded', 'failed', 'canceled']),
    totalIterations: z.number(),
    prUrl: z.string().optional(),
    message: z.string().optional(),
  }),
});

// Error event
export const errorEventSchema = baseEventSchema.extend({
  type: z.literal('error'),
  data: z.object({
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
});

// Heartbeat event
export const heartbeatEventSchema = baseEventSchema.extend({
  type: z.literal('heartbeat'),
  data: z.object({
    serverTime: z.string(),
  }),
});

// Union of all event types
export const streamEventSchema = z.discriminatedUnion('type', [
  connectedEventSchema,
  runStartEventSchema,
  iterationStartEventSchema,
  agentOutputEventSchema,
  verificationStartEventSchema,
  verificationCompleteEventSchema,
  ciStartEventSchema,
  ciCompleteEventSchema,
  iterationCompleteEventSchema,
  runCompleteEventSchema,
  errorEventSchema,
  heartbeatEventSchema,
]);

export type StreamEvent = z.infer<typeof streamEventSchema>;

// SSE format helper
export function formatSSE(event: StreamEvent): string {
  const lines: string[] = [];
  lines.push(`event: ${event.type}`);
  lines.push(`data: ${JSON.stringify(event)}`);
  lines.push(''); // Empty line terminates event
  return lines.join('\n') + '\n';
}
```

#### 4.3.2 Create Stream Manager

Create `packages/server/src/server/stream/stream-manager.ts`:

```typescript
import { EventEmitter } from 'events';
import { StreamEvent, formatSSE } from '../types/stream.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('stream-manager');

interface StreamClient {
  id: string;
  runId: string;
  send: (data: string) => void;
  close: () => void;
  createdAt: Date;
}

class StreamManager extends EventEmitter {
  private clients: Map<string, StreamClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startHeartbeat();
  }

  /**
   * Register a new SSE client for a run
   */
  addClient(client: StreamClient): void {
    this.clients.set(client.id, client);
    logger.info({ clientId: client.id, runId: client.runId }, 'Client connected');

    // Send connected event
    const event: StreamEvent = {
      type: 'connected',
      runId: client.runId,
      timestamp: new Date().toISOString(),
      data: {
        clientId: client.id,
        runStatus: 'connected',
        currentIteration: 0,
      },
    };
    client.send(formatSSE(event));
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      logger.info({ clientId }, 'Client disconnected');
    }
  }

  /**
   * Broadcast event to all clients watching a run
   */
  broadcast(runId: string, event: StreamEvent): void {
    const formatted = formatSSE(event);
    let sentCount = 0;

    for (const client of this.clients.values()) {
      if (client.runId === runId) {
        try {
          client.send(formatted);
          sentCount++;
        } catch (error) {
          logger.error({ err: error, clientId: client.id }, 'Failed to send event');
          this.removeClient(client.id);
        }
      }
    }

    logger.debug({ runId, eventType: event.type, sentCount }, 'Broadcast event');
  }

  /**
   * Send event to specific client
   */
  sendToClient(clientId: string, event: StreamEvent): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.send(formatSSE(event));
      } catch (error) {
        logger.error({ err: error, clientId }, 'Failed to send event');
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Get client count for a run
   */
  getClientCount(runId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.runId === runId) count++;
    }
    return count;
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date().toISOString();
      for (const client of this.clients.values()) {
        const event: StreamEvent = {
          type: 'heartbeat',
          runId: client.runId,
          timestamp: now,
          data: { serverTime: now },
        };
        try {
          client.send(formatSSE(event));
        } catch {
          this.removeClient(client.id);
        }
      }
    }, 30000); // 30 second heartbeat
  }

  /**
   * Cleanup
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    for (const client of this.clients.values()) {
      client.close();
    }
    this.clients.clear();
  }
}

// Singleton instance
export const streamManager = new StreamManager();
```

#### 4.3.3 Create Stream Routes

Create `packages/server/src/server/routes/stream.ts`:

```typescript
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import { createErrorResponse, ErrorCode } from '../types.js';
import { streamManager } from '../stream/stream-manager.js';
import { loadRun } from '../../orchestrator/run-store.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:stream');

export function registerStreamRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/runs/:id/stream - SSE stream for run events
   */
  app.get<{ Params: { id: string } }>(
    '/api/v1/runs/:id/stream',
    async (request, reply) => {
      const { id: runId } = request.params;

      // Verify run exists
      const run = await loadRun(runId);
      if (!run) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Run not found: ${runId}`,
          undefined,
          request.id
        ));
      }

      // Check if run is still active
      const terminalStates = ['SUCCEEDED', 'FAILED', 'CANCELED'];
      if (terminalStates.includes(run.state)) {
        return reply.status(409).send(createErrorResponse(
          ErrorCode.CONFLICT,
          `Run is already completed with status: ${run.state}`,
          { status: run.state },
          request.id
        ));
      }

      // Set up SSE response
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      const clientId = randomUUID();

      // Register client
      streamManager.addClient({
        id: clientId,
        runId,
        send: (data: string) => {
          reply.raw.write(data);
        },
        close: () => {
          reply.raw.end();
        },
        createdAt: new Date(),
      });

      // Handle client disconnect
      request.raw.on('close', () => {
        streamManager.removeClient(clientId);
      });

      // Don't return - keep connection open
      // Fastify will handle the response lifecycle
    }
  );

  /**
   * GET /api/v1/work-orders/:id/stream - SSE stream for work order events
   * Streams events from all runs associated with the work order
   */
  app.get<{ Params: { id: string } }>(
    '/api/v1/work-orders/:id/stream',
    async (request, reply) => {
      const { id: workOrderId } = request.params;

      // Implementation similar to run stream
      // but subscribes to events from all runs of the work order

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const clientId = randomUUID();

      // Register for work order events
      // This requires additional work order -> runs mapping
      // Simplified: just stream the latest run

      reply.raw.write(`:ok\n\n`); // SSE comment to establish connection

      request.raw.on('close', () => {
        streamManager.removeClient(clientId);
      });
    }
  );
}
```

#### 4.3.4 Integrate with Run Executor

Update run executor to emit events:

```typescript
// In packages/server/src/orchestrator/run-executor.ts

import { streamManager } from '../server/stream/stream-manager.js';
import type { StreamEvent } from '../server/types/stream.js';

// Emit iteration start
function emitIterationStart(runId: string, iteration: number, maxIterations: number): void {
  const event: StreamEvent = {
    type: 'iteration-start',
    runId,
    timestamp: new Date().toISOString(),
    data: { iteration, maxIterations },
  };
  streamManager.broadcast(runId, event);
}

// Emit verification complete
function emitVerificationComplete(
  runId: string,
  iteration: number,
  level: string,
  passed: boolean,
  message?: string
): void {
  const event: StreamEvent = {
    type: 'verification-complete',
    runId,
    timestamp: new Date().toISOString(),
    data: { iteration, level, passed, message },
  };
  streamManager.broadcast(runId, event);
}

// Emit iteration complete
function emitIterationComplete(
  runId: string,
  iteration: number,
  decision: LoopDecision,
  verificationPassed: boolean
): void {
  const event: StreamEvent = {
    type: 'iteration-complete',
    runId,
    timestamp: new Date().toISOString(),
    data: {
      iteration,
      decision: {
        shouldContinue: decision.shouldContinue,
        reason: decision.reason,
        action: decision.action,
      },
      verificationPassed,
    },
  };
  streamManager.broadcast(runId, event);
}

// Emit run complete
function emitRunComplete(
  runId: string,
  status: 'succeeded' | 'failed' | 'canceled',
  totalIterations: number,
  prUrl?: string,
  message?: string
): void {
  const event: StreamEvent = {
    type: 'run-complete',
    runId,
    timestamp: new Date().toISOString(),
    data: { status, totalIterations, prUrl, message },
  };
  streamManager.broadcast(runId, event);
}
```

#### 4.3.5 Add Run Config Endpoint

Add endpoint to get resolved harness config for a run:

```typescript
// In packages/server/src/server/routes/runs.ts

app.get<{ Params: RunIdParams }>(
  '/api/v1/runs/:id/config',
  async (request, reply) => {
    try {
      const { id } = runIdParamsSchema.parse(request.params);

      const run = await loadRun(id);
      if (!run) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Run not found: ${id}`,
          undefined,
          request.id
        ));
      }

      // Get harness config from run or work order
      const harnessConfig = run.harnessConfig ?? null;

      return reply.send(createSuccessResponse({
        runId: id,
        config: harnessConfig ? {
          source: harnessConfig.source,
          inheritanceChain: harnessConfig.inheritanceChain,
          configHash: harnessConfig.configHash,
          loopStrategy: harnessConfig.loopStrategy,
          verification: harnessConfig.verification,
          gitOps: harnessConfig.gitOps,
          limits: harnessConfig.limits,
        } : null,
      }, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get run config');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get run config',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 4.3.6 Add Strategy State Endpoint

Add endpoint to get loop strategy state:

```typescript
// In packages/server/src/server/routes/runs.ts

app.get<{ Params: RunIdParams }>(
  '/api/v1/runs/:id/strategy-state',
  async (request, reply) => {
    try {
      const { id } = runIdParamsSchema.parse(request.params);

      const run = await loadRun(id);
      if (!run) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Run not found: ${id}`,
          undefined,
          request.id
        ));
      }

      // Get strategy state (stored on run or in memory for active runs)
      const strategyState = run.strategyState ?? null;

      return reply.send(createSuccessResponse({
        runId: id,
        state: strategyState ? {
          iteration: strategyState.iteration,
          decisions: strategyState.decisions,
          progress: strategyState.progress,
          loopDetection: strategyState.loopDetection,
        } : null,
      }, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get strategy state');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get strategy state',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 4.3.7 Register Routes

Update `packages/server/src/server/index.ts`:

```typescript
import { registerStreamRoutes } from './routes/stream.js';

// In server setup
registerStreamRoutes(app);
```

### 4.4 Verification Steps

1. Test SSE connection establishment
2. Test receiving events during run
3. Test heartbeat keeps connection alive
4. Test client disconnect handling
5. Test 404 for non-existent run
6. Test 409 for completed run
7. Test multiple clients on same run
8. Test /config endpoint
9. Test /strategy-state endpoint

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/server/types/stream.ts` | Created |
| `packages/server/src/server/stream/stream-manager.ts` | Created |
| `packages/server/src/server/routes/stream.ts` | Created |
| `packages/server/src/server/routes/runs.ts` | Modified - add config/state endpoints |
| `packages/server/src/orchestrator/run-executor.ts` | Modified - emit events |
| `packages/server/src/server/index.ts` | Modified - register routes |
| `packages/server/test/server/stream.test.ts` | Created |

---

## API Reference

### Run Stream

```
GET /api/v1/runs/:id/stream
Accept: text/event-stream
```

**Events:**

```
event: connected
data: {"type":"connected","runId":"run-123","timestamp":"2025-01-15T10:00:00Z","data":{"clientId":"abc","runStatus":"connected","currentIteration":0}}

event: iteration-start
data: {"type":"iteration-start","runId":"run-123","timestamp":"2025-01-15T10:01:00Z","data":{"iteration":1,"maxIterations":5}}

event: verification-complete
data: {"type":"verification-complete","runId":"run-123","timestamp":"2025-01-15T10:05:00Z","data":{"iteration":1,"level":"L1","passed":true}}

event: iteration-complete
data: {"type":"iteration-complete","runId":"run-123","timestamp":"2025-01-15T10:06:00Z","data":{"iteration":1,"decision":{"shouldContinue":true,"reason":"Verification passed but not all criteria met","action":"continue"},"verificationPassed":true}}

event: run-complete
data: {"type":"run-complete","runId":"run-123","timestamp":"2025-01-15T10:30:00Z","data":{"status":"succeeded","totalIterations":3,"prUrl":"https://github.com/..."}}
```

### Get Run Config

```
GET /api/v1/runs/:id/config
```

**Response:**
```json
{
  "success": true,
  "data": {
    "runId": "run-123",
    "config": {
      "source": "ci-focused",
      "inheritanceChain": ["default", "ci-focused"],
      "configHash": "abc123",
      "loopStrategy": {
        "mode": "hybrid",
        "maxIterations": 8
      },
      "verification": {
        "waitForCI": true,
        "skipLevels": []
      },
      "gitOps": {
        "mode": "github-pr"
      },
      "limits": {
        "maxWallClockSeconds": 3600
      }
    }
  }
}
```

### Get Strategy State

```
GET /api/v1/runs/:id/strategy-state
```

**Response:**
```json
{
  "success": true,
  "data": {
    "runId": "run-123",
    "state": {
      "iteration": 2,
      "decisions": [
        {
          "shouldContinue": true,
          "reason": "Verification passed but CI pending",
          "action": "continue"
        }
      ],
      "progress": {
        "highestVerificationLevel": "L1",
        "progressPercent": 40
      },
      "loopDetection": {
        "contentHashes": ["abc", "def"],
        "loopCount": 0
      }
    }
  }
}
```

---

## Client Usage

### JavaScript/Browser

```javascript
const eventSource = new EventSource('/api/v1/runs/run-123/stream');

eventSource.onopen = () => {
  console.log('Connected to run stream');
};

eventSource.addEventListener('iteration-start', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Iteration ${data.data.iteration} started`);
});

eventSource.addEventListener('run-complete', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Run completed: ${data.data.status}`);
  eventSource.close();
});

eventSource.onerror = (e) => {
  if (eventSource.readyState === EventSource.CLOSED) {
    console.log('Connection closed');
  }
};
```

### Node.js

```typescript
import EventSource from 'eventsource';

const es = new EventSource('http://localhost:3000/api/v1/runs/run-123/stream');

es.addEventListener('run-complete', (e) => {
  const data = JSON.parse(e.data);
  console.log('Run completed:', data.data.status);
  es.close();
});
```

### cURL

```bash
curl -N http://localhost:3000/api/v1/runs/run-123/stream
```
