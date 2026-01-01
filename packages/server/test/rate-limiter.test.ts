/**
 * Rate Limiter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RateLimiter,
  createRateLimiter,
} from '../src/server/websocket/rate-limiter.js';
import type { ServerMessage, AgentOutputEvent, RunFailedEvent } from '../src/server/websocket/types.js';

/**
 * Helper to wait for a specified duration
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock agent output event
 */
function createOutputEvent(content: string, workOrderId = 'wo-1', runId = 'run-1'): AgentOutputEvent {
  return {
    type: 'agent_output',
    workOrderId,
    runId,
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a mock run failed event
 */
function createRunFailedEvent(workOrderId = 'wo-1', runId = 'run-1'): RunFailedEvent {
  return {
    type: 'run_failed',
    workOrderId,
    runId,
    error: 'Test error',
    timestamp: new Date().toISOString(),
  };
}

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  afterEach(() => {
    if (limiter) {
      limiter.stop();
    }
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create limiter with default options', () => {
      limiter = new RateLimiter();

      expect(limiter).toBeDefined();
      expect(limiter.getQueueSize()).toBe(0);
    });

    it('should create limiter with custom options', () => {
      limiter = new RateLimiter({
        maxEventsPerSecond: 100,
        batchWindowMs: 50,
        priorityEnabled: false,
      });

      expect(limiter).toBeDefined();
    });
  });

  describe('submit', () => {
    it('should pass events under rate limit', async () => {
      vi.useRealTimers();

      const batches: ServerMessage[][] = [];
      limiter = new RateLimiter({ maxEventsPerSecond: 100 });
      limiter.onBatch(batch => batches.push(batch));

      for (let i = 0; i < 10; i++) {
        limiter.submit(createOutputEvent(`message ${i}`));
      }

      await wait(200);
      limiter.flush();

      // Events may be combined, but content should be preserved
      const allContent = batches.flat()
        .filter(e => e.type === 'agent_output')
        .map(e => (e as { content: string }).content)
        .join('');

      // All 10 messages should be in the content
      for (let i = 0; i < 10; i++) {
        expect(allContent).toContain(`message ${i}`);
      }
    });

    it('should handle stopped limiter', () => {
      limiter = new RateLimiter();
      limiter.stop();

      // Should not throw
      limiter.submit(createOutputEvent('test'));

      expect(limiter.getQueueSize()).toBe(0);
    });
  });

  describe('priority handling', () => {
    it('should immediately send critical events', async () => {
      vi.useRealTimers();

      const batches: ServerMessage[][] = [];
      limiter = new RateLimiter({ maxEventsPerSecond: 5 });
      limiter.onBatch(batch => batches.push(batch));

      // Fill up the rate limit with low priority
      for (let i = 0; i < 100; i++) {
        limiter.submit(createOutputEvent(`output ${i}`));
      }

      // Submit critical event
      limiter.submit(createRunFailedEvent());

      await wait(50);

      // Critical event should be in first batch
      const allEvents = batches.flat();
      const criticalEvent = allEvents.find(e => e.type === 'run_failed');
      expect(criticalEvent).toBeDefined();
    });

    it('should prioritize high priority events', async () => {
      vi.useRealTimers();

      const batches: ServerMessage[][] = [];
      limiter = new RateLimiter({
        maxEventsPerSecond: 10,
        batchWindowMs: 50,
      });
      limiter.onBatch(batch => batches.push(batch));

      // Submit many low priority events
      for (let i = 0; i < 50; i++) {
        limiter.submit(createOutputEvent(`output ${i}`));
      }

      // Submit high priority event
      limiter.submit({
        type: 'agent_tool_call',
        workOrderId: 'wo-1',
        runId: 'run-1',
        toolUseId: 'toolu-1',
        tool: 'Read',
        input: {},
        timestamp: new Date().toISOString(),
      } as ServerMessage);

      await wait(500);
      limiter.flush();

      // Tool call should appear relatively early
      const allEvents = batches.flat();
      const toolCallIndex = allEvents.findIndex(e => e.type === 'agent_tool_call');
      expect(toolCallIndex).toBeLessThan(20);
    });

    it('should respect priorityEnabled: false', async () => {
      vi.useRealTimers();

      const batches: ServerMessage[][] = [];
      limiter = new RateLimiter({
        maxEventsPerSecond: 100,
        priorityEnabled: false,
      });
      limiter.onBatch(batch => batches.push(batch));

      limiter.submit(createOutputEvent('test'));
      await wait(200);
      limiter.flush();

      expect(batches.flat().length).toBe(1);
    });
  });

  describe('flush', () => {
    it('should flush all pending events', async () => {
      vi.useRealTimers();

      const batches: ServerMessage[][] = [];
      limiter = new RateLimiter({ maxEventsPerSecond: 5 });
      limiter.onBatch(batch => batches.push(batch));

      // Submit many events
      for (let i = 0; i < 20; i++) {
        limiter.submit(createOutputEvent(`message ${i}`));
      }

      limiter.flush();

      // Events may be combined, but all content should be delivered
      const allContent = batches.flat()
        .filter(e => e.type === 'agent_output')
        .map(e => (e as { content: string }).content)
        .join('');

      for (let i = 0; i < 20; i++) {
        expect(allContent).toContain(`message ${i}`);
      }
    });

    it('should handle flush with empty queue', () => {
      const batches: ServerMessage[][] = [];
      limiter = new RateLimiter();
      limiter.onBatch(batch => batches.push(batch));

      // Should not throw
      limiter.flush();

      expect(batches.length).toBe(0);
    });
  });

  describe('stop', () => {
    it('should stop and flush remaining events', async () => {
      vi.useRealTimers();

      const batches: ServerMessage[][] = [];
      limiter = new RateLimiter({ maxEventsPerSecond: 5 });
      limiter.onBatch(batch => batches.push(batch));

      for (let i = 0; i < 10; i++) {
        limiter.submit(createOutputEvent(`message ${i}`));
      }

      limiter.stop();

      // All events should be flushed (may be combined)
      const allContent = batches.flat()
        .filter(e => e.type === 'agent_output')
        .map(e => (e as { content: string }).content)
        .join('');

      for (let i = 0; i < 10; i++) {
        expect(allContent).toContain(`message ${i}`);
      }
    });
  });

  describe('output event combining', () => {
    it('should combine consecutive output events', async () => {
      vi.useRealTimers();

      const batches: ServerMessage[][] = [];
      limiter = new RateLimiter({
        maxEventsPerSecond: 100,
        batchWindowMs: 100,
      });
      limiter.onBatch(batch => batches.push(batch));

      // Submit multiple output events
      limiter.submit(createOutputEvent('part 1 '));
      limiter.submit(createOutputEvent('part 2 '));
      limiter.submit(createOutputEvent('part 3'));

      await wait(200);
      limiter.flush();

      // Should have combined into fewer events
      const outputEvents = batches.flat().filter(e => e.type === 'agent_output');
      const combinedContent = outputEvents.map(e => (e as AgentOutputEvent).content).join('');
      expect(combinedContent).toBe('part 1 part 2 part 3');
    });

    it('should not combine output events from different contexts', async () => {
      vi.useRealTimers();

      const batches: ServerMessage[][] = [];
      limiter = new RateLimiter({ maxEventsPerSecond: 100 });
      limiter.onBatch(batch => batches.push(batch));

      // Submit outputs from different work orders
      limiter.submit(createOutputEvent('wo1 content', 'wo-1', 'run-1'));
      limiter.submit(createOutputEvent('wo2 content', 'wo-2', 'run-2'));

      await wait(200);
      limiter.flush();

      const outputEvents = batches.flat().filter(e => e.type === 'agent_output');
      expect(outputEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getQueueSize', () => {
    it('should track queue size', async () => {
      vi.useRealTimers();

      limiter = new RateLimiter({ maxEventsPerSecond: 1 });

      expect(limiter.getQueueSize()).toBe(0);

      // Submit more events than rate allows
      for (let i = 0; i < 10; i++) {
        limiter.submit(createOutputEvent(`message ${i}`));
      }

      // Some should be queued
      expect(limiter.getQueueSize()).toBeGreaterThan(0);
    });
  });

  describe('getAvailableTokens', () => {
    it('should track available tokens', async () => {
      vi.useRealTimers();

      limiter = new RateLimiter({ maxEventsPerSecond: 10 });

      const initialTokens = limiter.getAvailableTokens();
      expect(initialTokens).toBe(10);

      // Submit some events
      for (let i = 0; i < 5; i++) {
        limiter.submit(createOutputEvent(`message ${i}`));
      }

      const remainingTokens = limiter.getAvailableTokens();
      expect(remainingTokens).toBeLessThan(initialTokens);
    });

    it('should refill tokens over time', async () => {
      vi.useRealTimers();

      limiter = new RateLimiter({ maxEventsPerSecond: 10 });

      // Use up some tokens
      for (let i = 0; i < 5; i++) {
        limiter.submit(createOutputEvent(`message ${i}`));
      }

      const tokensAfterSubmit = limiter.getAvailableTokens();

      // Wait for refill
      await wait(500);

      const tokensAfterWait = limiter.getAvailableTokens();
      expect(tokensAfterWait).toBeGreaterThan(tokensAfterSubmit);
    });
  });

  describe('queue limits', () => {
    it('should limit queue size to prevent memory issues', async () => {
      vi.useRealTimers();

      limiter = new RateLimiter({ maxEventsPerSecond: 1 });

      // Submit many more events than queue limit
      for (let i = 0; i < 100; i++) {
        limiter.submit(createOutputEvent(`message ${i}`));
      }

      // Queue should be capped (10 * maxEventsPerSecond = 10)
      expect(limiter.getQueueSize()).toBeLessThanOrEqual(10);
    });
  });

  describe('onBatch', () => {
    it('should register multiple callbacks', async () => {
      vi.useRealTimers();

      const batches1: ServerMessage[][] = [];
      const batches2: ServerMessage[][] = [];

      limiter = new RateLimiter({ maxEventsPerSecond: 100 });
      limiter.onBatch(batch => batches1.push(batch));
      limiter.onBatch(batch => batches2.push(batch));

      limiter.submit(createOutputEvent('test'));
      await wait(200);
      limiter.flush();

      expect(batches1.flat().length).toBe(1);
      expect(batches2.flat().length).toBe(1);
    });

    it('should handle callback errors gracefully', async () => {
      vi.useRealTimers();

      const batches: ServerMessage[][] = [];

      limiter = new RateLimiter({ maxEventsPerSecond: 100 });
      limiter.onBatch(() => {
        throw new Error('Callback error');
      });
      limiter.onBatch(batch => batches.push(batch));

      limiter.submit(createOutputEvent('test'));
      await wait(200);
      limiter.flush();

      // Second callback should still receive events
      expect(batches.flat().length).toBe(1);
    });
  });
});

describe('createRateLimiter', () => {
  it('should create limiter via factory', () => {
    const limiter = createRateLimiter();

    expect(limiter).toBeInstanceOf(RateLimiter);

    limiter.stop();
  });

  it('should pass options to limiter', () => {
    const limiter = createRateLimiter({
      maxEventsPerSecond: 25,
    });

    expect(limiter).toBeInstanceOf(RateLimiter);
    expect(limiter.getAvailableTokens()).toBe(25);

    limiter.stop();
  });
});
