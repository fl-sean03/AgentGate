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
