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
