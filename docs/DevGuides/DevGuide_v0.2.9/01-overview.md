# DevGuide v0.2.9: Test Architecture Overview

## Test Philosophy

### The Testing Pyramid

```
        /\
       /  \  E2E Tests (Few, Slow, High Confidence)
      /----\
     /      \  Integration Tests (Medium)
    /--------\
   /          \  Unit Tests (Many, Fast, Focused)
  /------------\
```

This guide follows the testing pyramid principle:

1. **Unit Tests** (Base) - Fast, isolated, many
   - Test individual functions, classes, schemas
   - Mock external dependencies
   - Run in milliseconds

2. **Integration Tests** (Middle) - Cross-boundary
   - Test API contracts
   - Test WebSocket communication
   - Test cross-package interactions

3. **E2E Tests** (Top) - Full workflow
   - Test complete user scenarios
   - Run against real services
   - Verify entire pipeline

### Test Categories by Package

```
packages/
├── shared/
│   └── test/
│       ├── schemas.test.ts      # Zod schema validation
│       └── types.test.ts        # Type utilities
│
├── dashboard/
│   └── src/
│       ├── components/
│       │   └── __tests__/       # Component tests
│       ├── hooks/
│       │   └── __tests__/       # Hook tests
│       └── api/
│           └── __tests__/       # API client tests
│
├── server/
│   └── test/
│       ├── contract/            # API contract tests
│       ├── integration/         # Integration tests
│       └── e2e/                 # E2E workflow tests
│
└── test/                        # Root integration tests
    └── cross-package/           # Cross-package tests
```

## Industry Best Practices Applied

### 1. Arrange-Act-Assert (AAA) Pattern

All tests follow the AAA pattern:

```typescript
it('should validate work order creation request', () => {
  // Arrange
  const input = { taskPrompt: 'Test task...', workspaceSource: { type: 'local', path: '/tmp' } };

  // Act
  const result = createWorkOrderBodySchema.safeParse(input);

  // Assert
  expect(result.success).toBe(true);
});
```

### 2. Test Isolation

- Each test is independent
- No shared mutable state
- Cleanup in `afterEach`/`afterAll`

### 3. Descriptive Test Names

```typescript
// Good
it('should return 404 when work order not found');
it('should emit workorder:updated event when status changes');

// Avoid
it('test 1');
it('works');
```

### 4. Test Coverage Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| Line Coverage | 80% | Balance between coverage and maintenance |
| Branch Coverage | 75% | Focus on decision points |
| Function Coverage | 90% | All public APIs tested |

### 5. Testing Types

| Type | Tool | Purpose |
|------|------|---------|
| Unit | Vitest | Fast, isolated function tests |
| Component | React Testing Library | UI behavior tests |
| Integration | Vitest + Fastify inject | API tests |
| E2E | Vitest | Full workflow tests |
| Contract | Zod schemas | API compatibility |

## Technology Stack

### Test Framework: Vitest

Chosen for:
- Native ESM support
- Fast execution
- Vite compatibility
- Jest-compatible API

### React Testing: React Testing Library

Chosen for:
- User-centric testing
- Accessibility focus
- Avoids implementation details

### Mocking: vi.mock / MSW

- `vi.mock` for module mocking
- MSW (Mock Service Worker) for API mocking in dashboard

### Assertion: expect (Vitest)

- Fluent API
- Rich matchers
- Custom matcher support

## Test File Conventions

### Naming

```
[module-name].test.ts        # Unit tests
[module-name].spec.ts        # Specification tests (BDD style)
[feature].integration.test.ts # Integration tests
[workflow].e2e.test.ts       # E2E tests
```

### Location

- Unit tests: Next to source (`__tests__/` or `.test.ts` sibling)
- Integration tests: `test/integration/`
- E2E tests: `test/e2e/`

### Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ModuleName', () => {
  // Setup
  beforeEach(() => { /* setup */ });
  afterEach(() => { /* cleanup */ });

  describe('methodName', () => {
    it('should handle normal case', () => { /* test */ });
    it('should handle edge case', () => { /* test */ });
    it('should throw on invalid input', () => { /* test */ });
  });
});
```

## Current Test Landscape

### Server Tests (23 files)

| Category | Files | Coverage |
|----------|-------|----------|
| Workspace | workspace.test.ts, workspace-github.test.ts | Good |
| Git Operations | git-ops.test.ts, snapshot.test.ts | Good |
| State Machine | state-machine.test.ts | Good |
| Metrics | metrics-*.test.ts (4 files) | Good |
| Routes | routes-*.test.ts (2 files) | Good |
| Server | server-app.test.ts, middleware-auth.test.ts | Good |
| E2E | e2e-fresh-workspace.test.ts, github-e2e.test.ts | Partial |

### Shared Tests (0 files)

**Gap**: No tests for Zod schemas or type utilities

### Dashboard Tests (0 files)

**Gap**: No tests configured (`"test": "echo 'No tests configured yet'"`)

## What This Guide Adds

| Addition | Impact |
|----------|--------|
| Shared schema tests | Validate API contracts at compile time |
| Dashboard component tests | Catch UI regressions |
| Dashboard hook tests | Ensure data fetching works correctly |
| API contract tests | Guarantee server/client compatibility |
| WebSocket integration | Verify real-time updates work |
| Full E2E workflow | Confidence in complete user journeys |

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Test maintenance burden | Focus on public APIs, avoid over-testing internals |
| Flaky E2E tests | Proper waits, deterministic test data |
| Long CI times | Parallel execution, test sharding |
| Coverage theater | Focus on critical paths, not 100% coverage |

## Next Steps

Continue to the implementation documents:

1. [02-shared-tests.md](./02-shared-tests.md) - Shared package tests
2. [03-dashboard-tests.md](./03-dashboard-tests.md) - Dashboard tests
3. [04-integration-tests.md](./04-integration-tests.md) - Integration tests
4. [05-e2e-tests.md](./05-e2e-tests.md) - E2E tests
5. [06-appendices.md](./06-appendices.md) - Checklists and CI updates
