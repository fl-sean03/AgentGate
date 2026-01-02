/**
 * Queue Routes Unit Tests (v0.2.23 - Wave 1.7)
 * Tests for /api/v1/queue/* endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { resetQueueManager, getQueueManager } from '../src/control-plane/queue-manager.js';

describe('Queue Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetQueueManager();
    app = await createApp({ enableLogging: false });
  });

  afterEach(async () => {
    await app.close();
    resetQueueManager();
  });

  describe('GET /api/v1/queue/health', () => {
    it('should return queue health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(body.data.status);
    });

    it('should return queue statistics in health response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.stats).toBeDefined();
      expect(typeof body.data.stats.waiting).toBe('number');
      expect(typeof body.data.stats.running).toBe('number');
      expect(typeof body.data.stats.maxConcurrent).toBe('number');
      expect(typeof body.data.stats.maxQueueSize).toBe('number');
      expect(typeof body.data.stats.accepting).toBe('boolean');
    });

    it('should return utilization metric', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.data.utilization).toBe('number');
      expect(body.data.utilization).toBeGreaterThanOrEqual(0);
      expect(body.data.utilization).toBeLessThanOrEqual(1);
    });

    it('should return timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.timestamp).toBeDefined();
      expect(typeof body.data.timestamp).toBe('string');
      expect(() => new Date(body.data.timestamp)).not.toThrow();
    });

    it('should return health indicators', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.indicators).toBeDefined();
      expect(typeof body.data.indicators.accepting).toBe('boolean');
      expect(typeof body.data.indicators.canStartImmediately).toBe('boolean');
      expect(typeof body.data.indicators.queueDepth).toBe('number');
      expect(typeof body.data.indicators.runningCount).toBe('number');
    });

    it('should return success response format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('requestId');
    });

    it('should include request ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/health',
      });

      const body = response.json();
      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe('string');
    });

    it('should return healthy status when queue is empty', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.status).toBe('healthy');
      expect(body.data.indicators.accepting).toBe(true);
    });
  });

  describe('GET /api/v1/queue/stats', () => {
    it('should return queue statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it('should include all stats fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.data.waiting).toBe('number');
      expect(typeof body.data.running).toBe('number');
      expect(typeof body.data.maxConcurrent).toBe('number');
      expect(typeof body.data.averageWaitMs).toBe('number');
      expect(typeof body.data.maxQueueSize).toBe('number');
      expect(typeof body.data.accepting).toBe('boolean');
    });

    it('should return success response format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('requestId');
    });

    it('should reflect queue state changes', async () => {
      // Get initial stats
      const initialResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/stats',
      });
      const initialStats = initialResponse.json().data;

      // Enqueue a work order
      const queueManager = getQueueManager();
      queueManager.enqueue('test-wo-1');

      // Get updated stats
      const updatedResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/stats',
      });
      const updatedStats = updatedResponse.json().data;

      expect(updatedStats.waiting).toBe(initialStats.waiting + 1);
    });
  });

  describe('GET /api/v1/queue/position/:workOrderId', () => {
    it('should return 404 for non-existent work order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/position/non-existent-wo',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return position for queued work order', async () => {
      // Enqueue a work order
      const queueManager = getQueueManager();
      queueManager.enqueue('test-wo-1');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/position/test-wo-1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.position).toBe(1);
      expect(body.data.state).toBe('waiting');
      expect(body.data.ahead).toBe(0);
    });

    it('should return running state for running work order', async () => {
      const queueManager = getQueueManager();
      queueManager.enqueue('test-wo-1');
      queueManager.markStarted('test-wo-1');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/position/test-wo-1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.state).toBe('running');
      expect(body.data.position).toBe(0);
    });

    it('should return correct position for multiple queued work orders', async () => {
      const queueManager = getQueueManager();
      queueManager.enqueue('test-wo-1');
      queueManager.enqueue('test-wo-2');
      queueManager.enqueue('test-wo-3');

      const response1 = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/position/test-wo-1',
      });
      const response2 = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/position/test-wo-2',
      });
      const response3 = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/position/test-wo-3',
      });

      expect(response1.json().data.position).toBe(1);
      expect(response2.json().data.position).toBe(2);
      expect(response3.json().data.position).toBe(3);

      expect(response1.json().data.ahead).toBe(0);
      expect(response2.json().data.ahead).toBe(1);
      expect(response3.json().data.ahead).toBe(2);
    });

    it('should include enqueuedAt timestamp', async () => {
      const queueManager = getQueueManager();
      queueManager.enqueue('test-wo-1');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/position/test-wo-1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.enqueuedAt).toBeDefined();
      expect(typeof body.data.enqueuedAt).toBe('string');
      expect(() => new Date(body.data.enqueuedAt)).not.toThrow();
    });

    it('should include estimated wait time', async () => {
      const queueManager = getQueueManager();
      queueManager.enqueue('test-wo-1');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/position/test-wo-1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // estimatedWaitMs can be null or a number
      expect(
        body.data.estimatedWaitMs === null || typeof body.data.estimatedWaitMs === 'number'
      ).toBe(true);
    });

    it('should return success response format', async () => {
      const queueManager = getQueueManager();
      queueManager.enqueue('test-wo-1');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/position/test-wo-1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('requestId');
    });
  });

  describe('Queue endpoints availability', () => {
    it('should not require authentication for queue health', async () => {
      const authApp = await createApp({
        apiKey: 'secret-key',
        enableLogging: false,
      });

      try {
        const response = await authApp.inject({
          method: 'GET',
          url: '/api/v1/queue/health',
        });
        expect(response.statusCode).toBe(200);
      } finally {
        await authApp.close();
      }
    });

    it('should not require authentication for queue stats', async () => {
      const authApp = await createApp({
        apiKey: 'secret-key',
        enableLogging: false,
      });

      try {
        const response = await authApp.inject({
          method: 'GET',
          url: '/api/v1/queue/stats',
        });
        expect(response.statusCode).toBe(200);
      } finally {
        await authApp.close();
      }
    });

    it('should not require authentication for queue position', async () => {
      const authApp = await createApp({
        apiKey: 'secret-key',
        enableLogging: false,
      });

      try {
        // Note: Returns 404 because work order doesn't exist, but not 401
        const response = await authApp.inject({
          method: 'GET',
          url: '/api/v1/queue/position/some-wo',
        });
        expect(response.statusCode).toBe(404);
      } finally {
        await authApp.close();
      }
    });
  });

  describe('Queue health status calculation', () => {
    it('should return healthy when queue is mostly empty', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.status).toBe('healthy');
    });
  });
});
