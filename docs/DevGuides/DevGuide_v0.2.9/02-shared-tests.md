# DevGuide v0.2.9: Shared Package Tests

## Thrust 1: Zod Schema Unit Tests

### Overview

The `@agentgate/shared` package contains Zod schemas that define the API contract between server and dashboard. These schemas MUST have comprehensive tests to ensure validation works correctly.

### Implementation Tasks

#### Task 1.1: Create Test Infrastructure

**File**: `packages/shared/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
```

**File**: `packages/shared/package.json` (update scripts)

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

#### Task 1.2: API Schema Tests

**File**: `packages/shared/test/api-schemas.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  paginationQuerySchema,
  listWorkOrdersQuerySchema,
  createWorkOrderBodySchema,
} from '../src/types/api.js';

describe('API Schemas', () => {
  describe('paginationQuerySchema', () => {
    it('should accept valid pagination params', () => {
      const result = paginationQuerySchema.safeParse({ limit: 10, offset: 0 });
      expect(result.success).toBe(true);
    });

    it('should use defaults for missing params', () => {
      const result = paginationQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
      }
    });

    it('should reject negative limit', () => {
      const result = paginationQuerySchema.safeParse({ limit: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const result = paginationQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = paginationQuerySchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
    });

    it('should coerce string numbers', () => {
      const result = paginationQuerySchema.safeParse({ limit: '10', offset: '5' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(5);
      }
    });
  });

  describe('listWorkOrdersQuerySchema', () => {
    it('should accept valid status filter', () => {
      const result = listWorkOrdersQuerySchema.safeParse({ status: 'queued' });
      expect(result.success).toBe(true);
    });

    it('should accept all valid status values', () => {
      const statuses = ['queued', 'running', 'succeeded', 'failed', 'canceled'];
      for (const status of statuses) {
        const result = listWorkOrdersQuerySchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = listWorkOrdersQuerySchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should combine pagination and status', () => {
      const result = listWorkOrdersQuerySchema.safeParse({
        status: 'running',
        limit: 5,
        offset: 10,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createWorkOrderBodySchema', () => {
    const validPayload = {
      taskPrompt: 'This is a valid task prompt with enough characters to pass validation',
      workspaceSource: { type: 'local', path: '/tmp/workspace' },
    };

    it('should accept valid local workspace source', () => {
      const result = createWorkOrderBodySchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should accept valid github workspace source', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validPayload.taskPrompt,
        workspaceSource: { type: 'github', repo: 'owner/repo', branch: 'main' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject taskPrompt shorter than 10 characters', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validPayload,
        taskPrompt: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional maxIterations', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validPayload,
        maxIterations: 5,
      });
      expect(result.success).toBe(true);
    });

    it('should reject maxIterations below 1', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validPayload,
        maxIterations: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject maxIterations above 10', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validPayload,
        maxIterations: 11,
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional maxTime', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validPayload,
        maxTime: 1800,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing taskPrompt', () => {
      const result = createWorkOrderBodySchema.safeParse({
        workspaceSource: validPayload.workspaceSource,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing workspaceSource', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validPayload.taskPrompt,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid workspace source type', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validPayload.taskPrompt,
        workspaceSource: { type: 'invalid', path: '/tmp' },
      });
      expect(result.success).toBe(false);
    });
  });
});
```

#### Task 1.3: WebSocket Schema Tests

**File**: `packages/shared/test/websocket-schemas.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  clientMessageSchema,
  serverEventSchema,
} from '../src/types/websocket.js';

describe('WebSocket Schemas', () => {
  describe('clientMessageSchema', () => {
    it('should accept subscribe message', () => {
      const result = clientMessageSchema.safeParse({
        type: 'subscribe',
        workOrderId: 'wo-123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept unsubscribe message', () => {
      const result = clientMessageSchema.safeParse({
        type: 'unsubscribe',
        workOrderId: 'wo-123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept ping message', () => {
      const result = clientMessageSchema.safeParse({ type: 'ping' });
      expect(result.success).toBe(true);
    });

    it('should reject unknown message type', () => {
      const result = clientMessageSchema.safeParse({ type: 'unknown' });
      expect(result.success).toBe(false);
    });

    it('should reject subscribe without workOrderId', () => {
      const result = clientMessageSchema.safeParse({ type: 'subscribe' });
      expect(result.success).toBe(false);
    });
  });

  describe('serverEventSchema', () => {
    it('should accept workorder:created event', () => {
      const result = serverEventSchema.safeParse({
        type: 'workorder:created',
        workOrderId: 'wo-123',
        data: { id: 'wo-123', status: 'queued' },
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('should accept workorder:updated event', () => {
      const result = serverEventSchema.safeParse({
        type: 'workorder:updated',
        workOrderId: 'wo-123',
        data: { id: 'wo-123', status: 'running' },
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('should accept run:updated event', () => {
      const result = serverEventSchema.safeParse({
        type: 'run:updated',
        workOrderId: 'wo-123',
        data: { iteration: 1, phase: 'build' },
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('should accept pong message', () => {
      const result = serverEventSchema.safeParse({
        type: 'pong',
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('should accept error message', () => {
      const result = serverEventSchema.safeParse({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Invalid message format',
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });
  });
});
```

### Verification

```bash
cd packages/shared
pnpm test
pnpm test:coverage
```

Expected output:
- All tests pass
- Coverage > 90% for schema files

---

## Thrust 2: Shared Type Utilities Tests

### Overview

Test helper functions, type guards, and utility functions in the shared package.

### Implementation Tasks

#### Task 2.1: Work Order Type Tests

**File**: `packages/shared/test/work-order-types.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { WorkOrderStatus } from '../src/types/work-order.js';

describe('WorkOrder Types', () => {
  describe('WorkOrderStatus', () => {
    it('should have all expected status values', () => {
      expect(WorkOrderStatus.QUEUED).toBe('queued');
      expect(WorkOrderStatus.RUNNING).toBe('running');
      expect(WorkOrderStatus.SUCCEEDED).toBe('succeeded');
      expect(WorkOrderStatus.FAILED).toBe('failed');
      expect(WorkOrderStatus.CANCELED).toBe('canceled');
    });

    it('should cover all 5 statuses', () => {
      const statuses = Object.values(WorkOrderStatus);
      expect(statuses).toHaveLength(5);
    });
  });

  describe('isTerminalStatus', () => {
    it('should identify terminal statuses', () => {
      const terminalStatuses = [
        WorkOrderStatus.SUCCEEDED,
        WorkOrderStatus.FAILED,
        WorkOrderStatus.CANCELED,
      ];

      for (const status of terminalStatuses) {
        expect([WorkOrderStatus.SUCCEEDED, WorkOrderStatus.FAILED, WorkOrderStatus.CANCELED])
          .toContain(status);
      }
    });

    it('should identify non-terminal statuses', () => {
      const nonTerminalStatuses = [
        WorkOrderStatus.QUEUED,
        WorkOrderStatus.RUNNING,
      ];

      for (const status of nonTerminalStatuses) {
        expect([WorkOrderStatus.SUCCEEDED, WorkOrderStatus.FAILED, WorkOrderStatus.CANCELED])
          .not.toContain(status);
      }
    });
  });
});
```

#### Task 2.2: Verification Type Tests

**File**: `packages/shared/test/verification-types.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { VerificationLevel } from '../src/types/verification.js';

describe('Verification Types', () => {
  describe('VerificationLevel', () => {
    it('should have L0 through L3 levels', () => {
      expect(VerificationLevel.L0).toBe('L0');
      expect(VerificationLevel.L1).toBe('L1');
      expect(VerificationLevel.L2).toBe('L2');
      expect(VerificationLevel.L3).toBe('L3');
    });

    it('should have exactly 4 levels', () => {
      const levels = Object.values(VerificationLevel);
      expect(levels).toHaveLength(4);
    });
  });

  describe('Level descriptions', () => {
    it('L0 is Contract Validation', () => {
      // L0: Automatic contract checks (forbidden files, patterns)
      expect(VerificationLevel.L0).toBeDefined();
    });

    it('L1 is Test Commands', () => {
      // L1: typecheck, lint, test commands
      expect(VerificationLevel.L1).toBeDefined();
    });

    it('L2 is Blackbox Tests', () => {
      // L2: CLI tests, health endpoints
      expect(VerificationLevel.L2).toBeDefined();
    });

    it('L3 is Sanity Checks', () => {
      // L3: Required files, test coverage rules
      expect(VerificationLevel.L3).toBeDefined();
    });
  });
});
```

#### Task 2.3: Run the Tests

```bash
cd packages/shared
pnpm install vitest --save-dev
pnpm test
```

### Work Order for Thrust 1-2

**Prompt for AgentGate**:
```
Implement comprehensive unit tests for the @agentgate/shared package.

TASKS:
1. Add vitest as a dev dependency to packages/shared/package.json
2. Create packages/shared/vitest.config.ts with proper configuration
3. Update packages/shared/package.json scripts to include test, test:watch, test:coverage
4. Create packages/shared/test/api-schemas.test.ts with tests for:
   - paginationQuerySchema (valid params, defaults, edge cases)
   - listWorkOrdersQuerySchema (status filter, pagination combo)
   - createWorkOrderBodySchema (valid payloads, validation errors)
5. Create packages/shared/test/websocket-schemas.test.ts if websocket types exist
6. Create packages/shared/test/work-order-types.test.ts for WorkOrderStatus
7. Ensure all tests pass with pnpm test
8. Achieve >90% coverage on schema files

VERIFICATION:
- pnpm --filter @agentgate/shared test passes
- pnpm --filter @agentgate/shared test:coverage shows >90%

CONSTRAINTS:
- Use vitest, not jest
- Follow existing code style
- Tests should be deterministic (no flaky tests)
```

### Completion Checklist

- [ ] Vitest configured for shared package
- [ ] package.json scripts updated
- [ ] API schema tests written and passing
- [ ] WebSocket schema tests written (if applicable)
- [ ] Type utility tests written
- [ ] Coverage >90% on schema files
- [ ] All existing monorepo tests still pass
