import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuditLog } from '../../../src/queue/audit-log.js';

describe('AuditLog', () => {
  let auditLog: AuditLog;

  beforeEach(() => {
    auditLog = new AuditLog({ logToConsole: false });
  });

  describe('record', () => {
    it('should create audit event with unique id', () => {
      const event1 = auditLog.record('wo-1', 'started');
      const event2 = auditLog.record('wo-1', 'completed');

      expect(event1.id).toBeDefined();
      expect(event2.id).toBeDefined();
      expect(event1.id).not.toBe(event2.id);
    });

    it('should record event with correct fields', () => {
      const event = auditLog.record('wo-123', 'started', { key: 'value' });

      expect(event.workOrderId).toBe('wo-123');
      expect(event.eventType).toBe('started');
      expect(event.details).toEqual({ key: 'value' });
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should capture full error details (issue #67 fix)', () => {
      const error = new Error('Something went wrong');
      error.stack = 'Error: Something went wrong\n    at test.js:1';

      const event = auditLog.record('wo-1', 'failed', {
        error: error.message,
        errorName: error.name,
        errorStack: error.stack,
        exitCode: -1,
      });

      expect(event.details['error']).toBe('Something went wrong');
      expect(event.details['errorName']).toBe('Error');
      expect(event.details['errorStack']).toContain('at test.js:1');
      expect(event.details['exitCode']).toBe(-1);
    });

    it('should default to empty details', () => {
      const event = auditLog.record('wo-1', 'started');

      expect(event.details).toEqual({});
    });
  });

  describe('query', () => {
    beforeEach(() => {
      auditLog.record('wo-1', 'started');
      auditLog.record('wo-1', 'running');
      auditLog.record('wo-2', 'started');
      auditLog.record('wo-1', 'completed');
      auditLog.record('wo-2', 'failed');
    });

    it('should return all events when no options', () => {
      const events = auditLog.query();
      expect(events).toHaveLength(5);
    });

    it('should filter by workOrderId', () => {
      const events = auditLog.query({ workOrderId: 'wo-1' });

      expect(events).toHaveLength(3);
      events.forEach(e => expect(e.workOrderId).toBe('wo-1'));
    });

    it('should filter by eventType', () => {
      const events = auditLog.query({ eventType: 'started' });

      expect(events).toHaveLength(2);
      events.forEach(e => expect(e.eventType).toBe('started'));
    });

    it('should filter by workOrderId and eventType', () => {
      const events = auditLog.query({
        workOrderId: 'wo-1',
        eventType: 'started',
      });

      expect(events).toHaveLength(1);
      expect(events[0]?.workOrderId).toBe('wo-1');
      expect(events[0]?.eventType).toBe('started');
    });

    it('should filter by time range', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000);

      // Record with timestamp after 'now'
      auditLog.clear();
      vi.useFakeTimers();
      vi.setSystemTime(past);
      auditLog.record('wo-1', 'old');
      vi.setSystemTime(now);
      auditLog.record('wo-1', 'new');
      vi.useRealTimers();

      const events = auditLog.query({ since: now });
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('new');
    });

    it('should apply limit', () => {
      const events = auditLog.query({ limit: 2 });

      expect(events).toHaveLength(2);
      // Should return last 2 events
      expect(events[0]?.eventType).toBe('completed');
      expect(events[1]?.eventType).toBe('failed');
    });

    it('should return empty array for non-existent workOrderId', () => {
      const events = auditLog.query({ workOrderId: 'non-existent' });
      expect(events).toHaveLength(0);
    });
  });

  describe('getWorkOrderTimeline', () => {
    it('should return events for specific work order in order', () => {
      auditLog.record('wo-1', 'started');
      auditLog.record('wo-2', 'started');
      auditLog.record('wo-1', 'running');
      auditLog.record('wo-1', 'completed');

      const timeline = auditLog.getWorkOrderTimeline('wo-1');

      expect(timeline).toHaveLength(3);
      expect(timeline[0]?.eventType).toBe('started');
      expect(timeline[1]?.eventType).toBe('running');
      expect(timeline[2]?.eventType).toBe('completed');
    });

    it('should return empty array for non-existent work order', () => {
      auditLog.record('wo-1', 'started');

      const timeline = auditLog.getWorkOrderTimeline('non-existent');
      expect(timeline).toHaveLength(0);
    });

    it('should return copy, not reference', () => {
      auditLog.record('wo-1', 'started');
      const timeline1 = auditLog.getWorkOrderTimeline('wo-1');
      const timeline2 = auditLog.getWorkOrderTimeline('wo-1');

      expect(timeline1).not.toBe(timeline2);
      expect(timeline1).toEqual(timeline2);
    });
  });

  describe('getRecentEvents', () => {
    beforeEach(() => {
      for (let i = 0; i < 10; i++) {
        auditLog.record(`wo-${i}`, 'event');
      }
    });

    it('should return last N events', () => {
      const events = auditLog.getRecentEvents(3);

      expect(events).toHaveLength(3);
      expect(events[0]?.workOrderId).toBe('wo-7');
      expect(events[1]?.workOrderId).toBe('wo-8');
      expect(events[2]?.workOrderId).toBe('wo-9');
    });

    it('should default to 100 events', () => {
      const events = auditLog.getRecentEvents();
      expect(events).toHaveLength(10); // Only 10 recorded
    });

    it('should handle count larger than events', () => {
      const events = auditLog.getRecentEvents(1000);
      expect(events).toHaveLength(10);
    });
  });

  describe('getEventCount', () => {
    it('should return 0 for empty log', () => {
      expect(auditLog.getEventCount()).toBe(0);
    });

    it('should return correct count', () => {
      auditLog.record('wo-1', 'event1');
      auditLog.record('wo-1', 'event2');
      auditLog.record('wo-2', 'event1');

      expect(auditLog.getEventCount()).toBe(3);
    });
  });

  describe('clear', () => {
    it('should remove all events', () => {
      auditLog.record('wo-1', 'event1');
      auditLog.record('wo-2', 'event2');

      auditLog.clear();

      expect(auditLog.getEventCount()).toBe(0);
      expect(auditLog.query()).toHaveLength(0);
    });

    it('should clear per-work-order index', () => {
      auditLog.record('wo-1', 'event1');
      auditLog.clear();

      expect(auditLog.getWorkOrderTimeline('wo-1')).toHaveLength(0);
    });
  });

  describe('maxEvents limit', () => {
    it('should enforce max events limit', () => {
      const limitedLog = new AuditLog({ maxEvents: 5, logToConsole: false });

      for (let i = 0; i < 10; i++) {
        limitedLog.record(`wo-${i}`, 'event');
      }

      expect(limitedLog.getEventCount()).toBe(5);
      // Should keep most recent events
      const events = limitedLog.getRecentEvents(5);
      expect(events[0]?.workOrderId).toBe('wo-5');
      expect(events[4]?.workOrderId).toBe('wo-9');
    });

    it('should update per-work-order index when events are removed', () => {
      const limitedLog = new AuditLog({ maxEvents: 3, logToConsole: false });

      limitedLog.record('wo-1', 'old');
      limitedLog.record('wo-2', 'event');
      limitedLog.record('wo-3', 'event');
      limitedLog.record('wo-4', 'event'); // This should push out wo-1's event

      const timeline = limitedLog.getWorkOrderTimeline('wo-1');
      expect(timeline).toHaveLength(0);
    });
  });

  describe('logging', () => {
    it('should not throw when logToConsole is true', () => {
      const loggingLog = new AuditLog({ logToConsole: true });

      expect(() => {
        loggingLog.record('wo-1', 'started', { key: 'value' });
      }).not.toThrow();
    });
  });
});
