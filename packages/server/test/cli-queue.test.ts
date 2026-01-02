/**
 * Queue CLI Command Unit Tests (v0.2.23 - Wave 3.1)
 *
 * Tests for the queue management CLI commands:
 * - list
 * - cancel
 * - purge
 * - kill
 * - health
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createQueueCommand } from '../src/control-plane/commands/queue.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Store original process.exit and exitCode
const originalExitCode = process.exitCode;

describe('Queue CLI Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    // Set required environment variable
    process.env['AGENTGATE_API_KEY'] = 'test-api-key';
    process.env['AGENTGATE_API_URL'] = 'http://localhost:3001';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
    delete process.env['AGENTGATE_API_KEY'];
    delete process.env['AGENTGATE_API_URL'];
  });

  describe('createQueueCommand', () => {
    it('should create a command with correct name and description', () => {
      const command = createQueueCommand();
      expect(command.name()).toBe('queue');
      expect(command.description()).toBe('Manage the work order queue');
    });

    it('should have all subcommands', () => {
      const command = createQueueCommand();
      const subcommands = command.commands.map((c) => c.name());

      expect(subcommands).toContain('list');
      expect(subcommands).toContain('cancel');
      expect(subcommands).toContain('purge');
      expect(subcommands).toContain('kill');
      expect(subcommands).toContain('health');
    });
  });

  describe('queue list', () => {
    it('should fetch and display work orders', async () => {
      const mockWorkOrders = [
        {
          id: 'test-wo-1',
          status: 'running',
          taskPrompt: 'Test task 1',
          agentType: 'claude-code-subscription',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          runCount: 1,
        },
        {
          id: 'test-wo-2',
          status: 'queued',
          taskPrompt: 'Test task 2',
          agentType: 'claude-code-subscription',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          runCount: 0,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: mockWorkOrders,
            total: 2,
            limit: 20,
            offset: 0,
            hasMore: false,
          },
        }),
      });

      const command = createQueueCommand();
      const listCmd = command.commands.find((c) => c.name() === 'list');

      // Suppress console output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await listCmd!.parseAsync(['list'], { from: 'user' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/work-orders'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-api-key' },
        })
      );

      consoleSpy.mockRestore();
    });

    it('should apply status filter when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [],
            total: 0,
            limit: 20,
            offset: 0,
            hasMore: false,
          },
        }),
      });

      const command = createQueueCommand();
      const listCmd = command.commands.find((c) => c.name() === 'list');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await listCmd!.parseAsync(['list', '--status', 'failed'], { from: 'user' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('status=failed');

      consoleSpy.mockRestore();
    });

    it('should apply limit filter when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [],
            total: 0,
            limit: 10,
            offset: 0,
            hasMore: false,
          },
        }),
      });

      const command = createQueueCommand();
      const listCmd = command.commands.find((c) => c.name() === 'list');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await listCmd!.parseAsync(['list', '--limit', '10'], { from: 'user' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('limit=10');

      consoleSpy.mockRestore();
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal server error' } }),
      });

      const command = createQueueCommand();
      const listCmd = command.commands.find((c) => c.name() === 'list');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await listCmd!.parseAsync(['list'], { from: 'user' });

      expect(process.exitCode).toBe(1);

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('queue cancel', () => {
    it('should cancel a work order', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'test-wo-1',
            status: 'canceled',
            message: 'Work order canceled successfully',
            wasRunning: false,
          },
        }),
      });

      const command = createQueueCommand();
      const cancelCmd = command.commands.find((c) => c.name() === 'cancel');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await cancelCmd!.parseAsync(['cancel', 'test-wo-1'], { from: 'user' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/work-orders/test-wo-1',
        expect.objectContaining({
          method: 'DELETE',
          headers: { Authorization: 'Bearer test-api-key' },
        })
      );

      consoleSpy.mockRestore();
    });

    it('should indicate when a running work order was canceled', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'test-wo-1',
            status: 'canceled',
            message: 'Work order canceled successfully',
            wasRunning: true,
          },
        }),
      });

      const command = createQueueCommand();
      const cancelCmd = command.commands.find((c) => c.name() === 'cancel');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await cancelCmd!.parseAsync(['cancel', 'test-wo-1'], { from: 'user' });

      // Should output something about "was running"
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle cancel errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Work order not found' } }),
      });

      const command = createQueueCommand();
      const cancelCmd = command.commands.find((c) => c.name() === 'cancel');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await cancelCmd!.parseAsync(['cancel', 'non-existent'], { from: 'user' });

      expect(process.exitCode).toBe(1);

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('queue kill', () => {
    it('should kill a work order', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'test-wo-1',
            success: true,
            forcedKill: false,
            durationMs: 250,
            status: 'canceled',
            message: 'Work order agent process terminated gracefully',
          },
        }),
      });

      const command = createQueueCommand();
      const killCmd = command.commands.find((c) => c.name() === 'kill');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await killCmd!.parseAsync(['kill', 'test-wo-1'], { from: 'user' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/work-orders/test-wo-1/kill',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );

      consoleSpy.mockRestore();
    });

    it('should use immediate kill when --force flag is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'test-wo-1',
            success: true,
            forcedKill: true,
            durationMs: 50,
            status: 'canceled',
            message: 'Work order agent process force killed (SIGKILL)',
          },
        }),
      });

      const command = createQueueCommand();
      const killCmd = command.commands.find((c) => c.name() === 'kill');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await killCmd!.parseAsync(['kill', 'test-wo-1', '--force'], { from: 'user' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(fetchBody.immediate).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should handle kill failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'test-wo-1',
            success: false,
            forcedKill: false,
            durationMs: 0,
            status: 'running',
            message: 'Failed to kill work order',
            error: 'Process not found',
          },
        }),
      });

      const command = createQueueCommand();
      const killCmd = command.commands.find((c) => c.name() === 'kill');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await killCmd!.parseAsync(['kill', 'test-wo-1'], { from: 'user' });

      expect(process.exitCode).toBe(1);

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('queue health', () => {
    it('should fetch and display queue health', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            status: 'healthy',
            stats: {
              waiting: 2,
              running: 1,
              maxConcurrent: 3,
              averageWaitMs: 5000,
              maxQueueSize: 100,
              accepting: true,
            },
            utilization: 0.02,
            timestamp: new Date().toISOString(),
            indicators: {
              accepting: true,
              canStartImmediately: true,
              queueDepth: 2,
              runningCount: 1,
            },
          },
        }),
      });

      const command = createQueueCommand();
      const healthCmd = command.commands.find((c) => c.name() === 'health');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await healthCmd!.parseAsync(['health'], { from: 'user' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/queue/health',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-api-key' },
        })
      );

      consoleSpy.mockRestore();
    });

    it('should output JSON when --json flag is provided', async () => {
      const healthData = {
        status: 'healthy',
        stats: {
          waiting: 0,
          running: 0,
          maxConcurrent: 2,
          averageWaitMs: 0,
          maxQueueSize: 100,
          accepting: true,
        },
        utilization: 0,
        timestamp: new Date().toISOString(),
        indicators: {
          accepting: true,
          canStartImmediately: true,
          queueDepth: 0,
          runningCount: 0,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: healthData,
        }),
      });

      const command = createQueueCommand();
      const healthCmd = command.commands.find((c) => c.name() === 'health');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await healthCmd!.parseAsync(['health', '--json'], { from: 'user' });

      // Check that JSON was output
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(output)).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('should handle health check errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'Service unavailable' } }),
      });

      const command = createQueueCommand();
      const healthCmd = command.commands.find((c) => c.name() === 'health');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await healthCmd!.parseAsync(['health'], { from: 'user' });

      expect(process.exitCode).toBe(1);

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('queue purge', () => {
    it('should require either ID or --status option', async () => {
      const command = createQueueCommand();
      const purgeCmd = command.commands.find((c) => c.name() === 'purge');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await purgeCmd!.parseAsync(['purge', '--yes'], { from: 'user' });

      expect(process.exitCode).toBe(1);

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should purge work orders by status', async () => {
      // First call: count by status
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [
              { id: 'wo-1', status: 'failed' },
              { id: 'wo-2', status: 'failed' },
            ],
            total: 2,
            limit: 1000,
            offset: 0,
            hasMore: false,
          },
        }),
      });

      // Second call: actual purge
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            deletedCount: 2,
            deletedIds: ['wo-1', 'wo-2'],
          },
        }),
      });

      const command = createQueueCommand();
      const purgeCmd = command.commands.find((c) => c.name() === 'purge');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await purgeCmd!.parseAsync(['purge', '--status', 'failed', '--yes'], { from: 'user' });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });

    it('should report when no work orders match the status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [],
            total: 0,
            limit: 1000,
            offset: 0,
            hasMore: false,
          },
        }),
      });

      const command = createQueueCommand();
      const purgeCmd = command.commands.find((c) => c.name() === 'purge');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await purgeCmd!.parseAsync(['purge', '--status', 'failed', '--yes'], { from: 'user' });

      // Should indicate no work orders found
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('API key requirement', () => {
    it('should fail when AGENTGATE_API_KEY is not set', async () => {
      delete process.env['AGENTGATE_API_KEY'];

      const command = createQueueCommand();
      const listCmd = command.commands.find((c) => c.name() === 'list');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock process.exit to prevent actually exiting
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(listCmd!.parseAsync(['list'], { from: 'user' })).rejects.toThrow(
        'process.exit called'
      );

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe('default API URL', () => {
    it('should use default URL when AGENTGATE_API_URL is not set', async () => {
      delete process.env['AGENTGATE_API_URL'];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [],
            total: 0,
            limit: 20,
            offset: 0,
            hasMore: false,
          },
        }),
      });

      const command = createQueueCommand();
      const listCmd = command.commands.find((c) => c.name() === 'list');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await listCmd!.parseAsync(['list'], { from: 'user' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:3001'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });
  });
});
