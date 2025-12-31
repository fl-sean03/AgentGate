/**
 * Server App Unit Tests
 * Tests for createApp() configuration and error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';

describe('Server App', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('createApp()', () => {
    it('should return configured Fastify instance', async () => {
      app = await createApp({
        port: 3000,
        host: '127.0.0.1',
        enableLogging: false,
      });

      expect(app).toBeDefined();
      expect(app.server).toBeDefined();
      expect(typeof app.inject).toBe('function');
    });

    it('should apply default configuration when no config provided', async () => {
      app = await createApp();

      expect(app).toBeDefined();
      // App should be ready to start with defaults
      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      expect(address).toBeTruthy();
    });

    it('should configure with custom API key', async () => {
      app = await createApp({
        apiKey: 'test-key-123',
        enableLogging: false,
      });

      expect(app).toBeDefined();
      // API key is configured internally, verified by auth tests
    });

    it('should configure with custom broadcaster', async () => {
      const { EventBroadcaster } = await import('../src/server/websocket/broadcaster.js');
      const broadcaster = new EventBroadcaster();

      app = await createApp({
        broadcaster,
        enableLogging: false,
      });

      expect(app).toBeDefined();
    });
  });

  describe('CORS configuration', () => {
    beforeEach(async () => {
      app = await createApp({
        corsOrigins: ['http://localhost:3000'],
        enableLogging: false,
      });
    });

    it('should configure CORS correctly', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });

    it('should include proper CORS headers on responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'Origin': 'http://localhost:3000',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Error handler', () => {
    beforeEach(async () => {
      app = await createApp({ enableLogging: false });
    });

    it('should return proper JSON format for errors', async () => {
      // Trigger an error by making an invalid request
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          // Missing required fields to trigger validation error
          invalid: 'data',
        },
      });

      expect(response.statusCode).toBe(401); // No auth header
      const body = response.json();
      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
    });

    it('should include request ID in error response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {},
      });

      const body = response.json();
      expect(body).toHaveProperty('requestId');
      expect(typeof body.requestId).toBe('string');
    });

    it('should handle validation errors with BAD_REQUEST code', async () => {
      app = await createApp({ apiKey: 'test-key', enableLogging: false });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: {
          'Authorization': 'Bearer test-key',
          'Content-Type': 'application/json',
        },
        payload: {
          taskPrompt: 'short', // Too short, will fail validation
          workspaceSource: { type: 'local', path: '/tmp' },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toBe('Invalid request body');
    });
  });

  describe('Not found handler', () => {
    beforeEach(async () => {
      app = await createApp({ enableLogging: false });
    });

    it('should return 404 for unknown routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown/route',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return proper error format for 404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/does-not-exist',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body).toHaveProperty('success', false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('GET /does-not-exist not found');
    });

    it('should include request ID in 404 response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body).toHaveProperty('requestId');
    });
  });

  describe('Request ID handling', () => {
    beforeEach(async () => {
      app = await createApp({ enableLogging: false });
    });

    it('should add X-Request-ID header to responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.headers['x-request-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
    });

    it('should generate unique request IDs', async () => {
      const response1 = await app.inject({ method: 'GET', url: '/health' });
      const response2 = await app.inject({ method: 'GET', url: '/health' });

      const id1 = response1.headers['x-request-id'];
      const id2 = response2.headers['x-request-id'];

      expect(id1).not.toBe(id2);
    });
  });
});
