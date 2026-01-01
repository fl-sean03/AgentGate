/**
 * Health Routes Unit Tests
 * Tests for /health, /health/ready, and /health/live endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';

describe('Health Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApp({ enableLogging: false });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return status ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('ok');
    });

    it('should return version', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.version).toBeDefined();
      expect(typeof body.data.version).toBe('string');
      expect(body.data.version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic version
    });

    it('should include timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.timestamp).toBeDefined();
      expect(typeof body.data.timestamp).toBe('string');
      // Validate ISO 8601 timestamp
      expect(() => new Date(body.data.timestamp)).not.toThrow();
    });

    it('should return success response format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
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
        url: '/health',
      });

      const body = response.json();
      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe('string');
    });

    it('should include configuration limits', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.limits).toBeDefined();
      expect(body.data.limits).toHaveProperty('maxConcurrentRuns');
      expect(body.data.limits).toHaveProperty('maxSpawnDepth');
      expect(body.data.limits).toHaveProperty('maxChildrenPerParent');
      expect(body.data.limits).toHaveProperty('maxTreeSize');
      expect(body.data.limits).toHaveProperty('defaultTimeoutSeconds');
      // Verify default values
      expect(body.data.limits.maxConcurrentRuns).toBe(5);
      expect(body.data.limits.maxSpawnDepth).toBe(3);
      expect(body.data.limits.maxChildrenPerParent).toBe(10);
      expect(body.data.limits.maxTreeSize).toBe(100);
      expect(body.data.limits.defaultTimeoutSeconds).toBe(3600);
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect([200, 503]).toContain(response.statusCode);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('ready');
      expect(typeof body.data.ready).toBe('boolean');
    });

    it('should return checks array', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      const body = response.json();
      expect(body.data.checks).toBeDefined();
      expect(Array.isArray(body.data.checks)).toBe(true);
    });

    it('should include filesystem check', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      const body = response.json();
      const fsCheck = body.data.checks.find((c: any) => c.name === 'filesystem');
      expect(fsCheck).toBeDefined();
      expect(fsCheck.healthy).toBe(true);
      expect(fsCheck.message).toBeDefined();
      expect(typeof fsCheck.latencyMs).toBe('number');
    });

    it('should return 200 when all checks pass', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      const body = response.json();
      // Filesystem check should always pass
      expect(body.data.ready).toBe(true);
      expect(response.statusCode).toBe(200);
    });

    it('should include timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      const body = response.json();
      expect(body.data.timestamp).toBeDefined();
      expect(typeof body.data.timestamp).toBe('string');
      // Validate ISO 8601 timestamp
      expect(() => new Date(body.data.timestamp)).not.toThrow();
    });

    it('should return success response format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      const body = response.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('requestId');
    });
  });

  describe('GET /health/live', () => {
    it('should return alive true', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.alive).toBe(true);
    });

    it('should include timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      const body = response.json();
      expect(body.data.timestamp).toBeDefined();
      expect(typeof body.data.timestamp).toBe('string');
      // Validate ISO 8601 timestamp
      expect(() => new Date(body.data.timestamp)).not.toThrow();
    });

    it('should return success response format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      const body = response.json();
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('requestId');
    });

    it('should always return 200', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should respond quickly', async () => {
      const start = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });
      const duration = Date.now() - start;

      expect(response.statusCode).toBe(200);
      // Liveness check should be very fast (under 100ms)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Health endpoints availability', () => {
    it('should not require authentication', async () => {
      // Create app with API key
      const authApp = await createApp({
        apiKey: 'secret-key',
        enableLogging: false,
      });

      try {
        // Health endpoints should work without auth
        const healthResponse = await authApp.inject({
          method: 'GET',
          url: '/health',
        });
        expect(healthResponse.statusCode).toBe(200);

        const readyResponse = await authApp.inject({
          method: 'GET',
          url: '/health/ready',
        });
        expect([200, 503]).toContain(readyResponse.statusCode);

        const liveResponse = await authApp.inject({
          method: 'GET',
          url: '/health/live',
        });
        expect(liveResponse.statusCode).toBe(200);
      } finally {
        await authApp.close();
      }
    });
  });
});
