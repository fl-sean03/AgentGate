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
      headers: {
        Authorization: `Bearer ${E2E_CONFIG.API_KEY}`,
      },
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
      headers: {
        Authorization: `Bearer ${E2E_CONFIG.API_KEY}`,
      },
    });
    await fetch(`${baseUrl}/api/v1/work-orders/${workOrder2.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${E2E_CONFIG.API_KEY}`,
      },
    });
  }, E2E_CONFIG.OPERATION_TIMEOUT);
});
