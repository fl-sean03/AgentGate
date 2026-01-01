/**
 * Sandbox Test Utilities
 */

import { vi } from 'vitest';
import type { SandboxConfig, ResourceLimits } from '../../src/sandbox/types.js';

/**
 * Check if Docker is available for integration tests.
 */
export async function checkDockerAvailable(): Promise<boolean> {
  try {
    const { DockerClient } = await import('../../src/sandbox/docker-client.js');
    const client = DockerClient.getInstance();
    return client.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Create a test sandbox configuration with sensible defaults.
 */
export function createTestSandboxConfig(
  overrides: Partial<SandboxConfig> = {}
): SandboxConfig {
  return {
    workspacePath: '/tmp/test-workspace',
    workspaceMount: '/workspace',
    image: 'agentgate/agent:test',
    resourceLimits: {
      cpuCount: 1,
      memoryMB: 512,
      timeoutSeconds: 30,
      ...overrides.resourceLimits,
    },
    networkMode: 'none',
    env: {},
    ...overrides,
  };
}

/**
 * Create default resource limits for testing.
 */
export function createTestResourceLimits(
  overrides: Partial<ResourceLimits> = {}
): ResourceLimits {
  return {
    cpuCount: 1,
    memoryMB: 512,
    diskMB: 1024,
    timeoutSeconds: 30,
    ...overrides,
  };
}

/**
 * Create a mock Docker client for unit testing.
 */
export function createMockDockerClient() {
  const mockContainer = {
    id: 'mock-container-id-12345',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({
      start: vi.fn().mockResolvedValue({
        on: vi.fn((event: string, callback: (data?: unknown) => void) => {
          if (event === 'end') {
            setTimeout(() => callback(), 10);
          }
        }),
        destroy: vi.fn(),
      }),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    }),
    stats: vi.fn().mockResolvedValue({
      cpu_stats: {
        cpu_usage: { total_usage: 1000000 },
        system_cpu_usage: 10000000,
        online_cpus: 2,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 900000 },
        system_cpu_usage: 9000000,
      },
      memory_stats: {
        usage: 104857600, // 100MB
        limit: 536870912, // 512MB
      },
      networks: {
        eth0: { rx_bytes: 1024, tx_bytes: 512 },
      },
    }),
  };

  return {
    ping: vi.fn().mockResolvedValue({}),
    version: vi.fn().mockResolvedValue({ Version: '24.0.0' }),
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    listContainers: vi.fn().mockResolvedValue([]),
    listImages: vi.fn().mockResolvedValue([{ Id: 'image-id' }]),
    pull: vi.fn().mockResolvedValue({
      on: vi.fn(),
    }),
    modem: {
      followProgress: vi.fn(
        (
          _stream: unknown,
          onFinished: (err: Error | null) => void,
          _onProgress: (event: unknown) => void
        ) => {
          setTimeout(() => onFinished(null), 10);
        }
      ),
    },
    mockContainer,
  };
}

/**
 * Create a mock sandbox for testing.
 */
export function createMockSandbox(id = 'mock-sandbox-1') {
  return {
    id,
    status: 'running' as const,
    containerId: 'mock-container-123',
    execute: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'mock output',
      stderr: '',
      timedOut: false,
      durationMs: 100,
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('mock file content'),
    listFiles: vi.fn().mockResolvedValue(['file1.txt', 'file2.txt']),
    destroy: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({
      cpuPercent: 25,
      memoryBytes: 104857600,
    }),
  };
}

/**
 * Create a mock sandbox provider for testing.
 */
export function createMockProvider(name = 'mock') {
  return {
    name,
    isAvailable: vi.fn().mockResolvedValue(true),
    createSandbox: vi.fn().mockResolvedValue(createMockSandbox()),
    listSandboxes: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Wait for a specified duration.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
