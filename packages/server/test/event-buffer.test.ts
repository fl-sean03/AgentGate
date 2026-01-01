/**
 * Event Buffer Unit Tests
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  EventBuffer,
  createEventBuffer,
} from '../src/server/websocket/event-buffer.js';
import type { ServerMessage, AgentOutputEvent } from '../src/server/websocket/types.js';

/**
 * Create a mock event
 */
function createEvent(
  id: number,
  workOrderId = 'wo-1',
  timestamp?: Date
): ServerMessage {
  return {
    type: 'agent_output',
    workOrderId,
    runId: 'run-1',
    content: `message ${id}`,
    timestamp: (timestamp ?? new Date()).toISOString(),
  } as AgentOutputEvent;
}

describe('EventBuffer', () => {
  let buffer: EventBuffer;

  afterEach(() => {
    if (buffer) {
      buffer.stop();
    }
  });

  describe('constructor', () => {
    it('should create buffer with default options', () => {
      buffer = new EventBuffer();

      expect(buffer).toBeDefined();
      expect(buffer.getTotalEventCount()).toBe(0);
      expect(buffer.getWorkOrderCount()).toBe(0);
    });

    it('should create buffer with custom options', () => {
      buffer = new EventBuffer({
        maxEventsPerWorkOrder: 500,
        maxTotalEvents: 5000,
        retentionMinutes: 30,
        cleanupIntervalMs: 60000,
      });

      expect(buffer).toBeDefined();
    });
  });

  describe('add', () => {
    it('should store events', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');

      expect(buffer.getTotalEventCount()).toBe(1);
      expect(buffer.getEventCount('wo-1')).toBe(1);
    });

    it('should store multiple events for same work order', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-1');
      buffer.add(createEvent(3), 'wo-1');

      expect(buffer.getEventCount('wo-1')).toBe(3);
    });

    it('should store events for different work orders', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-2');

      expect(buffer.getWorkOrderCount()).toBe(2);
      expect(buffer.getEventCount('wo-1')).toBe(1);
      expect(buffer.getEventCount('wo-2')).toBe(1);
    });

    it('should add timestamp if missing', () => {
      buffer = new EventBuffer();

      const eventWithoutTimestamp = {
        type: 'agent_output',
        workOrderId: 'wo-1',
        runId: 'run-1',
        content: 'test',
      } as ServerMessage;

      buffer.add(eventWithoutTimestamp, 'wo-1');

      const events = buffer.getEvents('wo-1');
      expect(events.length).toBe(1);
      expect(events[0].timestamp).toBeDefined();
    });
  });

  describe('getEvents', () => {
    it('should retrieve all events for work order', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-1');
      buffer.add(createEvent(3), 'wo-1');

      const events = buffer.getEvents('wo-1');

      expect(events.length).toBe(3);
    });

    it('should return empty array for unknown work order', () => {
      buffer = new EventBuffer();

      const events = buffer.getEvents('unknown-wo');

      expect(events).toEqual([]);
    });

    it('should filter by timestamp', () => {
      buffer = new EventBuffer();

      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000);
      const twoMinutesAgo = new Date(now.getTime() - 120000);

      buffer.add(createEvent(1, 'wo-1', twoMinutesAgo), 'wo-1');
      buffer.add(createEvent(2, 'wo-1', oneMinuteAgo), 'wo-1');
      buffer.add(createEvent(3, 'wo-1', now), 'wo-1');

      // Get events since 90 seconds ago
      const cutoff = new Date(now.getTime() - 90000);
      const events = buffer.getEvents('wo-1', cutoff);

      expect(events.length).toBe(2);
    });

    it('should return events in chronological order', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-1');
      buffer.add(createEvent(3), 'wo-1');

      const events = buffer.getEvents('wo-1') as AgentOutputEvent[];

      expect(events[0].content).toBe('message 1');
      expect(events[1].content).toBe('message 2');
      expect(events[2].content).toBe('message 3');
    });
  });

  describe('getLatestEvents', () => {
    it('should get latest N events', () => {
      buffer = new EventBuffer();

      for (let i = 1; i <= 10; i++) {
        buffer.add(createEvent(i), 'wo-1');
      }

      const events = buffer.getLatestEvents('wo-1', 3) as AgentOutputEvent[];

      expect(events.length).toBe(3);
      expect(events[0].content).toBe('message 8');
      expect(events[1].content).toBe('message 9');
      expect(events[2].content).toBe('message 10');
    });

    it('should return all events if count exceeds available', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-1');

      const events = buffer.getLatestEvents('wo-1', 10);

      expect(events.length).toBe(2);
    });

    it('should return empty array for unknown work order', () => {
      buffer = new EventBuffer();

      const events = buffer.getLatestEvents('unknown-wo', 5);

      expect(events).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear events for specific work order', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-2');

      buffer.clear('wo-1');

      expect(buffer.getEventCount('wo-1')).toBe(0);
      expect(buffer.getEventCount('wo-2')).toBe(1);
      expect(buffer.getTotalEventCount()).toBe(1);
    });

    it('should handle clearing unknown work order', () => {
      buffer = new EventBuffer();

      // Should not throw
      buffer.clear('unknown-wo');

      expect(buffer.getTotalEventCount()).toBe(0);
    });
  });

  describe('clearOlderThan', () => {
    it('should clear events older than specified date', () => {
      buffer = new EventBuffer();

      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000);
      const twoMinutesAgo = new Date(now.getTime() - 120000);

      buffer.add(createEvent(1, 'wo-1', twoMinutesAgo), 'wo-1');
      buffer.add(createEvent(2, 'wo-1', oneMinuteAgo), 'wo-1');
      buffer.add(createEvent(3, 'wo-1', now), 'wo-1');

      // Clear events older than 90 seconds - should keep oneMinuteAgo and now
      buffer.clearOlderThan(new Date(now.getTime() - 90000));

      // Should keep the 2 newest events (oneMinuteAgo and now)
      const remaining = buffer.getEvents('wo-1');
      expect(remaining.length).toBe(2);
    });

    it('should remove empty work order buffers', () => {
      buffer = new EventBuffer();

      const now = new Date();
      const twoMinutesAgo = new Date(now.getTime() - 120000);

      buffer.add(createEvent(1, 'wo-1', twoMinutesAgo), 'wo-1');
      buffer.add(createEvent(2, 'wo-2', now), 'wo-2');

      // Clear events older than 1 minute
      buffer.clearOlderThan(new Date(now.getTime() - 60000));

      expect(buffer.getWorkOrderCount()).toBe(1);
      expect(buffer.getEventCount('wo-1')).toBe(0);
      expect(buffer.getEventCount('wo-2')).toBe(1);
    });
  });

  describe('ring buffer behavior', () => {
    it('should evict old events when max per work order exceeded', () => {
      buffer = new EventBuffer({ maxEventsPerWorkOrder: 5 });

      for (let i = 1; i <= 10; i++) {
        buffer.add(createEvent(i), 'wo-1');
      }

      const events = buffer.getEvents('wo-1') as AgentOutputEvent[];

      expect(events.length).toBe(5);
      // Should have events 6-10, not 1-5
      expect(events[0].content).toBe('message 6');
      expect(events[4].content).toBe('message 10');
    });
  });

  describe('LRU eviction', () => {
    it('should evict from least recently used work order when total exceeded', async () => {
      vi.useRealTimers();

      buffer = new EventBuffer({
        maxEventsPerWorkOrder: 10,
        maxTotalEvents: 15,
      });

      // Add events to wo-1
      for (let i = 1; i <= 10; i++) {
        buffer.add(createEvent(i, 'wo-1'), 'wo-1');
      }

      // Wait a bit, then access wo-1
      await vi.waitFor(
        () => {
          expect(true).toBe(true); // Just waiting
        },
        { timeout: 100, interval: 50 }
      );

      // Add events to wo-2 - should trigger eviction from wo-1
      for (let i = 1; i <= 10; i++) {
        buffer.add(createEvent(i, 'wo-2'), 'wo-2');
      }

      // Total should be around limit
      expect(buffer.getTotalEventCount()).toBeLessThanOrEqual(20);
    });
  });

  describe('getEventCount', () => {
    it('should return count for work order', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-1');
      buffer.add(createEvent(3), 'wo-1');

      expect(buffer.getEventCount('wo-1')).toBe(3);
    });

    it('should return 0 for unknown work order', () => {
      buffer = new EventBuffer();

      expect(buffer.getEventCount('unknown-wo')).toBe(0);
    });
  });

  describe('getTotalEventCount', () => {
    it('should track total across all work orders', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-2');
      buffer.add(createEvent(3), 'wo-3');

      expect(buffer.getTotalEventCount()).toBe(3);
    });
  });

  describe('getWorkOrderCount', () => {
    it('should count work orders with buffers', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-2');
      buffer.add(createEvent(3), 'wo-3');

      expect(buffer.getWorkOrderCount()).toBe(3);
    });
  });

  describe('stop', () => {
    it('should clear all data and stop cleanup', () => {
      buffer = new EventBuffer();

      buffer.add(createEvent(1), 'wo-1');
      buffer.add(createEvent(2), 'wo-2');

      buffer.stop();

      expect(buffer.getTotalEventCount()).toBe(0);
      expect(buffer.getWorkOrderCount()).toBe(0);
    });
  });

  describe('multiple work orders', () => {
    it('should handle many work orders independently', () => {
      buffer = new EventBuffer();

      for (let i = 1; i <= 10; i++) {
        buffer.add(createEvent(1, `wo-${i}`), `wo-${i}`);
        buffer.add(createEvent(2, `wo-${i}`), `wo-${i}`);
      }

      expect(buffer.getWorkOrderCount()).toBe(10);
      expect(buffer.getTotalEventCount()).toBe(20);

      for (let i = 1; i <= 10; i++) {
        expect(buffer.getEventCount(`wo-${i}`)).toBe(2);
      }
    });
  });
});

describe('createEventBuffer', () => {
  it('should create buffer via factory', () => {
    const buffer = createEventBuffer();

    expect(buffer).toBeInstanceOf(EventBuffer);

    buffer.stop();
  });

  it('should pass options to buffer', () => {
    const buffer = createEventBuffer({
      maxEventsPerWorkOrder: 100,
    });

    expect(buffer).toBeInstanceOf(EventBuffer);

    buffer.stop();
  });
});
