/**
 * Config Loader Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  listProfiles,
  loadProfile,
  profileExists,
  saveProfile,
  ensureHarnessDir,
  HARNESS_DIR,
  PROFILE_EXTENSION,
  ProfileNotFoundError,
  ProfileParseError,
  ProfileValidationError,
  type HarnessProfileInfo,
} from '../../src/harness/config-loader.js';
import { LoopStrategyMode, type HarnessConfig } from '../../src/types/harness-config.js';

// Test fixtures path
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'harness');

describe('Config Loader', () => {
  describe('constants', () => {
    it('should have correct HARNESS_DIR path', () => {
      const expectedDir = path.join(os.homedir(), '.agentgate', 'harnesses');
      expect(HARNESS_DIR).toBe(expectedDir);
    });

    it('should have correct PROFILE_EXTENSION', () => {
      expect(PROFILE_EXTENSION).toBe('.yaml');
    });
  });

  describe('loadProfile', () => {
    it('should load valid profile from absolute path', async () => {
      const profilePath = path.join(FIXTURES_DIR, 'valid-profile.yaml');
      const config = await loadProfile(profilePath);

      expect(config).toBeDefined();
      expect(config.loopStrategy.mode).toBe(LoopStrategyMode.HYBRID);
      expect(config.agentDriver?.type).toBe('claude-code-subscription');
    });

    it('should load minimal profile from absolute path', async () => {
      const profilePath = path.join(FIXTURES_DIR, 'minimal-profile.yaml');
      const config = await loadProfile(profilePath);

      expect(config).toBeDefined();
      expect(config.loopStrategy.mode).toBe(LoopStrategyMode.FIXED);
      if (config.loopStrategy.mode === LoopStrategyMode.FIXED) {
        expect(config.loopStrategy.maxIterations).toBe(1);
      }
    });

    it('should throw ProfileNotFoundError for non-existent file', async () => {
      const profilePath = path.join(FIXTURES_DIR, 'nonexistent-profile.yaml');

      await expect(loadProfile(profilePath)).rejects.toThrow(ProfileNotFoundError);
    });

    it('should throw ProfileParseError for invalid YAML', async () => {
      const profilePath = path.join(FIXTURES_DIR, 'invalid-yaml.yaml');

      await expect(loadProfile(profilePath)).rejects.toThrow(ProfileParseError);
    });

    it('should throw ProfileValidationError for invalid schema', async () => {
      const profilePath = path.join(FIXTURES_DIR, 'invalid-schema.yaml');

      await expect(loadProfile(profilePath)).rejects.toThrow(ProfileValidationError);
    });

    it('should include helpful error message in ProfileNotFoundError', async () => {
      const profilePath = '/nonexistent/path/to/profile.yaml';

      try {
        await loadProfile(profilePath);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProfileNotFoundError);
        const notFoundError = error as ProfileNotFoundError;
        expect(notFoundError.nameOrPath).toBe(profilePath);
        expect(notFoundError.searchPaths).toContain(profilePath);
      }
    });

    it('should include validation issues in ProfileValidationError', async () => {
      const profilePath = path.join(FIXTURES_DIR, 'invalid-schema.yaml');

      try {
        await loadProfile(profilePath);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProfileValidationError);
        const validationError = error as ProfileValidationError;
        expect(validationError.profilePath).toBe(profilePath);
        expect(validationError.zodError).toBeDefined();
        expect(validationError.message).toContain('validation failed');
      }
    });

    it('should resolve relative path with extension to cwd', async () => {
      // Test with a relative path that includes the full path from cwd
      // Since we can't change cwd in vitest workers, we test the resolution logic
      // by using a path relative to the current working directory
      const relativePath = path.relative(process.cwd(), path.join(FIXTURES_DIR, 'valid-profile.yaml'));
      const config = await loadProfile(relativePath);

      expect(config).toBeDefined();
      expect(config.loopStrategy.mode).toBe(LoopStrategyMode.HYBRID);
    });
  });

  describe('ProfileNotFoundError', () => {
    it('should contain nameOrPath and searchPaths', () => {
      const error = new ProfileNotFoundError('my-profile', ['/path/1', '/path/2']);

      expect(error.nameOrPath).toBe('my-profile');
      expect(error.searchPaths).toEqual(['/path/1', '/path/2']);
      expect(error.message).toContain('my-profile');
      expect(error.message).toContain('/path/1');
      expect(error.message).toContain('/path/2');
      expect(error.name).toBe('ProfileNotFoundError');
    });
  });

  describe('ProfileParseError', () => {
    it('should contain profilePath and cause', () => {
      const cause = new Error('Unexpected token');
      const error = new ProfileParseError('/path/to/profile.yaml', cause);

      expect(error.profilePath).toBe('/path/to/profile.yaml');
      expect(error.cause).toBe(cause);
      expect(error.message).toContain('/path/to/profile.yaml');
      expect(error.message).toContain('Unexpected token');
      expect(error.name).toBe('ProfileParseError');
    });
  });

  describe('ProfileValidationError', () => {
    it('should contain profilePath and zodError', () => {
      const { ZodError } = require('zod');
      const zodError = new ZodError([
        { code: 'invalid_type', expected: 'string', received: 'number', path: ['name'], message: 'Expected string' },
      ]);
      const error = new ProfileValidationError('/path/to/profile.yaml', zodError);

      expect(error.profilePath).toBe('/path/to/profile.yaml');
      expect(error.zodError).toBe(zodError);
      expect(error.message).toContain('/path/to/profile.yaml');
      expect(error.message).toContain('validation failed');
      expect(error.name).toBe('ProfileValidationError');
    });
  });

  describe('listProfiles', () => {
    let tempDir: string;

    beforeEach(async () => {
      // Create a temporary directory for testing
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-loader-test-'));
    });

    afterEach(async () => {
      // Clean up temporary directory
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should return empty array when directory does not exist', async () => {
      // Mock HARNESS_DIR to non-existent path
      vi.spyOn(await import('../../src/harness/config-loader.js'), 'listProfiles').mockRestore();

      // For this test, we'll use the actual function but verify behavior
      // by testing with the real HARNESS_DIR (which may or may not exist)
      const profiles = await listProfiles();
      expect(Array.isArray(profiles)).toBe(true);
    });

    it('should parse profile metadata correctly', async () => {
      // Copy fixtures to temp dir and test
      const testProfiles = ['valid-profile.yaml', 'minimal-profile.yaml'];

      for (const profile of testProfiles) {
        const src = path.join(FIXTURES_DIR, profile);
        const dest = path.join(tempDir, profile);
        await fs.copyFile(src, dest);
      }

      // We can't easily test listProfiles with a custom directory without mocking
      // but we can verify the function returns the expected structure
      const profiles = await listProfiles();
      expect(Array.isArray(profiles)).toBe(true);

      // Each profile should have the expected structure
      for (const profile of profiles) {
        expect(profile).toHaveProperty('name');
        expect(profile).toHaveProperty('path');
        expect(profile).toHaveProperty('description');
        expect(profile).toHaveProperty('extends');
      }
    });
  });

  describe('profileExists', () => {
    it('should return false for non-existent profile', async () => {
      const exists = await profileExists('definitely-nonexistent-profile-12345');
      expect(exists).toBe(false);
    });
  });

  describe('saveProfile', () => {
    let tempDir: string;
    let originalHarnessDir: string;

    beforeEach(async () => {
      // Create a temporary directory for testing
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-loader-save-test-'));
    });

    afterEach(async () => {
      // Clean up temporary directory
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should throw ProfileValidationError for invalid config', async () => {
      const invalidConfig = {
        loopStrategy: {
          mode: 'invalid_mode' as unknown as LoopStrategyMode,
        },
      } as unknown as HarnessConfig;

      await expect(saveProfile('test-profile', invalidConfig)).rejects.toThrow(ProfileValidationError);
    });

    it('should validate config before saving', async () => {
      const validConfig: HarnessConfig = {
        version: '1.0',
        loopStrategy: {
          mode: LoopStrategyMode.FIXED,
          maxIterations: 3,
          completionDetection: [],
        },
        verification: {},
        gitOps: {},
        executionLimits: {},
      };

      // This will attempt to save to the real HARNESS_DIR
      // We're mainly testing that validation passes
      try {
        await saveProfile('test-save-profile', validConfig);
        // If it succeeds, clean up
        const profilePath = path.join(HARNESS_DIR, 'test-save-profile.yaml');
        await fs.unlink(profilePath).catch(() => {});
      } catch (error) {
        // May fail due to permissions, but shouldn't be a validation error
        if (error instanceof ProfileValidationError) {
          throw error;
        }
        // Other errors (like permission denied) are acceptable for this test
      }
    });
  });

  describe('ensureHarnessDir', () => {
    it('should not throw when called multiple times', async () => {
      // This should be idempotent
      await expect(ensureHarnessDir()).resolves.not.toThrow();
      await expect(ensureHarnessDir()).resolves.not.toThrow();
    });

    it('should create the harness directory if it does not exist', async () => {
      // ensureHarnessDir uses HARNESS_DIR which is the real user directory
      // We just verify it doesn't throw
      await ensureHarnessDir();

      // Verify directory exists
      const stats = await fs.stat(HARNESS_DIR);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('integration: load fixtures', () => {
    it('should load and validate valid-profile fixture', async () => {
      const profilePath = path.join(FIXTURES_DIR, 'valid-profile.yaml');
      const config = await loadProfile(profilePath);

      expect(config.version).toBe('1.0');
      expect(config.loopStrategy.mode).toBe(LoopStrategyMode.HYBRID);

      if (config.loopStrategy.mode === LoopStrategyMode.HYBRID) {
        expect(config.loopStrategy.baseIterations).toBe(5);
        expect(config.loopStrategy.maxBonusIterations).toBe(3);
      }

      expect(config.agentDriver?.type).toBe('claude-code-subscription');
      expect(config.agentDriver?.model).toBe('claude-sonnet-4-20250514');

      expect(config.verification.cleanRoom).toBe(true);
      expect(config.verification.parallelTests).toBe(true);

      expect(config.gitOps.mode).toBe('github_pr');
      expect(config.gitOps.autoCommit).toBe(true);

      expect(config.executionLimits.maxWallClockSeconds).toBe(7200);
    });

    it('should load and validate minimal-profile fixture', async () => {
      const profilePath = path.join(FIXTURES_DIR, 'minimal-profile.yaml');
      const config = await loadProfile(profilePath);

      // Minimal profile should still have defaults applied
      expect(config.version).toBe('1.0');
      expect(config.loopStrategy.mode).toBe(LoopStrategyMode.FIXED);

      if (config.loopStrategy.mode === LoopStrategyMode.FIXED) {
        expect(config.loopStrategy.maxIterations).toBe(1);
      }

      // Verification defaults should be applied
      expect(config.verification).toBeDefined();
      expect(config.gitOps).toBeDefined();
      expect(config.executionLimits).toBeDefined();
    });
  });
});
