# DevGuide v0.2.9: Appendices

## Appendix A: Complete Implementation Checklist

### Pre-Implementation

- [ ] DevGuide v0.2.8 completed (monorepo structure)
- [ ] All packages build successfully (`pnpm build`)
- [ ] CI pipeline passing
- [ ] Git working directory clean

### Thrust 1: Shared Zod Schema Tests

- [ ] Install vitest in @agentgate/shared
- [ ] Create vitest.config.ts
- [ ] Update package.json scripts
- [ ] Create test/api-schemas.test.ts
  - [ ] paginationQuerySchema tests
  - [ ] listWorkOrdersQuerySchema tests
  - [ ] createWorkOrderBodySchema tests
- [ ] All tests pass

### Thrust 2: Shared Type Utilities Tests

- [ ] Create test/work-order-types.test.ts
- [ ] Create test/verification-types.test.ts (if applicable)
- [ ] Coverage >90% on schema files

### Thrust 3: Dashboard Vitest Setup

- [ ] Install test dependencies (vitest, @testing-library/react, etc.)
- [ ] Create vitest.config.ts with React plugin
- [ ] Create src/test/setup.ts
- [ ] Create src/test/utils.tsx
- [ ] Update package.json scripts
- [ ] Basic test infrastructure working

### Thrust 4: Dashboard Component Tests

- [ ] Create src/api/__tests__/client.test.ts
- [ ] Create src/api/__tests__/websocket.test.ts
- [ ] Create src/hooks/__tests__/useWorkOrders.test.tsx
- [ ] Create at least one component test
- [ ] All tests pass

### Thrust 5: API Contract Tests

- [ ] Create test/contract/helpers.ts
- [ ] Create test/contract/work-orders.contract.test.ts
- [ ] Validate response structure matches shared types
- [ ] Error response contract tests passing

### Thrust 6: WebSocket Integration Tests

- [ ] Create test/websocket/helpers.ts
- [ ] Create test/websocket/lifecycle.test.ts
- [ ] Create test/websocket/subscription.test.ts
- [ ] All WebSocket tests passing
- [ ] Proper cleanup of connections

### Thrust 7: E2E Workflow Tests

- [ ] Create test/e2e/config.ts
- [ ] Create test/e2e/helpers.ts
- [ ] Create test/e2e/work-order-lifecycle.test.ts
- [ ] Create test/e2e/github-workspace.test.ts
- [ ] Create test/e2e/multi-iteration.test.ts
- [ ] All E2E tests passing

### Thrust 8: CI/CD Integration

- [ ] Update verify.yaml with new test commands
- [ ] Update .github/workflows/ci.yml
- [ ] Update root package.json scripts
- [ ] Full test suite passes (`pnpm test`)
- [ ] CI pipeline green

### Post-Implementation

- [ ] All existing tests still pass
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Coverage reports generate
- [ ] Documentation updated

---

## Appendix B: AgentGate Work Order Prompts

### Work Order 1: Shared Package Tests (Thrusts 1-2)

```
Implement comprehensive unit tests for the @agentgate/shared package.

CONTEXT:
This is part of DevGuide v0.2.9 - adding integration and E2E tests.
The shared package contains Zod schemas used by both server and dashboard.

TASKS:
1. Add vitest as a dev dependency to packages/shared/package.json
2. Create packages/shared/vitest.config.ts
3. Update packages/shared/package.json scripts (test, test:watch, test:coverage)
4. Create packages/shared/test/api-schemas.test.ts testing:
   - paginationQuerySchema (defaults, edge cases, coercion)
   - listWorkOrdersQuerySchema (status filter, invalid values)
   - createWorkOrderBodySchema (valid payloads, validation errors, workspace types)
5. Create packages/shared/test/work-order-types.test.ts
6. Ensure all tests pass with pnpm test
7. Achieve >90% coverage on schema files

VERIFICATION:
- pnpm --filter @agentgate/shared test passes
- pnpm --filter @agentgate/shared test:coverage shows >90%

FILES TO READ FIRST:
- packages/shared/src/types/api.ts
- packages/shared/src/types/work-order.ts
- packages/shared/package.json
```

### Work Order 2: Dashboard Test Setup (Thrusts 3-4)

```
Set up Vitest testing infrastructure for @agentgate/dashboard and write initial tests.

CONTEXT:
This is part of DevGuide v0.2.9. The dashboard currently has no tests.
We need to set up React Testing Library with Vitest.

TASKS:
1. Install: vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
2. Create packages/dashboard/vitest.config.ts (React plugin, jsdom, setup file)
3. Create packages/dashboard/src/test/setup.ts (jest-dom, cleanup, window mocks)
4. Create packages/dashboard/src/test/utils.tsx (custom render with providers)
5. Update packages/dashboard/package.json scripts
6. Write src/api/__tests__/client.test.ts (apiRequest, get, post, del, errors)
7. Write src/api/__tests__/websocket.test.ts (connect, subscribe, events)
8. Write src/hooks/__tests__/useWorkOrders.test.tsx
9. Ensure all tests pass

VERIFICATION:
- pnpm --filter @agentgate/dashboard test passes

FILES TO READ FIRST:
- packages/dashboard/src/api/client.ts
- packages/dashboard/src/api/websocket.ts
- packages/dashboard/src/hooks/useWorkOrders.ts
- packages/dashboard/package.json
```

### Work Order 3: API Contract & WebSocket Tests (Thrusts 5-6)

```
Implement API contract tests and WebSocket integration tests for @agentgate/server.

CONTEXT:
This is part of DevGuide v0.2.9. These tests verify server/client compatibility.

TASKS:
1. Create packages/server/test/contract/helpers.ts
2. Create packages/server/test/contract/work-orders.contract.test.ts:
   - Validate GET /api/v1/work-orders response structure
   - Validate GET /api/v1/work-orders/:id response
   - Validate POST request/response
   - Error response format tests
3. Create packages/server/test/websocket/helpers.ts (createTestWebSocket, etc.)
4. Create packages/server/test/websocket/lifecycle.test.ts
5. Create packages/server/test/websocket/subscription.test.ts
6. Ensure all tests pass

VERIFICATION:
- pnpm --filter @agentgate/server test passes
- Contract tests use @agentgate/shared schemas for validation

FILES TO READ FIRST:
- packages/server/src/server/routes/work-orders.ts
- packages/server/src/server/websocket/handler.ts
- packages/server/src/server/websocket/broadcaster.ts
- packages/shared/src/types/api.ts
```

### Work Order 4: E2E Tests & CI (Thrusts 7-8)

```
Implement E2E workflow tests and update CI configuration.

CONTEXT:
This is part of DevGuide v0.2.9. E2E tests verify the complete pipeline.

TASKS:
1. Create packages/server/test/e2e/config.ts
2. Create packages/server/test/e2e/helpers.ts
3. Create packages/server/test/e2e/work-order-lifecycle.test.ts
4. Create packages/server/test/e2e/github-workspace.test.ts (skip without token)
5. Create packages/server/test/e2e/multi-iteration.test.ts
6. Update verify.yaml with shared-tests and dashboard-tests
7. Update .github/workflows/ci.yml to run all new tests
8. Update root package.json scripts
9. Run full test suite to verify

VERIFICATION:
- pnpm test runs all package tests
- E2E tests pass (or skip appropriately)
- CI workflow is valid YAML

FILES TO READ FIRST:
- packages/server/test/e2e-fresh-workspace.test.ts (existing pattern)
- verify.yaml
- .github/workflows/ci.yml
- package.json
```

---

## Appendix C: Test File Structure

After implementation, the test structure should look like:

```
packages/
├── shared/
│   ├── package.json              # Updated with test scripts
│   ├── vitest.config.ts          # NEW
│   └── test/
│       ├── api-schemas.test.ts   # NEW
│       └── work-order-types.test.ts # NEW
│
├── dashboard/
│   ├── package.json              # Updated with test scripts
│   ├── vitest.config.ts          # NEW
│   └── src/
│       ├── test/
│       │   ├── setup.ts          # NEW
│       │   └── utils.tsx         # NEW
│       ├── api/
│       │   └── __tests__/
│       │       ├── client.test.ts    # NEW
│       │       └── websocket.test.ts # NEW
│       └── hooks/
│           └── __tests__/
│               └── useWorkOrders.test.tsx # NEW
│
└── server/
    └── test/
        ├── contract/             # NEW directory
        │   ├── helpers.ts
        │   └── work-orders.contract.test.ts
        ├── websocket/            # NEW directory
        │   ├── helpers.ts
        │   ├── lifecycle.test.ts
        │   └── subscription.test.ts
        └── e2e/
            ├── config.ts         # NEW
            ├── helpers.ts        # NEW
            ├── work-order-lifecycle.test.ts # NEW
            ├── github-workspace.test.ts     # NEW
            └── multi-iteration.test.ts      # NEW
```

---

## Appendix D: CI Updates

### Updated verify.yaml Section

```yaml
tests:
  # Existing
  - name: shared-typecheck
    command: pnpm --filter @agentgate/shared typecheck
    description: Shared types compilation

  - name: server-typecheck
    command: pnpm --filter @agentgate/server typecheck
    description: Server TypeScript compilation

  - name: dashboard-typecheck
    command: pnpm --filter @agentgate/dashboard typecheck
    description: Dashboard TypeScript compilation

  - name: server-lint
    command: pnpm --filter @agentgate/server lint
    description: Server ESLint checks

  - name: dashboard-lint
    command: pnpm --filter @agentgate/dashboard lint
    description: Dashboard ESLint checks

  - name: server-tests
    command: pnpm --filter @agentgate/server test
    description: Server unit and integration tests
    timeout: 300

  # NEW: Shared package tests
  - name: shared-tests
    command: pnpm --filter @agentgate/shared test
    description: Shared package schema tests

  # NEW: Dashboard tests
  - name: dashboard-tests
    command: pnpm --filter @agentgate/dashboard test
    description: Dashboard component and hook tests

  - name: build-all
    command: pnpm build
    description: Build all packages
```

---

## Appendix E: Troubleshooting

### Common Issues

#### 1. Dashboard tests fail with "window is not defined"

**Solution**: Ensure `jsdom` environment is set in vitest.config.ts:
```typescript
test: {
  environment: 'jsdom',
}
```

#### 2. WebSocket tests timeout

**Solution**: Increase timeout and ensure proper cleanup:
```typescript
afterEach(() => {
  for (const ws of connections) {
    if (ws.readyState === ws.OPEN) {
      ws.close();
    }
  }
});
```

#### 3. React Testing Library cleanup warnings

**Solution**: Call cleanup in setup file:
```typescript
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

#### 4. E2E tests fail due to missing git config

**Solution**: Configure git before tests:
```typescript
await execa('git', ['config', 'user.email', 'test@test.com'], { cwd });
await execa('git', ['config', 'user.name', 'Test'], { cwd });
```

#### 5. Import errors with @agentgate/shared

**Solution**: Ensure the package is built first:
```bash
pnpm --filter @agentgate/shared build
```

---

## Appendix F: Coverage Targets

| Package | Lines | Branches | Functions | Statements |
|---------|-------|----------|-----------|------------|
| @agentgate/shared | 90% | 85% | 95% | 90% |
| @agentgate/dashboard | 70% | 60% | 80% | 70% |
| @agentgate/server | 80% | 75% | 85% | 80% |

These targets balance thorough testing with practical maintenance burden.

---

## Appendix G: References

### Testing Libraries

- [Vitest](https://vitest.dev/) - Test framework
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) - React component testing
- [MSW](https://mswjs.io/) - API mocking (optional)
- [Zod](https://zod.dev/) - Schema validation

### Best Practices

- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles)
- [Kent C. Dodds - Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Martin Fowler - Testing Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)

### Industry Standards

- [Google Testing Blog](https://testing.googleblog.com/)
- [Thoughtworks Technology Radar](https://www.thoughtworks.com/radar)
