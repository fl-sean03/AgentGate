/**
 * Tests for Plugin System.
 * (v0.2.27 - Phase 3: Extensibility Framework)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PluginManager,
  getPluginManager,
  createPlugin,
  type Plugin,
  type PluginContext,
} from '../../src/extensibility/plugins.js';
import { HookManager } from '../../src/extensibility/hooks.js';
import { resetEventBus } from '../../src/extensibility/events.js';

describe('PluginManager', () => {
  beforeEach(() => {
    PluginManager.resetInstance();
    HookManager.resetInstance();
    resetEventBus();
  });

  describe('getInstance', () => {
    it('should return singleton', () => {
      const manager1 = PluginManager.getInstance();
      const manager2 = PluginManager.getInstance();
      expect(manager1).toBe(manager2);
    });
  });

  describe('load', () => {
    it('should load a plugin', async () => {
      const manager = PluginManager.getInstance();
      const plugin = createPlugin(
        { id: 'test', name: 'Test Plugin', version: '1.0.0' },
        async () => {}
      );

      await manager.load(plugin);

      expect(manager.isLoaded('test')).toBe(true);
    });

    it('should call initialize', async () => {
      const manager = PluginManager.getInstance();
      const initialize = vi.fn();
      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        initialize
      );

      await manager.load(plugin);

      expect(initialize).toHaveBeenCalled();
    });

    it('should provide context to plugin', async () => {
      const manager = PluginManager.getInstance();
      let receivedContext: PluginContext | undefined;

      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async (ctx) => { receivedContext = ctx; }
      );

      await manager.load(plugin);

      expect(receivedContext?.registerHook).toBeInstanceOf(Function);
      expect(receivedContext?.subscribeEvent).toBeInstanceOf(Function);
      expect(receivedContext?.logger).toBeDefined();
    });

    it('should reject duplicate plugin', async () => {
      const manager = PluginManager.getInstance();
      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async () => {}
      );

      await manager.load(plugin);
      await manager.load(plugin); // Should not throw, but log warning

      expect(manager.getAll()).toHaveLength(1);
    });

    it('should reject missing dependencies', async () => {
      const manager = PluginManager.getInstance();
      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0', dependencies: ['missing'] },
        async () => {}
      );

      await expect(manager.load(plugin)).rejects.toThrow('missing dependencies');
    });

    it('should provide config to plugin', async () => {
      const manager = PluginManager.getInstance();
      manager.setConfig('test', { key: 'value' });

      let receivedConfig: Record<string, unknown> | undefined;
      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async (ctx) => { receivedConfig = ctx.config; }
      );

      await manager.load(plugin);

      expect(receivedConfig?.key).toBe('value');
    });
  });

  describe('unload', () => {
    it('should unload a plugin', async () => {
      const manager = PluginManager.getInstance();
      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async () => {}
      );

      await manager.load(plugin);
      const result = await manager.unload('test');

      expect(result).toBe(true);
      expect(manager.isLoaded('test')).toBe(false);
    });

    it('should call destroy', async () => {
      const manager = PluginManager.getInstance();
      const destroy = vi.fn();
      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async () => {},
        destroy
      );

      await manager.load(plugin);
      await manager.unload('test');

      expect(destroy).toHaveBeenCalled();
    });

    it('should return false for non-existent plugin', async () => {
      const manager = PluginManager.getInstance();

      const result = await manager.unload('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('should disable a plugin', async () => {
      const manager = PluginManager.getInstance();
      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async () => {}
      );

      await manager.load(plugin);
      manager.disable('test');

      expect(manager.isEnabled('test')).toBe(false);
    });

    it('should enable a plugin', async () => {
      const manager = PluginManager.getInstance();
      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async () => {}
      );

      await manager.load(plugin);
      manager.disable('test');
      manager.enable('test');

      expect(manager.isEnabled('test')).toBe(true);
    });
  });

  describe('get', () => {
    it('should get loaded plugin', async () => {
      const manager = PluginManager.getInstance();
      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async () => {}
      );

      await manager.load(plugin);

      const retrieved = manager.get('test');
      expect(retrieved?.metadata.id).toBe('test');
    });

    it('should return undefined for non-existent', () => {
      const manager = PluginManager.getInstance();

      expect(manager.get('non-existent')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all loaded plugins', async () => {
      const manager = PluginManager.getInstance();

      await manager.load(createPlugin(
        { id: 'a', name: 'A', version: '1.0.0' },
        async () => {}
      ));
      await manager.load(createPlugin(
        { id: 'b', name: 'B', version: '1.0.0' },
        async () => {}
      ));

      const all = manager.getAll();

      expect(all).toHaveLength(2);
      expect(all.map(p => p.id)).toContain('a');
      expect(all.map(p => p.id)).toContain('b');
    });
  });

  describe('hook registration', () => {
    it('should register hooks from plugin', async () => {
      const manager = PluginManager.getInstance();
      const hookManager = HookManager.getInstance();

      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async (ctx) => {
          ctx.registerHook('test:hook', async () => {});
        }
      );

      await manager.load(plugin);

      const registry = hookManager.getRegistry('test:hook');
      expect(registry.getHooks()).toHaveLength(1);
    });

    it('should unregister hooks on unload', async () => {
      const manager = PluginManager.getInstance();
      const hookManager = HookManager.getInstance();

      const plugin = createPlugin(
        { id: 'test', name: 'Test', version: '1.0.0' },
        async (ctx) => {
          ctx.registerHook('test:hook', async () => {});
        }
      );

      await manager.load(plugin);
      await manager.unload('test');

      const registry = hookManager.getRegistry('test:hook');
      expect(registry.getHooks()).toHaveLength(0);
    });
  });
});

describe('getPluginManager', () => {
  beforeEach(() => {
    PluginManager.resetInstance();
  });

  it('should return singleton', () => {
    const manager1 = getPluginManager();
    const manager2 = getPluginManager();
    expect(manager1).toBe(manager2);
  });
});

describe('createPlugin', () => {
  it('should create a plugin', () => {
    const plugin = createPlugin(
      { id: 'test', name: 'Test', version: '1.0.0' },
      async () => {}
    );

    expect(plugin.metadata.id).toBe('test');
    expect(plugin.initialize).toBeInstanceOf(Function);
  });

  it('should include destroy if provided', () => {
    const plugin = createPlugin(
      { id: 'test', name: 'Test', version: '1.0.0' },
      async () => {},
      async () => {}
    );

    expect(plugin.destroy).toBeInstanceOf(Function);
  });
});
