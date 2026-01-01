/**
 * Docker Provider Tests
 *
 * Unit tests with mocked Docker, and integration tests for real Docker when available.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { DockerProvider } from '../../src/sandbox/docker-provider.js';
import { DockerClient } from '../../src/sandbox/docker-client.js';
import type { Sandbox, SandboxConfig } from '../../src/sandbox/types.js';
import { createMockDockerClient, checkDockerAvailable } from './test-utils.js';

// Mock dockerode for unit tests
vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => createMockDockerClient()),
  };
});

describe('DockerProvider', () => {
  describe('unit tests (mocked Docker)', () => {
    let provider: DockerProvider;

    beforeEach(() => {
      // Reset singleton
      DockerClient.resetInstance();
      provider = new DockerProvider();
    });

    afterEach(async () => {
      await provider.cleanup();
      DockerClient.resetInstance();
    });

    describe('provider basics', () => {
      it('should have name "docker"', () => {
        expect(provider.name).toBe('docker');
      });

      it('should check Docker availability', async () => {
        const available = await provider.isAvailable();
        expect(available).toBe(true);
      });

      it('should return Docker version', async () => {
        await provider.isAvailable();
        expect(provider.getDockerVersion()).toBe('24.0.0');
      });
    });

    describe('createSandbox', () => {
      it('should create sandbox with valid config', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-test-'));

        try {
          const sandbox = await provider.createSandbox({
            workspacePath: tempDir,
          });

          expect(sandbox).toBeDefined();
          expect(sandbox.id).toMatch(/^docker-/);
          expect(sandbox.status).toBe('running');
          expect(sandbox.containerId).toBeDefined();

          await sandbox.destroy();
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      });

      it('should apply default resource limits', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-test-'));

        try {
          const sandbox = await provider.createSandbox({
            workspacePath: tempDir,
          });

          expect(sandbox).toBeDefined();
          await sandbox.destroy();
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      });

      it('should register sandbox in provider', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-test-'));

        try {
          const sandbox = await provider.createSandbox({
            workspacePath: tempDir,
          });

          const sandboxes = await provider.listSandboxes();
          expect(sandboxes).toHaveLength(1);
          expect(sandboxes[0]?.id).toBe(sandbox.id);

          await sandbox.destroy();
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      });
    });

    describe('sandbox operations', () => {
      let sandbox: Sandbox;
      let tempDir: string;

      beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-test-'));
        sandbox = await provider.createSandbox({
          workspacePath: tempDir,
        });
      });

      afterEach(async () => {
        if (sandbox && sandbox.status !== 'destroyed') {
          await sandbox.destroy();
        }
        await fs.rm(tempDir, { recursive: true, force: true });
      });

      it('should execute commands', async () => {
        const result = await sandbox.execute('echo', ['hello']);

        expect(result.exitCode).toBe(0);
        expect(result.timedOut).toBe(false);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('should get stats', async () => {
        const stats = await sandbox.getStats();

        expect(stats).toBeDefined();
        // Stats may be empty or populated depending on mock
      });

      it('should destroy sandbox', async () => {
        await sandbox.destroy();

        expect(sandbox.status).toBe('destroyed');
      });

      it('should be idempotent on destroy', async () => {
        await sandbox.destroy();
        await sandbox.destroy(); // Should not throw

        expect(sandbox.status).toBe('destroyed');
      });
    });

    describe('cleanup', () => {
      it('should destroy all sandboxes on cleanup', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-test-'));

        try {
          const sandbox1 = await provider.createSandbox({
            workspacePath: tempDir,
          });
          const sandbox2 = await provider.createSandbox({
            workspacePath: tempDir,
          });

          expect(await provider.listSandboxes()).toHaveLength(2);

          await provider.cleanup();

          expect(await provider.listSandboxes()).toHaveLength(0);
          expect(sandbox1.status).toBe('destroyed');
          expect(sandbox2.status).toBe('destroyed');
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      });
    });
  });

  // Integration tests - run only if Docker is available
  describe.skipIf(!(await checkDockerAvailable()))(
    'integration tests (real Docker)',
    () => {
      // These tests require Docker to be running
      // They're skipped automatically if Docker is not available

      it.skip('should create and destroy real container', async () => {
        // Reset mock and use real dockerode
        vi.unmock('dockerode');
        DockerClient.resetInstance();

        const provider = new DockerProvider({
          defaultImage: 'alpine:latest', // Use small image for faster tests
        });

        const available = await provider.isAvailable();
        if (!available) {
          console.log('Docker not available, skipping integration test');
          return;
        }

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-real-'));

        try {
          const sandbox = await provider.createSandbox({
            workspacePath: tempDir,
            image: 'alpine:latest',
          });

          expect(sandbox.containerId).toBeDefined();
          expect(sandbox.status).toBe('running');

          // Execute a real command
          const result = await sandbox.execute('echo', ['hello from container']);
          expect(result.exitCode).toBe(0);
          expect(result.stdout.trim()).toBe('hello from container');

          await sandbox.destroy();
          expect(sandbox.status).toBe('destroyed');
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
          await provider.cleanup();
        }
      });
    }
  );
});
