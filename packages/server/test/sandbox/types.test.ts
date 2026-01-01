/**
 * Sandbox Types Tests
 *
 * Tests for type validation and interface contracts.
 */

import { describe, it, expect } from 'vitest';
import type {
  NetworkMode,
  ResourceLimits,
  SandboxConfig,
  SandboxStatus,
  ExecOptions,
  ExecResult,
  SandboxStats,
  Sandbox,
  SandboxProvider,
} from '../../src/sandbox/types.js';
import { DEFAULT_RESOURCE_LIMITS, DEFAULT_WORKSPACE_MOUNT } from '../../src/sandbox/provider.js';

describe('Sandbox Types', () => {
  describe('NetworkMode', () => {
    it('should allow valid network modes', () => {
      const none: NetworkMode = 'none';
      const bridge: NetworkMode = 'bridge';
      const host: NetworkMode = 'host';

      expect(none).toBe('none');
      expect(bridge).toBe('bridge');
      expect(host).toBe('host');
    });
  });

  describe('ResourceLimits', () => {
    it('should have optional fields', () => {
      const limits: ResourceLimits = {};
      expect(limits.cpuCount).toBeUndefined();
      expect(limits.memoryMB).toBeUndefined();
      expect(limits.diskMB).toBeUndefined();
      expect(limits.timeoutSeconds).toBeUndefined();
    });

    it('should accept all fields', () => {
      const limits: ResourceLimits = {
        cpuCount: 2,
        memoryMB: 4096,
        diskMB: 10240,
        timeoutSeconds: 3600,
      };

      expect(limits.cpuCount).toBe(2);
      expect(limits.memoryMB).toBe(4096);
      expect(limits.diskMB).toBe(10240);
      expect(limits.timeoutSeconds).toBe(3600);
    });
  });

  describe('SandboxConfig', () => {
    it('should require workspacePath', () => {
      const config: SandboxConfig = {
        workspacePath: '/path/to/workspace',
      };

      expect(config.workspacePath).toBe('/path/to/workspace');
    });

    it('should have optional fields', () => {
      const config: SandboxConfig = {
        workspacePath: '/workspace',
      };

      expect(config.workspaceMount).toBeUndefined();
      expect(config.image).toBeUndefined();
      expect(config.resourceLimits).toBeUndefined();
      expect(config.networkMode).toBeUndefined();
      expect(config.env).toBeUndefined();
      expect(config.user).toBeUndefined();
    });

    it('should accept all fields', () => {
      const config: SandboxConfig = {
        workspacePath: '/host/workspace',
        workspaceMount: '/container/workspace',
        image: 'my-image:latest',
        resourceLimits: { cpuCount: 2, memoryMB: 4096 },
        networkMode: 'none',
        env: { NODE_ENV: 'production' },
        user: 'agentgate',
      };

      expect(config.workspacePath).toBe('/host/workspace');
      expect(config.workspaceMount).toBe('/container/workspace');
      expect(config.image).toBe('my-image:latest');
      expect(config.resourceLimits?.cpuCount).toBe(2);
      expect(config.networkMode).toBe('none');
      expect(config.env?.NODE_ENV).toBe('production');
      expect(config.user).toBe('agentgate');
    });
  });

  describe('SandboxStatus', () => {
    it('should allow valid status values', () => {
      const statuses: SandboxStatus[] = [
        'creating',
        'running',
        'stopped',
        'destroyed',
        'error',
      ];

      expect(statuses).toHaveLength(5);
    });
  });

  describe('ExecOptions', () => {
    it('should have all optional fields', () => {
      const options: ExecOptions = {};

      expect(options.env).toBeUndefined();
      expect(options.cwd).toBeUndefined();
      expect(options.timeout).toBeUndefined();
      expect(options.stdin).toBeUndefined();
    });

    it('should accept all fields', () => {
      const options: ExecOptions = {
        env: { CUSTOM_VAR: 'value' },
        cwd: '/custom/dir',
        timeout: 60,
        stdin: 'input data',
      };

      expect(options.env?.CUSTOM_VAR).toBe('value');
      expect(options.cwd).toBe('/custom/dir');
      expect(options.timeout).toBe(60);
      expect(options.stdin).toBe('input data');
    });
  });

  describe('ExecResult', () => {
    it('should have all required fields', () => {
      const result: ExecResult = {
        exitCode: 0,
        stdout: 'output',
        stderr: '',
        timedOut: false,
        durationMs: 100,
      };

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('output');
      expect(result.stderr).toBe('');
      expect(result.timedOut).toBe(false);
      expect(result.durationMs).toBe(100);
    });

    it('should represent timeout correctly', () => {
      const result: ExecResult = {
        exitCode: 124,
        stdout: '',
        stderr: 'Execution timed out',
        timedOut: true,
        durationMs: 30000,
      };

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(124);
    });
  });

  describe('SandboxStats', () => {
    it('should have all optional fields', () => {
      const stats: SandboxStats = {};

      expect(stats.cpuPercent).toBeUndefined();
      expect(stats.memoryBytes).toBeUndefined();
      expect(stats.diskReadBytes).toBeUndefined();
      expect(stats.diskWriteBytes).toBeUndefined();
      expect(stats.networkRxBytes).toBeUndefined();
      expect(stats.networkTxBytes).toBeUndefined();
    });

    it('should accept all fields', () => {
      const stats: SandboxStats = {
        cpuPercent: 45.5,
        memoryBytes: 1073741824,
        diskReadBytes: 10485760,
        diskWriteBytes: 5242880,
        networkRxBytes: 1024,
        networkTxBytes: 2048,
      };

      expect(stats.cpuPercent).toBe(45.5);
      expect(stats.memoryBytes).toBe(1073741824);
      expect(stats.diskReadBytes).toBe(10485760);
      expect(stats.diskWriteBytes).toBe(5242880);
      expect(stats.networkRxBytes).toBe(1024);
      expect(stats.networkTxBytes).toBe(2048);
    });
  });

  describe('DEFAULT_RESOURCE_LIMITS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RESOURCE_LIMITS.cpuCount).toBeGreaterThan(0);
      expect(DEFAULT_RESOURCE_LIMITS.memoryMB).toBeGreaterThan(0);
      expect(DEFAULT_RESOURCE_LIMITS.diskMB).toBeGreaterThan(0);
      expect(DEFAULT_RESOURCE_LIMITS.timeoutSeconds).toBeGreaterThan(0);
    });

    it('should have all required fields', () => {
      expect(DEFAULT_RESOURCE_LIMITS.cpuCount).toBeDefined();
      expect(DEFAULT_RESOURCE_LIMITS.memoryMB).toBeDefined();
      expect(DEFAULT_RESOURCE_LIMITS.diskMB).toBeDefined();
      expect(DEFAULT_RESOURCE_LIMITS.timeoutSeconds).toBeDefined();
    });
  });

  describe('DEFAULT_WORKSPACE_MOUNT', () => {
    it('should be /workspace', () => {
      expect(DEFAULT_WORKSPACE_MOUNT).toBe('/workspace');
    });
  });
});
