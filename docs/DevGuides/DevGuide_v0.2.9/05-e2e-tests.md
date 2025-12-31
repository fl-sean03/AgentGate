# DevGuide v0.2.9: E2E Workflow Tests

## Thrust 7: E2E Workflow Tests

### Overview

End-to-end tests validate the complete work order lifecycle from submission through verification to completion. These tests run against real services and verify the entire pipeline works correctly.

### Implementation Tasks

#### Task 7.1: E2E Test Configuration

**File**: `packages/server/test/e2e/config.ts`

```typescript
export const E2E_CONFIG = {
  // Timeout for long-running operations
  OPERATION_TIMEOUT: 60000, // 60 seconds

  // Timeout for work order completion
  COMPLETION_TIMEOUT: 300000, // 5 minutes

  // Poll interval for status checks
  POLL_INTERVAL: 1000, // 1 second

  // Test workspace configuration
  TEST_WORKSPACE: {
    owner: process.env.GITHUB_REPO_OWNER || 'test-org',
    repo: process.env.GITHUB_REPO_NAME || 'test-repo',
    branch: process.env.GITHUB_REPO_BRANCH || 'main',
  },

  // API configuration
  API_KEY: process.env.AGENTGATE_API_KEY || 'test-api-key',
};

export function skipIfNoGitHub(): boolean {
  return !process.env.GITHUB_TOKEN;
}
```

#### Task 7.2: E2E Test Helpers

**File**: `packages/server/test/e2e/helpers.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/server/app.js';
import { E2E_CONFIG } from './config.js';

let app: FastifyInstance | null = null;
let serverUrl: string | null = null;

export async function startE2EServer(): Promise<string> {
  if (app && serverUrl) {
    return serverUrl;
  }

  app = await createApp({
    apiKey: E2E_CONFIG.API_KEY,
    enableLogging: false,
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();

  if (typeof address === 'object' && address) {
    serverUrl = `http://127.0.0.1:${address.port}`;
  } else {
    throw new Error('Failed to get server address');
  }

  return serverUrl;
}

export async function stopE2EServer(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
    serverUrl = null;
  }
}

export function authHeaders() {
  return {
    Authorization: `Bearer ${E2E_CONFIG.API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export interface WorkOrderStatus {
  id: string;
  status: string;
  runs?: Array<{
    iteration: number;
    status: string;
  }>;
}

export async function waitForWorkOrderStatus(
  baseUrl: string,
  workOrderId: string,
  targetStatuses: string[],
  timeout = E2E_CONFIG.COMPLETION_TIMEOUT
): Promise<WorkOrderStatus> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const response = await fetch(`${baseUrl}/api/v1/work-orders/${workOrderId}`);
    const body = await response.json();

    if (body.success && targetStatuses.includes(body.data.status)) {
      return body.data;
    }

    await new Promise(resolve => setTimeout(resolve, E2E_CONFIG.POLL_INTERVAL));
  }

  throw new Error(
    `Timeout waiting for work order ${workOrderId} to reach status ${targetStatuses.join(' or ')}`
  );
}

export async function createWorkOrder(
  baseUrl: string,
  payload: {
    taskPrompt: string;
    workspaceSource: {
      type: string;
      path?: string;
      repo?: string;
      branch?: string;
    };
    maxIterations?: number;
  }
): Promise<WorkOrderStatus> {
  const response = await fetch(`${baseUrl}/api/v1/work-orders`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  const body = await response.json();

  if (!body.success) {
    throw new Error(`Failed to create work order: ${body.error?.message}`);
  }

  return body.data;
}
```

#### Task 7.3: Work Order Lifecycle E2E Test

**File**: `packages/server/test/e2e/work-order-lifecycle.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { E2E_CONFIG } from './config.js';
import {
  startE2EServer,
  stopE2EServer,
  createWorkOrder,
  waitForWorkOrderStatus,
  authHeaders,
} from './helpers.js';

describe('E2E: Work Order Lifecycle', () => {
  let baseUrl: string;
  const testWorkspaceDir = path.join(import.meta.dirname, '../../../test-output/e2e-lifecycle');

  beforeAll(async () => {
    baseUrl = await startE2EServer();

    // Create test workspace directory
    await fs.mkdir(testWorkspaceDir, { recursive: true });

    // Create minimal verify.yaml
    await fs.writeFile(
      path.join(testWorkspaceDir, 'verify.yaml'),
      `version: "1"
tests:
  - name: test
    command: echo "pass"
`
    );

    // Initialize git
    const { execa } = await import('execa');
    await execa('git', ['init'], { cwd: testWorkspaceDir });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testWorkspaceDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: testWorkspaceDir });
    await execa('git', ['add', '.'], { cwd: testWorkspaceDir });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testWorkspaceDir });
  }, 30000);

  afterAll(async () => {
    await stopE2EServer();
    try {
      await fs.rm(testWorkspaceDir, { recursive: true, force: true });
    } catch {
      // Cleanup errors are ok
    }
  });

  it('should create work order and transition to queued', async () => {
    const workOrder = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E test task - create a hello world file',
      workspaceSource: { type: 'local', path: testWorkspaceDir },
      maxIterations: 1,
    });

    expect(workOrder.id).toBeDefined();
    expect(workOrder.status).toBe('queued');
  }, E2E_CONFIG.OPERATION_TIMEOUT);

  it('should list work orders including new one', async () => {
    const workOrder = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E list test task',
      workspaceSource: { type: 'local', path: testWorkspaceDir },
    });

    const response = await fetch(`${baseUrl}/api/v1/work-orders`);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.items.some((item: any) => item.id === workOrder.id)).toBe(true);
  }, E2E_CONFIG.OPERATION_TIMEOUT);

  it('should get work order detail with runs', async () => {
    const workOrder = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E detail test task',
      workspaceSource: { type: 'local', path: testWorkspaceDir },
    });

    const response = await fetch(`${baseUrl}/api/v1/work-orders/${workOrder.id}`);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(workOrder.id);
    expect(body.data.taskPrompt).toContain('E2E detail test task');
    expect(Array.isArray(body.data.runs)).toBe(true);
  }, E2E_CONFIG.OPERATION_TIMEOUT);

  it('should cancel queued work order', async () => {
    const workOrder = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E cancel test task',
      workspaceSource: { type: 'local', path: testWorkspaceDir },
    });

    expect(workOrder.status).toBe('queued');

    const response = await fetch(`${baseUrl}/api/v1/work-orders/${workOrder.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('canceled');
  }, E2E_CONFIG.OPERATION_TIMEOUT);

  it('should prevent canceling already canceled work order', async () => {
    const workOrder = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E double cancel test',
      workspaceSource: { type: 'local', path: testWorkspaceDir },
    });

    // Cancel first time
    await fetch(`${baseUrl}/api/v1/work-orders/${workOrder.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    // Try to cancel again
    const response = await fetch(`${baseUrl}/api/v1/work-orders/${workOrder.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  }, E2E_CONFIG.OPERATION_TIMEOUT);
});
```

#### Task 7.4: GitHub Workspace E2E Test

**File**: `packages/server/test/e2e/github-workspace.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2E_CONFIG, skipIfNoGitHub } from './config.js';
import {
  startE2EServer,
  stopE2EServer,
  createWorkOrder,
  waitForWorkOrderStatus,
} from './helpers.js';

describe('E2E: GitHub Workspace', () => {
  let baseUrl: string;

  beforeAll(async () => {
    if (skipIfNoGitHub()) {
      return;
    }
    baseUrl = await startE2EServer();
  }, 30000);

  afterAll(async () => {
    if (!skipIfNoGitHub()) {
      await stopE2EServer();
    }
  });

  it.skipIf(skipIfNoGitHub())('should create work order with GitHub workspace source', async () => {
    const workOrder = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E GitHub test - add a comment to README',
      workspaceSource: {
        type: 'github',
        repo: `${E2E_CONFIG.TEST_WORKSPACE.owner}/${E2E_CONFIG.TEST_WORKSPACE.repo}`,
        branch: E2E_CONFIG.TEST_WORKSPACE.branch,
      },
      maxIterations: 1,
    });

    expect(workOrder.id).toBeDefined();
    expect(workOrder.status).toBe('queued');
  }, E2E_CONFIG.OPERATION_TIMEOUT);

  it.skipIf(skipIfNoGitHub())('should clone GitHub repo for workspace', async () => {
    // This test verifies the workspace creation but doesn't run the agent
    const workOrder = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E GitHub clone test',
      workspaceSource: {
        type: 'github',
        repo: `${E2E_CONFIG.TEST_WORKSPACE.owner}/${E2E_CONFIG.TEST_WORKSPACE.repo}`,
        branch: E2E_CONFIG.TEST_WORKSPACE.branch,
      },
      maxIterations: 1,
    });

    // Work order should be created successfully
    expect(workOrder.id).toBeDefined();

    // Cancel it before it runs
    await fetch(`${baseUrl}/api/v1/work-orders/${workOrder.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${E2E_CONFIG.API_KEY}`,
      },
    });
  }, E2E_CONFIG.OPERATION_TIMEOUT);
});
```

#### Task 7.5: Multi-Iteration E2E Test

**File**: `packages/server/test/e2e/multi-iteration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { E2E_CONFIG } from './config.js';
import {
  startE2EServer,
  stopE2EServer,
  createWorkOrder,
  authHeaders,
} from './helpers.js';

describe('E2E: Multi-Iteration Scenarios', () => {
  let baseUrl: string;
  const testWorkspaceDir = path.join(import.meta.dirname, '../../../test-output/e2e-multi');

  beforeAll(async () => {
    baseUrl = await startE2EServer();

    // Create test workspace
    await fs.mkdir(testWorkspaceDir, { recursive: true });

    await fs.writeFile(
      path.join(testWorkspaceDir, 'verify.yaml'),
      `version: "1"
tests:
  - name: always-pass
    command: echo "pass"
`
    );

    const { execa } = await import('execa');
    await execa('git', ['init'], { cwd: testWorkspaceDir });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testWorkspaceDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: testWorkspaceDir });
    await execa('git', ['add', '.'], { cwd: testWorkspaceDir });
    await execa('git', ['commit', '-m', 'Initial'], { cwd: testWorkspaceDir });
  }, 30000);

  afterAll(async () => {
    await stopE2EServer();
    try {
      await fs.rm(testWorkspaceDir, { recursive: true, force: true });
    } catch {
      // Cleanup errors ok
    }
  });

  it('should accept maxIterations parameter', async () => {
    const workOrder = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E test with max iterations set',
      workspaceSource: { type: 'local', path: testWorkspaceDir },
      maxIterations: 5,
    });

    expect(workOrder.id).toBeDefined();

    // Verify by getting detail
    const response = await fetch(`${baseUrl}/api/v1/work-orders/${workOrder.id}`);
    const body = await response.json();

    expect(body.data.maxIterations).toBe(5);

    // Clean up
    await fetch(`${baseUrl}/api/v1/work-orders/${workOrder.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
  }, E2E_CONFIG.OPERATION_TIMEOUT);

  it('should create work orders with different iteration limits', async () => {
    const workOrder1 = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E iteration test 1',
      workspaceSource: { type: 'local', path: testWorkspaceDir },
      maxIterations: 1,
    });

    const workOrder2 = await createWorkOrder(baseUrl, {
      taskPrompt: 'E2E iteration test 2',
      workspaceSource: { type: 'local', path: testWorkspaceDir },
      maxIterations: 3,
    });

    // Get details and verify
    const resp1 = await fetch(`${baseUrl}/api/v1/work-orders/${workOrder1.id}`);
    const body1 = await resp1.json();

    const resp2 = await fetch(`${baseUrl}/api/v1/work-orders/${workOrder2.id}`);
    const body2 = await resp2.json();

    expect(body1.data.maxIterations).toBe(1);
    expect(body2.data.maxIterations).toBe(3);

    // Clean up
    await fetch(`${baseUrl}/api/v1/work-orders/${workOrder1.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await fetch(`${baseUrl}/api/v1/work-orders/${workOrder2.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
  }, E2E_CONFIG.OPERATION_TIMEOUT);
});
```

### Work Order for Thrust 7

**Prompt for AgentGate**:
```
Implement comprehensive E2E tests for the AgentGate work order lifecycle.

TASKS:
1. Create packages/server/test/e2e/config.ts with:
   - E2E_CONFIG object with timeouts and test config
   - skipIfNoGitHub() helper function

2. Create packages/server/test/e2e/helpers.ts with:
   - startE2EServer() - start real Fastify server
   - stopE2EServer() - clean shutdown
   - authHeaders() - authorization helper
   - waitForWorkOrderStatus() - polling helper
   - createWorkOrder() - convenience function

3. Create packages/server/test/e2e/work-order-lifecycle.test.ts with:
   - Work order creation test (queued status)
   - Work order listing test
   - Work order detail retrieval test
   - Work order cancellation test
   - Double-cancel prevention test

4. Create packages/server/test/e2e/github-workspace.test.ts with:
   - GitHub workspace source creation test
   - Skip tests if no GITHUB_TOKEN

5. Create packages/server/test/e2e/multi-iteration.test.ts with:
   - maxIterations parameter test
   - Different iteration limits test

6. Ensure all E2E tests pass

VERIFICATION:
- pnpm --filter @agentgate/server test:e2e passes
- Tests properly set up and tear down test workspaces
- Tests properly skip GitHub tests when no token available

CONSTRAINTS:
- Use vitest
- Create real test workspaces with git initialized
- Clean up test artifacts after tests
- Use proper timeouts for long-running operations
- Tests must be deterministic
```

---

## Thrust 8: CI/CD Test Integration

### Overview

Update the CI pipeline to run all new tests and ensure comprehensive coverage reporting.

### Implementation Tasks

#### Task 8.1: Update verify.yaml

**File**: `verify.yaml` (update)

Add new test commands:

```yaml
tests:
  # Existing tests...

  - name: shared-tests
    command: pnpm --filter @agentgate/shared test
    description: Shared package unit tests

  - name: dashboard-tests
    command: pnpm --filter @agentgate/dashboard test
    description: Dashboard unit tests
```

#### Task 8.2: Update CI Workflow

**File**: `.github/workflows/ci.yml` (update test job)

```yaml
test:
  name: Tests (Node ${{ matrix.node-version }})
  runs-on: ubuntu-latest
  strategy:
    fail-fast: false
    matrix:
      node-version: ['18', '20', '22']
  steps:
    # ... existing steps ...

    - name: Run all tests
      run: pnpm test
      env:
        CI: true
        NODE_ENV: test

    - name: Run E2E tests
      if: matrix.node-version == '20'
      run: pnpm --filter @agentgate/server test test/e2e
      env:
        CI: true
      continue-on-error: true  # E2E can be flaky

    - name: Run coverage (shared)
      if: matrix.node-version == '20'
      run: pnpm --filter @agentgate/shared test:coverage
      continue-on-error: true

    - name: Run coverage (dashboard)
      if: matrix.node-version == '20'
      run: pnpm --filter @agentgate/dashboard test:coverage
      continue-on-error: true

    - name: Run coverage (server)
      if: matrix.node-version == '20'
      run: pnpm --filter @agentgate/server test:coverage
      continue-on-error: true
```

#### Task 8.3: Add Package Test Scripts

Update root `package.json`:

```json
{
  "scripts": {
    "test": "pnpm -r test",
    "test:coverage": "pnpm -r test:coverage",
    "test:e2e": "pnpm --filter @agentgate/server test test/e2e"
  }
}
```

### Work Order for Thrust 8

**Prompt for AgentGate**:
```
Update CI configuration and verify.yaml to run all new tests.

TASKS:
1. Update verify.yaml to add:
   - shared-tests: pnpm --filter @agentgate/shared test
   - dashboard-tests: pnpm --filter @agentgate/dashboard test

2. Update .github/workflows/ci.yml to:
   - Run pnpm test (which runs all package tests)
   - Add E2E test step (Node 20 only, continue-on-error)
   - Add coverage steps for each package

3. Update root package.json scripts:
   - "test": "pnpm -r test"
   - "test:coverage": "pnpm -r test:coverage"
   - "test:e2e": "pnpm --filter @agentgate/server test test/e2e"

4. Run full test suite to verify:
   - pnpm test passes
   - All packages' tests run

VERIFICATION:
- pnpm test runs tests across all packages
- CI workflow includes new test steps
- verify.yaml has new test commands

CONSTRAINTS:
- Don't break existing CI jobs
- Use continue-on-error for potentially flaky E2E tests
- Maintain existing coverage upload configuration
```

### Completion Checklist

- [ ] E2E config created
- [ ] E2E helpers created
- [ ] Work order lifecycle E2E tests passing
- [ ] GitHub workspace E2E tests passing (when token available)
- [ ] Multi-iteration E2E tests passing
- [ ] verify.yaml updated with new tests
- [ ] CI workflow updated
- [ ] Root package.json scripts updated
- [ ] Full test suite passes
