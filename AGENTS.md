# AgentGate Engineering Standards

You are an autonomous software engineering agent. Follow these standards for ALL work.

---

## Core Principles

### 1. Understand Before Implementing
- READ existing code before modifying
- Understand the patterns already in use
- Check for existing utilities/helpers you can reuse
- Look at similar implementations in the codebase

### 2. Plan Before Coding
- Break the task into discrete steps
- Identify files that need changes
- Consider dependencies between changes
- Think about edge cases BEFORE writing code

### 3. Test As You Build
- **No code without tests** - Every new function needs unit tests
- **Test edge cases** - Empty inputs, nulls, errors, boundaries
- **Integration tests** - If you add an API endpoint, test it end-to-end
- Write tests BEFORE or ALONGSIDE implementation, not after

---

## Implementation Standards

### Code Organization
- One responsibility per function
- Keep functions under 50 lines
- Use descriptive names that explain WHAT, not HOW
- Group related functionality in modules

### Error Handling
- Never swallow errors silently
- Use typed errors with error codes
- Log errors with context (what operation, what inputs)
- Provide actionable error messages

### TypeScript Patterns
```typescript
// GOOD: Explicit types, error handling
async function fetchWorkOrder(id: string): Promise<WorkOrder | null> {
  try {
    const order = await store.get(id);
    if (!order) {
      logger.debug({ id }, 'Work order not found');
      return null;
    }
    return order;
  } catch (error) {
    logger.error({ id, err: error }, 'Failed to fetch work order');
    throw new WorkOrderError('FETCH_FAILED', `Failed to fetch ${id}`, error);
  }
}

// BAD: Implicit any, no error handling
async function fetchWorkOrder(id) {
  return await store.get(id);
}
```

---

## Testing Requirements

### Unit Tests (MANDATORY for all new code)

Every new function/class MUST have corresponding tests in `test/`:

```typescript
// src/server/websocket/broadcaster.ts
export class EventBroadcaster {
  broadcast(event: Event): void { ... }
}

// test/websocket-broadcaster.test.ts (REQUIRED)
describe('EventBroadcaster', () => {
  describe('broadcast', () => {
    it('should send event to subscribed connections', () => { ... });
    it('should not send to unsubscribed connections', () => { ... });
    it('should handle empty connection list', () => { ... });
    it('should handle connection errors gracefully', () => { ... });
  });
});
```

### Test Coverage Requirements
| Type | Requirement |
|------|-------------|
| New functions | 100% - Every new function needs tests |
| New classes | All public methods tested |
| Edge cases | Empty inputs, nulls, errors, boundaries |
| Error paths | Verify errors are thrown/handled correctly |

### Integration Tests (MANDATORY for features)

If you add/modify:
- API endpoints → Add HTTP integration tests
- WebSocket handlers → Add WebSocket connection tests
- CLI commands → Add CLI invocation tests
- Database operations → Add persistence tests

```typescript
// test/integration/work-orders-api.test.ts
describe('Work Orders API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApp({ apiKey: 'test-key' });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/work-orders', () => {
    it('should create work order with valid input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: { Authorization: 'Bearer test-key' },
        payload: { taskPrompt: 'Test task', workspaceSource: { type: 'local', path: '/tmp' } }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.id).toBeDefined();
    });

    it('should reject without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        payload: { taskPrompt: 'Test' }
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
```

---

## Validation Checklist

Before completing ANY task, verify:

### Compilation & Lint
- [ ] `pnpm typecheck` passes with NO errors
- [ ] `pnpm lint` passes with NO warnings
- [ ] `pnpm build` succeeds

### Testing
- [ ] All existing tests still pass: `pnpm test`
- [ ] NEW tests written for new code
- [ ] Tests cover happy path AND error cases
- [ ] Edge cases tested (empty, null, invalid inputs)

### Code Quality
- [ ] No `any` types (use proper typing)
- [ ] No `// @ts-ignore` comments
- [ ] No console.log (use logger)
- [ ] Error handling in place
- [ ] Meaningful variable/function names

### Documentation
- [ ] Public functions have JSDoc comments
- [ ] Complex logic has inline comments explaining WHY
- [ ] README updated if adding new features/commands

---

## Common Patterns

### Testing Async Code
```typescript
it('should handle async errors', async () => {
  const service = new MyService();

  await expect(service.doSomething('invalid'))
    .rejects.toThrow('Expected error message');
});
```

### Mocking Dependencies
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock at module level
vi.mock('../src/external-service', () => ({
  externalService: {
    fetch: vi.fn(),
  }
}));

import { externalService } from '../src/external-service';

describe('MyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call external service', async () => {
    vi.mocked(externalService.fetch).mockResolvedValue({ data: 'test' });

    const result = await myService.process();

    expect(externalService.fetch).toHaveBeenCalledTimes(1);
    expect(result.data).toBe('test');
  });
});
```

### Testing WebSocket/Server Code
```typescript
import Fastify from 'fastify';
import WebSocket from 'ws';

describe('WebSocket Handler', () => {
  let app: FastifyInstance;
  let ws: WebSocket;

  beforeEach(async () => {
    app = await createApp();
    await app.listen({ port: 0 }); // Random port
  });

  afterEach(async () => {
    ws?.close();
    await app.close();
  });

  it('should respond to ping with pong', async () => {
    const port = (app.server.address() as any).port;
    ws = new WebSocket(`ws://localhost:${port}/ws`);

    await new Promise(resolve => ws.on('open', resolve));

    const response = await new Promise(resolve => {
      ws.on('message', data => resolve(JSON.parse(data.toString())));
      ws.send(JSON.stringify({ type: 'ping' }));
    });

    expect(response).toEqual({ type: 'pong', timestamp: expect.any(String) });
  });
});
```

---

## File Organization

When adding new features, follow this structure:

```
src/
└── feature/
    ├── index.ts          # Public exports
    ├── types.ts          # TypeScript types/interfaces
    ├── feature.ts        # Main implementation
    └── utils.ts          # Helper functions

test/
└── feature.test.ts       # Unit tests (REQUIRED)
└── feature-integration.test.ts  # Integration tests (if applicable)
```

---

## Before Submitting

Run this complete validation:

```bash
# 1. Type checking
pnpm typecheck

# 2. Linting
pnpm lint

# 3. ALL tests pass
pnpm test

# 4. Build succeeds
pnpm build

# 5. Verify your new tests exist
ls test/*your-feature*.test.ts
```

If ANY of these fail, fix them before completing the task.

---

## Red Flags (Never Do These)

- ❌ Adding code without tests
- ❌ Using `any` type
- ❌ Swallowing errors with empty catch blocks
- ❌ Using `console.log` instead of logger
- ❌ Hardcoding values that should be configurable
- ❌ Leaving TODO comments without tracking issues
- ❌ Skipping error handling "for now"
- ❌ Not testing error paths
- ❌ Assuming inputs are always valid

---

## Summary

1. **Read** existing code first
2. **Plan** your changes
3. **Write tests** alongside code
4. **Validate** everything works
5. **Document** what you built

Quality is not optional. Tests are not optional. Every change must be verifiable.
