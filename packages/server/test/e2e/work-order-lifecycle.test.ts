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
      headers: {
        Authorization: `Bearer ${E2E_CONFIG.API_KEY}`,
      },
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
      headers: {
        Authorization: `Bearer ${E2E_CONFIG.API_KEY}`,
      },
    });

    // Try to cancel again
    const response = await fetch(`${baseUrl}/api/v1/work-orders/${workOrder.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${E2E_CONFIG.API_KEY}`,
      },
    });

    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  }, E2E_CONFIG.OPERATION_TIMEOUT);
});
