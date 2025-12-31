import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/server/app.js';
import { createTestWebSocket, sendMessage, type TestWebSocket } from './helpers.js';

describe('WebSocket Lifecycle', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  const connections: TestWebSocket[] = [];

  beforeAll(async () => {
    app = await createApp({ enableLogging: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (typeof address === 'object' && address) {
      baseUrl = `ws://127.0.0.1:${address.port}`;
    }
  });

  afterEach(() => {
    // Close all test connections
    for (const ws of connections) {
      if (ws.readyState === ws.OPEN) {
        ws.close();
      }
    }
    connections.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should accept WebSocket connections', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    expect(ws.readyState).toBe(ws.OPEN);
  });

  it('should respond to ping with pong', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    sendMessage(ws, { type: 'ping' });

    const pong = await ws.waitForMessage(
      (msg: any) => msg.type === 'pong'
    );

    expect(pong).toMatchObject({
      type: 'pong',
      timestamp: expect.any(String),
    });
  });

  it('should handle multiple concurrent connections', async () => {
    const ws1 = await createTestWebSocket(`${baseUrl}/ws`);
    const ws2 = await createTestWebSocket(`${baseUrl}/ws`);
    const ws3 = await createTestWebSocket(`${baseUrl}/ws`);

    connections.push(ws1, ws2, ws3);

    expect(ws1.readyState).toBe(ws1.OPEN);
    expect(ws2.readyState).toBe(ws2.OPEN);
    expect(ws3.readyState).toBe(ws3.OPEN);

    // All should respond to ping
    sendMessage(ws1, { type: 'ping' });
    sendMessage(ws2, { type: 'ping' });
    sendMessage(ws3, { type: 'ping' });

    await Promise.all([
      ws1.waitForMessage((msg: any) => msg.type === 'pong'),
      ws2.waitForMessage((msg: any) => msg.type === 'pong'),
      ws3.waitForMessage((msg: any) => msg.type === 'pong'),
    ]);
  });

  it('should return error for invalid message format', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    ws.send('not valid json');

    const error = await ws.waitForMessage(
      (msg: any) => msg.type === 'error'
    );

    expect(error).toMatchObject({
      type: 'error',
      code: 'INVALID_MESSAGE',
    });
  });

  it('should return error for unknown message type', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    sendMessage(ws, { type: 'unknown_type' });

    const error = await ws.waitForMessage(
      (msg: any) => msg.type === 'error'
    );

    expect(error).toMatchObject({
      type: 'error',
      code: 'INVALID_MESSAGE',
    });
  });
});
