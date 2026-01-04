/**
 * Tests for Hook System.
 * (v0.2.27 - Phase 3: Extensibility Framework)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HookRegistry,
  HookManager,
  getHookManager,
  registerHook,
} from '../../src/extensibility/hooks.js';

describe('HookRegistry', () => {
  describe('register', () => {
    it('should register a hook', () => {
      const registry = new HookRegistry('test');
      const handler = vi.fn();

      registry.register('my-hook', handler);

      const hooks = registry.getHooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0]?.name).toBe('my-hook');
    });

    it('should register with priority and timing', () => {
      const registry = new HookRegistry('test');

      registry.register('hook1', vi.fn(), { priority: 100, timing: 'before' });

      const hooks = registry.getHooks();
      expect(hooks[0]?.priority).toBe(100);
      expect(hooks[0]?.timing).toBe('before');
    });
  });

  describe('unregister', () => {
    it('should unregister a hook', () => {
      const registry = new HookRegistry('test');
      registry.register('my-hook', vi.fn());

      const result = registry.unregister('my-hook');

      expect(result).toBe(true);
      expect(registry.getHooks()).toHaveLength(0);
    });

    it('should return false for non-existent hook', () => {
      const registry = new HookRegistry('test');

      const result = registry.unregister('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('should disable a hook', () => {
      const registry = new HookRegistry('test');
      registry.register('my-hook', vi.fn());

      registry.disable('my-hook');

      expect(registry.getHooks()[0]?.enabled).toBe(false);
    });

    it('should enable a hook', () => {
      const registry = new HookRegistry('test');
      registry.register('my-hook', vi.fn());
      registry.disable('my-hook');

      registry.enable('my-hook');

      expect(registry.getHooks()[0]?.enabled).toBe(true);
    });
  });

  describe('execute', () => {
    it('should execute hooks in priority order', async () => {
      const registry = new HookRegistry<{ value: number }, void>('test');
      const order: number[] = [];

      registry.register('low', async () => { order.push(1); }, { priority: 10, timing: 'after' });
      registry.register('high', async () => { order.push(3); }, { priority: 100, timing: 'after' });
      registry.register('medium', async () => { order.push(2); }, { priority: 50, timing: 'after' });

      await registry.execute({ value: 1 }, 'after');

      expect(order).toEqual([3, 2, 1]);
    });

    it('should skip disabled hooks', async () => {
      const registry = new HookRegistry<unknown, void>('test');
      const handler = vi.fn();

      registry.register('my-hook', handler, { timing: 'after' });
      registry.disable('my-hook');

      await registry.execute({}, 'after');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const registry = new HookRegistry<unknown, void>('test');

      registry.register('failing', async () => { throw new Error('Fail'); }, { timing: 'after' });
      registry.register('passing', vi.fn(), { timing: 'after' });

      const result = await registry.execute({}, 'after');

      expect(result.success).toBe(false);
      expect(result.failed).toHaveLength(1);
      expect(result.executed).toHaveLength(1);
    });

    it('should only execute hooks with matching timing', async () => {
      const registry = new HookRegistry<unknown, void>('test');
      const beforeHandler = vi.fn();
      const afterHandler = vi.fn();

      registry.register('before', beforeHandler, { timing: 'before' });
      registry.register('after', afterHandler, { timing: 'after' });

      await registry.execute({}, 'before');

      expect(beforeHandler).toHaveBeenCalled();
      expect(afterHandler).not.toHaveBeenCalled();
    });
  });

  describe('executeAround', () => {
    it('should wrap core action', async () => {
      const registry = new HookRegistry<{ value: number }, number>('test');
      const order: string[] = [];

      registry.register('wrapper', async (ctx, next) => {
        order.push('before');
        const result = await next!();
        order.push('after');
        return result;
      }, { timing: 'around' });

      const result = await registry.executeAround({ value: 1 }, async () => {
        order.push('core');
        return 42;
      });

      expect(order).toEqual(['before', 'core', 'after']);
      expect(result.result).toBe(42);
    });

    it('should chain multiple around hooks', async () => {
      const registry = new HookRegistry<unknown, string>('test');
      const order: string[] = [];

      registry.register('outer', async (ctx, next) => {
        order.push('outer-before');
        const result = await next!();
        order.push('outer-after');
        return result;
      }, { timing: 'around', priority: 100 });

      registry.register('inner', async (ctx, next) => {
        order.push('inner-before');
        const result = await next!();
        order.push('inner-after');
        return result;
      }, { timing: 'around', priority: 50 });

      await registry.executeAround({}, async () => {
        order.push('core');
        return 'done';
      });

      expect(order).toEqual([
        'outer-before',
        'inner-before',
        'core',
        'inner-after',
        'outer-after',
      ]);
    });
  });
});

describe('HookManager', () => {
  beforeEach(() => {
    HookManager.resetInstance();
  });

  it('should return singleton', () => {
    const manager1 = HookManager.getInstance();
    const manager2 = HookManager.getInstance();
    expect(manager1).toBe(manager2);
  });

  it('should get or create registry', () => {
    const manager = HookManager.getInstance();

    const registry1 = manager.getRegistry('test');
    const registry2 = manager.getRegistry('test');

    expect(registry1).toBe(registry2);
  });

  it('should register hook', () => {
    const manager = HookManager.getInstance();
    const handler = vi.fn();

    manager.register('test:hook', 'my-handler', handler);

    const registry = manager.getRegistry('test:hook');
    expect(registry.getHooks()).toHaveLength(1);
  });

  it('should unregister hook', () => {
    const manager = HookManager.getInstance();
    manager.register('test:hook', 'my-handler', vi.fn());

    const result = manager.unregister('test:hook', 'my-handler');

    expect(result).toBe(true);
  });

  it('should list hook points', () => {
    const manager = HookManager.getInstance();
    manager.register('hook:a', 'handler', vi.fn());
    manager.register('hook:b', 'handler', vi.fn());

    const points = manager.getHookPoints();

    expect(points).toContain('hook:a');
    expect(points).toContain('hook:b');
  });
});

describe('getHookManager', () => {
  beforeEach(() => {
    HookManager.resetInstance();
  });

  it('should return singleton', () => {
    const manager1 = getHookManager();
    const manager2 = getHookManager();
    expect(manager1).toBe(manager2);
  });
});

describe('registerHook', () => {
  beforeEach(() => {
    HookManager.resetInstance();
  });

  it('should register hook via convenience function', () => {
    const handler = vi.fn();

    registerHook('test:hook', 'my-handler', handler);

    const manager = getHookManager();
    const registry = manager.getRegistry('test:hook');
    expect(registry.getHooks()).toHaveLength(1);
  });
});
