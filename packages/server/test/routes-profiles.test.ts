/**
 * Profile Routes Unit Tests
 * Tests for /api/v1/profiles endpoints
 * v0.2.17 - Thrust 2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { HarnessConfig } from '../src/types/harness-config.js';
import type { HarnessProfileInfo } from '../src/harness/config-loader.js';

// Mock profile storage
const mockProfiles = new Map<string, HarnessConfig>();
const mockProfileInfos: HarnessProfileInfo[] = [];

// Mock config-loader module
vi.mock('../src/harness/config-loader.js', () => ({
  listProfiles: vi.fn(async () => mockProfileInfos),
  loadProfile: vi.fn(async (name: string) => {
    const profile = mockProfiles.get(name);
    if (!profile) {
      const error = new Error(`Profile not found: ${name}`);
      (error as any).name = 'ProfileNotFoundError';
      throw error;
    }
    return profile;
  }),
  saveProfile: vi.fn(async (name: string, config: HarnessConfig) => {
    mockProfiles.set(name, config);
    // Update infos if not present
    if (!mockProfileInfos.find((p) => p.name === name)) {
      mockProfileInfos.push({
        name,
        path: `/mock/path/${name}.yaml`,
        description: config.metadata?.description as string ?? null,
        extends: config.metadata?.extends as string ?? null,
      });
    }
  }),
  deleteProfile: vi.fn(async (name: string) => {
    if (!mockProfiles.has(name)) {
      const error = new Error(`Profile not found: ${name}`);
      (error as any).name = 'ProfileNotFoundError';
      throw error;
    }
    mockProfiles.delete(name);
    const idx = mockProfileInfos.findIndex((p) => p.name === name);
    if (idx >= 0) {
      mockProfileInfos.splice(idx, 1);
    }
  }),
  profileExists: vi.fn(async (name: string) => mockProfiles.has(name)),
  HARNESS_DIR: '/mock/harnesses',
  DEFAULT_PROFILE_NAME: 'default',
  PROFILE_EXTENSION: '.yaml',
}));

// Mock config-resolver module
vi.mock('../src/harness/config-resolver.js', () => ({
  resolveHarnessConfig: vi.fn(async ({ profileName }: { profileName: string }) => {
    const profile = mockProfiles.get(profileName);
    if (!profile) {
      throw new Error(`Profile not found: ${profileName}`);
    }
    // Return a resolved config (mock)
    return {
      loopStrategy: { mode: 'fixed', maxIterations: 3 },
      verification: { skipLevels: [] },
      gitOps: { mode: 'local' },
      executionLimits: { maxWallClockSeconds: 3600 },
    };
  }),
  computeConfigHash: vi.fn(() => 'mock-hash-123'),
}));

// Helper to create a basic profile config
function createMockProfileConfig(
  name: string,
  options: Partial<HarnessConfig> = {}
): HarnessConfig {
  return {
    version: '1.0',
    metadata: {
      name,
      description: options.metadata?.description ?? `${name} profile`,
      extends: options.metadata?.extends,
    },
    loopStrategy: options.loopStrategy ?? { mode: 'fixed', maxIterations: 3 },
    verification: options.verification ?? { skipLevels: [] },
    gitOps: options.gitOps ?? { mode: 'local' },
    executionLimits: options.executionLimits ?? { maxWallClockSeconds: 3600 },
  };
}

// Helper to add built-in profiles
function setupBuiltInProfiles(): void {
  const builtInNames = ['default', 'ci-focused', 'rapid-iteration', 'ralph-style'];
  for (const name of builtInNames) {
    const config = createMockProfileConfig(name);
    mockProfiles.set(name, config);
    mockProfileInfos.push({
      name,
      path: `/mock/harnesses/${name}.yaml`,
      description: `${name} built-in profile`,
      extends: null,
    });
  }
}

describe('Profile Routes', () => {
  let app: FastifyInstance;
  const testApiKey = 'test-api-key-123';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockProfiles.clear();
    mockProfileInfos.length = 0;

    // Set up built-in profiles
    setupBuiltInProfiles();

    app = await createApp({
      apiKey: testApiKey,
      enableLogging: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/profiles', () => {
    it('should return list of profiles', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('items');
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(body.data).toHaveProperty('total');
    });

    it('should include built-in profiles', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles',
      });

      const body = response.json();
      const defaultProfile = body.data.items.find((p: any) => p.name === 'default');
      expect(defaultProfile).toBeDefined();
      expect(defaultProfile.isBuiltIn).toBe(true);
    });

    it('should mark custom profiles as not built-in', async () => {
      // Add a custom profile
      const customConfig = createMockProfileConfig('my-custom');
      mockProfiles.set('my-custom', customConfig);
      mockProfileInfos.push({
        name: 'my-custom',
        path: '/mock/harnesses/my-custom.yaml',
        description: 'Custom profile',
        extends: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles',
      });

      const body = response.json();
      const customProfile = body.data.items.find((p: any) => p.name === 'my-custom');
      expect(customProfile).toBeDefined();
      expect(customProfile.isBuiltIn).toBe(false);
    });

    it('should not require authentication', async () => {
      // No auth header, should still work
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return profile summaries with expected fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles',
      });

      const body = response.json();
      const profile = body.data.items[0];
      expect(profile).toHaveProperty('name');
      expect(profile).toHaveProperty('description');
      expect(profile).toHaveProperty('extends');
      expect(profile).toHaveProperty('isBuiltIn');
    });
  });

  describe('GET /api/v1/profiles/:name', () => {
    it('should return profile detail when found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/default',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('default');
      expect(body.data.isBuiltIn).toBe(true);
    });

    it('should return 404 when profile not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Profile not found');
    });

    it('should include loopStrategy, verification, gitOps, and executionLimits', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/default',
      });

      const body = response.json();
      expect(body.data).toHaveProperty('loopStrategy');
      expect(body.data).toHaveProperty('verification');
      expect(body.data).toHaveProperty('gitOps');
      expect(body.data).toHaveProperty('executionLimits');
    });

    it('should include resolved config when resolve=true', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/default?resolve=true',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.resolved).toBeDefined();
      expect(body.data.resolved).toHaveProperty('inheritanceChain');
      expect(body.data.resolved).toHaveProperty('configHash');
    });

    it('should not include resolved config when resolve=false', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/default?resolve=false',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.resolved).toBeUndefined();
    });

    it('should return 400 for invalid profile name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/',
      });

      expect([400, 404]).toContain(response.statusCode);
    });
  });

  describe('POST /api/v1/profiles', () => {
    const validPayload = {
      name: 'my-new-profile',
      description: 'A new custom profile',
      loopStrategy: {
        mode: 'fixed',
        maxIterations: 5,
      },
    };

    it('should create profile with valid auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('my-new-profile');
      expect(body.data.isBuiltIn).toBe(false);
    });

    it('should return 401 without auth header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': 'Bearer wrong-key',
          'Content-Type': 'application/json',
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid profile name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          name: 'Invalid Name!',
          description: 'Bad name',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    it('should return 409 when profile already exists', async () => {
      // First create
      await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: validPayload,
      });

      // Try to create again
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('should support extends parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          name: 'child-profile',
          description: 'Extends default',
          extends: 'default',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.extends).toBe('default');
    });

    it('should return 400 when extending nonexistent profile', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          name: 'orphan-profile',
          description: 'Extends nonexistent',
          extends: 'does-not-exist',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.message).toContain('Parent profile not found');
    });

    it('should accept verification settings', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          name: 'verification-profile',
          verification: {
            skipLevels: ['lint'],
            cleanRoom: true,
          },
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should accept gitOps settings', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          name: 'gitops-profile',
          gitOps: {
            mode: 'github_pr',
            autoCommit: true,
          },
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should accept executionLimits settings', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          name: 'limits-profile',
          executionLimits: {
            maxWallClockSeconds: 7200,
          },
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('PUT /api/v1/profiles/:name', () => {
    beforeEach(async () => {
      // Create a custom profile for update tests
      const customConfig = createMockProfileConfig('updateable');
      mockProfiles.set('updateable', customConfig);
      mockProfileInfos.push({
        name: 'updateable',
        path: '/mock/harnesses/updateable.yaml',
        description: 'Updateable profile',
        extends: null,
      });
    });

    it('should update profile with valid auth', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/profiles/updateable',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          description: 'Updated description',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('updated successfully');
    });

    it('should return 401 without auth header', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/profiles/updateable',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          description: 'Updated',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when updating built-in profile', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/profiles/default',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          description: 'Trying to modify built-in',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('Cannot modify built-in profile');
    });

    it('should return 404 when profile not found', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/profiles/nonexistent',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          description: 'Update nonexistent',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should update loopStrategy', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/profiles/updateable',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          loopStrategy: {
            maxIterations: 10,
          },
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 400 when setting self as extends', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/profiles/updateable',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          extends: 'updateable',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.message).toContain('cannot extend itself');
    });

    it('should return 400 when extends references nonexistent profile', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/profiles/updateable',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
          'Content-Type': 'application/json',
        },
        payload: {
          extends: 'does-not-exist',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.message).toContain('Parent profile not found');
    });
  });

  describe('DELETE /api/v1/profiles/:name', () => {
    beforeEach(async () => {
      // Create a custom profile for delete tests
      const deletableConfig = createMockProfileConfig('deletable');
      mockProfiles.set('deletable', deletableConfig);
      mockProfileInfos.push({
        name: 'deletable',
        path: '/mock/harnesses/deletable.yaml',
        description: 'Deletable profile',
        extends: null,
      });
    });

    it('should delete profile with valid auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/profiles/deletable',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('deleted successfully');
    });

    it('should return 401 without auth header', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/profiles/deletable',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when deleting built-in profile', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/profiles/default',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('Cannot delete built-in profile');
    });

    it('should return 404 when profile not found', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/profiles/nonexistent',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 409 when profile has dependents', async () => {
      // Create a parent and child
      const parentConfig = createMockProfileConfig('parent-profile');
      mockProfiles.set('parent-profile', parentConfig);
      mockProfileInfos.push({
        name: 'parent-profile',
        path: '/mock/harnesses/parent-profile.yaml',
        description: 'Parent profile',
        extends: null,
      });

      const childConfig = createMockProfileConfig('child-profile', {
        metadata: { extends: 'parent-profile' },
      });
      mockProfiles.set('child-profile', childConfig);
      mockProfileInfos.push({
        name: 'child-profile',
        path: '/mock/harnesses/child-profile.yaml',
        description: 'Child profile',
        extends: 'parent-profile',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/profiles/parent-profile',
        headers: {
          'Authorization': `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('other profiles depend on it');
    });
  });

  describe('POST /api/v1/profiles/:name/validate', () => {
    it('should validate existing profile', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles/default/validate',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('valid');
      expect(body.data).toHaveProperty('errors');
      expect(body.data).toHaveProperty('warnings');
    });

    it('should return valid=true for valid profile', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles/default/validate',
      });

      const body = response.json();
      expect(body.data.valid).toBe(true);
      expect(body.data.errors).toHaveLength(0);
    });

    it('should return 404 for nonexistent profile', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles/nonexistent/validate',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should not require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles/default/validate',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should include resolved config in response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles/default/validate',
      });

      const body = response.json();
      expect(body.data.resolved).toBeDefined();
    });
  });
});
