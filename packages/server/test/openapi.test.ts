/**
 * OpenAPI Documentation Tests
 *
 * Tests OpenAPI/Swagger documentation integration.
 * v0.2.17 - Thrust 5
 *
 * @module test/openapi
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { FastifyInstance } from 'fastify';

describe('OpenAPI Documentation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp({
      apiKey: 'test-api-key',
      enableLogging: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Swagger JSON endpoint', () => {
    it('should return valid OpenAPI specification', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const spec = response.json();
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBe('AgentGate API');
      expect(spec.info.version).toBe('0.2.17');
    });

    it('should include API description with authentication info', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.info.description).toContain('Authentication');
      expect(spec.info.description).toContain('X-API-Key');
    });

    it('should define server URLs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.servers).toBeDefined();
      expect(spec.servers.length).toBeGreaterThanOrEqual(1);
      expect(spec.servers[0].url).toBeDefined();
    });

    it('should define API tags', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.tags).toBeDefined();
      expect(spec.tags.length).toBeGreaterThan(0);

      const tagNames = spec.tags.map((t: { name: string }) => t.name);
      expect(tagNames).toContain('Work Orders');
      expect(tagNames).toContain('Runs');
      expect(tagNames).toContain('Profiles');
      expect(tagNames).toContain('Audit');
      expect(tagNames).toContain('Streaming');
      expect(tagNames).toContain('Health');
    });

    it('should define security schemes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.components).toBeDefined();
      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.apiKey).toBeDefined();
      expect(spec.components.securitySchemes.apiKey.type).toBe('apiKey');
      expect(spec.components.securitySchemes.apiKey.in).toBe('header');
      expect(spec.components.securitySchemes.apiKey.name).toBe('X-API-Key');
    });

    it('should include component schemas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.components.schemas).toBeDefined();
      expect(spec.components.schemas.Error).toBeDefined();
      expect(spec.components.schemas.WorkOrderSummary).toBeDefined();
      expect(spec.components.schemas.RunSummary).toBeDefined();
      expect(spec.components.schemas.ProfileSummary).toBeDefined();
    });
  });

  describe('Swagger YAML endpoint', () => {
    it('should return YAML specification', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/yaml',
      });

      expect(response.statusCode).toBe(200);
      // Content-type can be application/yaml or application/x-yaml
      expect(response.headers['content-type']).toMatch(/application\/(x-)?yaml/);
      expect(response.payload).toContain('openapi:');
      expect(response.payload).toContain('AgentGate API');
    });
  });

  describe('Swagger UI', () => {
    it('should serve Swagger UI at /docs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.payload).toContain('swagger-ui');
    });

    it('should redirect /docs to /docs/', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs',
      });

      // Swagger UI plugin typically redirects /docs to /docs/
      expect([200, 302]).toContain(response.statusCode);
    });
  });

  describe('Route paths', () => {
    it('should document work orders routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.paths).toBeDefined();
      expect(spec.paths['/api/v1/work-orders']).toBeDefined();
      expect(spec.paths['/api/v1/work-orders/{id}']).toBeDefined();
    });

    it('should document runs routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.paths['/api/v1/runs']).toBeDefined();
      expect(spec.paths['/api/v1/runs/{id}']).toBeDefined();
    });

    it('should document profiles routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.paths['/api/v1/profiles']).toBeDefined();
      expect(spec.paths['/api/v1/profiles/{name}']).toBeDefined();
    });

    it('should document audit routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.paths['/api/v1/audit/runs/{runId}']).toBeDefined();
    });

    it('should document health routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      expect(spec.paths['/health']).toBeDefined();
    });
  });

  describe('Component schemas validation', () => {
    it('should define Error schema correctly', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      const errorSchema = spec.components.schemas.Error;

      expect(errorSchema.type).toBe('object');
      expect(errorSchema.properties.success).toBeDefined();
      expect(errorSchema.properties.error).toBeDefined();
      expect(errorSchema.properties.requestId).toBeDefined();
    });

    it('should define WorkspaceSource as oneOf schema', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      const wsSchema = spec.components.schemas.WorkspaceSource;

      expect(wsSchema.oneOf).toBeDefined();
      expect(wsSchema.oneOf.length).toBe(3);
    });

    it('should define LoopStrategyConfig with correct enum values', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const spec = response.json();
      const strategySchema = spec.components.schemas.LoopStrategyConfig;

      expect(strategySchema.properties.mode.enum).toContain('fixed');
      expect(strategySchema.properties.mode.enum).toContain('hybrid');
      expect(strategySchema.properties.mode.enum).toContain('ralph');
      expect(strategySchema.properties.mode.enum).toContain('custom');
    });
  });
});

describe('app.swagger() method', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp({
      apiKey: 'test-api-key',
      enableLogging: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return OpenAPI document object', () => {
    const spec = app.swagger();

    expect(spec).toBeDefined();
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info).toBeDefined();
    expect(spec.paths).toBeDefined();
    expect(spec.components).toBeDefined();
  });

  it('should return YAML string when yaml option is true', () => {
    const yaml = app.swagger({ yaml: true });

    expect(typeof yaml).toBe('string');
    expect(yaml).toContain('openapi:');
    expect(yaml).toContain('info:');
    expect(yaml).toContain('title: AgentGate API');
  });
});
