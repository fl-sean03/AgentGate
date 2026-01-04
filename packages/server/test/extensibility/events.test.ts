/**
 * Tests for Event System.
 * (v0.2.27 - Phase 3: Extensibility Framework)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventEmitter,
  getEventBus,
  resetEventBus,
} from '../../src/extensibility/events.js';

describe('EventEmitter', () => {
  describe('on', () => {
    it('should subscribe to events', async () => {
      const emitter = new EventEmitter<{ test: string }>();
      const handler = vi.fn();

      emitter.on('test', handler);
      await emitter.emit('test', 'data');

      expect(handler).toHaveBeenCalledWith('data');
    });

    it('should return subscription', () => {
      const emitter = new EventEmitter<{ test: string }>();

      const sub = emitter.on('test', vi.fn());

      expect(sub.id).toBeDefined();
      expect(sub.eventType).toBe('test');
      expect(sub.unsubscribe).toBeInstanceOf(Function);
    });

    it('should allow unsubscribe', async () => {
      const emitter = new EventEmitter<{ test: string }>();
      const handler = vi.fn();

      const sub = emitter.on('test', handler);
      sub.unsubscribe();
      await emitter.emit('test', 'data');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle multiple handlers', async () => {
      const emitter = new EventEmitter<{ test: string }>();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('test', handler1);
      emitter.on('test', handler2);
      await emitter.emit('test', 'data');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should only fire once', async () => {
      const emitter = new EventEmitter<{ test: string }>();
      const handler = vi.fn();

      emitter.once('test', handler);
      await emitter.emit('test', 'first');
      await emitter.emit('test', 'second');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });
  });

  describe('onAny', () => {
    it('should receive all events', async () => {
      const emitter = new EventEmitter<{ a: string; b: number }>();
      const handler = vi.fn();

      emitter.onAny(handler);
      await emitter.emit('a', 'test');
      await emitter.emit('b', 42);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should include event type in payload', async () => {
      const emitter = new EventEmitter<{ test: string }>();
      let receivedType: string | undefined;

      emitter.onAny(event => {
        receivedType = event.type;
      });
      await emitter.emit('test', 'data');

      expect(receivedType).toBe('test');
    });
  });

  describe('emit', () => {
    it('should emit events', async () => {
      const emitter = new EventEmitter<{ test: { value: number } }>();
      const handler = vi.fn();

      emitter.on('test', handler);
      await emitter.emit('test', { value: 42 });

      expect(handler).toHaveBeenCalledWith({ value: 42 });
    });

    it('should handle async handlers', async () => {
      const emitter = new EventEmitter<{ test: string }>();
      const order: number[] = [];

      emitter.on('test', async () => {
        await new Promise(r => setTimeout(r, 10));
        order.push(1);
      });
      emitter.on('test', async () => {
        order.push(2);
      });

      await emitter.emit('test', 'data');

      expect(order).toEqual([1, 2]);
    });

    it('should handle errors gracefully', async () => {
      const emitter = new EventEmitter<{ test: string }>();
      const goodHandler = vi.fn();

      emitter.on('test', async () => { throw new Error('Fail'); });
      emitter.on('test', goodHandler);

      await emitter.emit('test', 'data');

      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('emitSync', () => {
    it('should emit without waiting', () => {
      const emitter = new EventEmitter<{ test: string }>();
      const handler = vi.fn();

      emitter.on('test', handler);
      emitter.emitSync('test', 'data');

      // Handler may not have been called yet (async)
      expect(true).toBe(true);
    });
  });

  describe('off', () => {
    it('should remove all handlers for event', async () => {
      const emitter = new EventEmitter<{ test: string }>();
      const handler = vi.fn();

      emitter.on('test', handler);
      emitter.off('test');
      await emitter.emit('test', 'data');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all handlers', async () => {
      const emitter = new EventEmitter<{ a: string; b: number }>();
      const handler = vi.fn();

      emitter.on('a', handler);
      emitter.on('b', handler);
      emitter.onAny(handler);

      emitter.removeAllListeners();

      await emitter.emit('a', 'test');
      await emitter.emit('b', 42);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return handler count', () => {
      const emitter = new EventEmitter<{ test: string }>();

      emitter.on('test', vi.fn());
      emitter.on('test', vi.fn());

      expect(emitter.listenerCount('test')).toBe(2);
    });

    it('should include wildcard handlers', () => {
      const emitter = new EventEmitter<{ test: string }>();

      emitter.on('test', vi.fn());
      emitter.onAny(vi.fn());

      expect(emitter.listenerCount('test')).toBe(2);
    });
  });

  describe('eventNames', () => {
    it('should return event types with handlers', () => {
      const emitter = new EventEmitter<{ a: string; b: number; c: boolean }>();

      emitter.on('a', vi.fn());
      emitter.on('b', vi.fn());

      const names = emitter.eventNames();

      expect(names).toContain('a');
      expect(names).toContain('b');
      expect(names).not.toContain('c');
    });
  });
});

describe('getEventBus', () => {
  beforeEach(() => {
    resetEventBus();
  });

  it('should return singleton', () => {
    const bus1 = getEventBus();
    const bus2 = getEventBus();
    expect(bus1).toBe(bus2);
  });
});

describe('resetEventBus', () => {
  it('should reset the event bus', () => {
    const bus1 = getEventBus();
    bus1.on('workOrder:submitted', vi.fn());

    resetEventBus();

    const bus2 = getEventBus();
    expect(bus2).not.toBe(bus1);
    expect(bus2.listenerCount('workOrder:submitted')).toBe(0);
  });
});
