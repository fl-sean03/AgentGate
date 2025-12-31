import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/server/app.js';
import { EventBroadcaster } from '../../src/server/websocket/broadcaster.js';
import { createTestWebSocket, sendMessage, type TestWebSocket } from './helpers.js';

describe('WebSocket Subscriptions', () => {
  let app: FastifyInstance;
  let broadcaster: EventBroadcaster;
  let baseUrl: string;
  const connections: TestWebSocket[] = [];

  beforeAll(async () => {
    broadcaster = new EventBroadcaster();
    app = await createApp({ enableLogging: false, broadcaster });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (typeof address === 'object' && address) {
      baseUrl = `ws://127.0.0.1:${address.port}`;
    }
  });

  afterEach(() => {
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

  it('should confirm subscription', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    sendMessage(ws, { type: 'subscribe', workOrderId: 'wo-test-123' });

    const confirmation = await ws.waitForMessage(
      (msg: any) => msg.type === 'subscription_confirmed'
    );

    expect(confirmation).toMatchObject({
      type: 'subscription_confirmed',
      workOrderId: 'wo-test-123',
    });
  });

  it('should confirm unsubscription', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    // Subscribe first
    sendMessage(ws, { type: 'subscribe', workOrderId: 'wo-test-456' });
    await ws.waitForMessage((msg: any) => msg.type === 'subscription_confirmed');

    // Then unsubscribe
    sendMessage(ws, { type: 'unsubscribe', workOrderId: 'wo-test-456' });

    const confirmation = await ws.waitForMessage(
      (msg: any) => msg.type === 'unsubscription_confirmed'
    );

    expect(confirmation).toMatchObject({
      type: 'unsubscription_confirmed',
      workOrderId: 'wo-test-456',
    });
  });

  it('should receive events for subscribed work order', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    const workOrderId = 'wo-event-test';

    // Subscribe
    sendMessage(ws, { type: 'subscribe', workOrderId });
    await ws.waitForMessage((msg: any) => msg.type === 'subscription_confirmed');

    // Emit event through broadcaster
    broadcaster.broadcast(
      {
        type: 'work_order_updated',
        workOrderId,
        status: 'running',
        timestamp: new Date().toISOString(),
      },
      workOrderId
    );

    const event = await ws.waitForMessage(
      (msg: any) => msg.type === 'work_order_updated'
    );

    expect(event).toMatchObject({
      type: 'work_order_updated',
      workOrderId,
      status: 'running',
    });
  });

  it('should NOT receive events for unsubscribed work order', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    const subscribedId = 'wo-subscribed';
    const unsubscribedId = 'wo-not-subscribed';

    // Subscribe to one
    sendMessage(ws, { type: 'subscribe', workOrderId: subscribedId });
    await ws.waitForMessage((msg: any) => msg.type === 'subscription_confirmed');

    // Emit events for both
    broadcaster.broadcast(
      {
        type: 'work_order_updated',
        workOrderId: unsubscribedId,
        status: 'running',
        timestamp: new Date().toISOString(),
      },
      unsubscribedId
    );

    broadcaster.broadcast(
      {
        type: 'work_order_updated',
        workOrderId: subscribedId,
        status: 'succeeded',
        timestamp: new Date().toISOString(),
      },
      subscribedId
    );

    // Wait for subscribed event
    const event = await ws.waitForMessage(
      (msg: any) => msg.type === 'work_order_updated'
    );

    // Should only receive the subscribed one
    expect(event).toMatchObject({
      workOrderId: subscribedId,
    });
  });

  it('should allow subscribing to multiple work orders', async () => {
    const ws = await createTestWebSocket(`${baseUrl}/ws`);
    connections.push(ws);

    const workOrder1 = 'wo-multi-1';
    const workOrder2 = 'wo-multi-2';

    // Subscribe to both
    sendMessage(ws, { type: 'subscribe', workOrderId: workOrder1 });
    await ws.waitForMessage((msg: any) =>
      msg.type === 'subscription_confirmed' && msg.workOrderId === workOrder1
    );

    sendMessage(ws, { type: 'subscribe', workOrderId: workOrder2 });
    await ws.waitForMessage((msg: any) =>
      msg.type === 'subscription_confirmed' && msg.workOrderId === workOrder2
    );

    // Should receive events for both
    broadcaster.broadcast(
      {
        type: 'work_order_updated',
        workOrderId: workOrder1,
        status: 'running',
        timestamp: new Date().toISOString(),
      },
      workOrder1
    );

    broadcaster.broadcast(
      {
        type: 'run_started',
        workOrderId: workOrder2,
        runId: 'run-123',
        runNumber: 1,
        timestamp: new Date().toISOString(),
      },
      workOrder2
    );

    const event1 = await ws.waitForMessage(
      (msg: any) => msg.workOrderId === workOrder1
    );
    const event2 = await ws.waitForMessage(
      (msg: any) => msg.workOrderId === workOrder2
    );

    expect(event1).toBeDefined();
    expect(event2).toBeDefined();
  });
});
