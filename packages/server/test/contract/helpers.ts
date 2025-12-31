import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/server/app.js';

let app: FastifyInstance | null = null;

export async function getTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await createApp({
      apiKey: 'test-api-key',
      enableLogging: false,
    });
  }
  return app;
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

export const TEST_API_KEY = 'test-api-key';

export function authHeaders() {
  return {
    Authorization: `Bearer ${TEST_API_KEY}`,
    'Content-Type': 'application/json',
  };
}
