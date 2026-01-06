/**
 * Plugin Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '../../src/verifier/plugins/registry.js';
import type { VerificationPlugin, VerificationContext, VerificationResult } from '../../src/verifier/plugins/types.js';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  const createTestPlugin = (overrides: Partial<VerificationPlugin['config']> = {}): VerificationPlugin => ({
    config: {
      id: 'test-plugin',
      name: 'Test Plugin',
      level: 'L0',
      priority: 10,
      enabled: true,
      ...overrides,
    },
    shouldRun: () => true,
    verify: async (): Promise<VerificationResult> => ({
      pluginId: 'test-plugin',
      status: 'passed',
      level: 'L0',
      summary: 'Test passed',
      checks: [],
      durationMs: 100,
    }),
  });

  describe('register', () => {
    it('should register a plugin', () => {
      const plugin = createTestPlugin();
      registry.register(plugin);

      expect(registry.has('test-plugin')).toBe(true);
      expect(registry.count()).toBe(1);
    });

    it('should throw when registering plugin without id', () => {
      const plugin = createTestPlugin({ id: '' });
      expect(() => registry.register(plugin)).toThrow();
    });

    it('should throw when registering duplicate plugin', () => {
      const plugin = createTestPlugin();
      registry.register(plugin);

      expect(() => registry.register(plugin)).toThrow();
    });
  });

  describe('unregister', () => {
    it('should unregister a plugin', () => {
      const plugin = createTestPlugin();
      registry.register(plugin);

      expect(registry.unregister('test-plugin')).toBe(true);
      expect(registry.has('test-plugin')).toBe(false);
    });

    it('should return false for non-existent plugin', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return plugin by id', () => {
      const plugin = createTestPlugin();
      registry.register(plugin);

      const result = registry.get('test-plugin');
      expect(result?.config.name).toBe('Test Plugin');
    });

    it('should return undefined for non-existent plugin', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all plugins sorted by priority', () => {
      registry.register(createTestPlugin({ id: 'plugin-1', priority: 20 }));
      registry.register(createTestPlugin({ id: 'plugin-2', priority: 5 }));
      registry.register(createTestPlugin({ id: 'plugin-3', priority: 15 }));

      const plugins = registry.getAll();
      expect(plugins).toHaveLength(3);
      expect(plugins[0].config.id).toBe('plugin-2'); // priority 5
      expect(plugins[1].config.id).toBe('plugin-3'); // priority 15
      expect(plugins[2].config.id).toBe('plugin-1'); // priority 20
    });
  });

  describe('getByLevel', () => {
    it('should return plugins at specific level', () => {
      registry.register(createTestPlugin({ id: 'l0-1', level: 'L0' }));
      registry.register(createTestPlugin({ id: 'l0-2', level: 'L0' }));
      registry.register(createTestPlugin({ id: 'l1-1', level: 'L1' }));

      const l0Plugins = registry.getByLevel('L0');
      expect(l0Plugins).toHaveLength(2);
      expect(l0Plugins.every((p) => p.config.level === 'L0')).toBe(true);
    });
  });

  describe('getEnabled', () => {
    it('should return only enabled plugins', () => {
      registry.register(createTestPlugin({ id: 'enabled-1', enabled: true }));
      registry.register(createTestPlugin({ id: 'disabled-1', enabled: false }));
      registry.register(createTestPlugin({ id: 'enabled-2', enabled: true }));

      const enabled = registry.getEnabled();
      expect(enabled).toHaveLength(2);
      expect(enabled.every((p) => p.config.enabled)).toBe(true);
    });
  });

  describe('getEnabledAtLevels', () => {
    it('should return enabled plugins at specified levels', () => {
      registry.register(createTestPlugin({ id: 'l0-1', level: 'L0', enabled: true }));
      registry.register(createTestPlugin({ id: 'l1-1', level: 'L1', enabled: true }));
      registry.register(createTestPlugin({ id: 'l2-1', level: 'L2', enabled: true }));
      registry.register(createTestPlugin({ id: 'l0-2', level: 'L0', enabled: false }));

      const plugins = registry.getEnabledAtLevels(['L0', 'L1']);
      expect(plugins).toHaveLength(2);
      expect(plugins.some((p) => p.config.id === 'l0-1')).toBe(true);
      expect(plugins.some((p) => p.config.id === 'l1-1')).toBe(true);
    });
  });

  describe('enable/disable', () => {
    it('should enable a plugin', () => {
      registry.register(createTestPlugin({ id: 'plugin-1', enabled: false }));

      expect(registry.enable('plugin-1')).toBe(true);
      expect(registry.get('plugin-1')?.config.enabled).toBe(true);
    });

    it('should disable a plugin', () => {
      registry.register(createTestPlugin({ id: 'plugin-1', enabled: true }));

      expect(registry.disable('plugin-1')).toBe(true);
      expect(registry.get('plugin-1')?.config.enabled).toBe(false);
    });

    it('should return false for non-existent plugin', () => {
      expect(registry.enable('non-existent')).toBe(false);
      expect(registry.disable('non-existent')).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update plugin configuration', () => {
      registry.register(createTestPlugin({ id: 'plugin-1', priority: 10 }));

      expect(registry.updateConfig('plugin-1', { priority: 50 })).toBe(true);
      expect(registry.get('plugin-1')?.config.priority).toBe(50);
    });

    it('should not allow changing plugin id', () => {
      registry.register(createTestPlugin({ id: 'plugin-1' }));

      registry.updateConfig('plugin-1', { id: 'new-id' } as any);
      expect(registry.get('plugin-1')?.config.id).toBe('plugin-1');
    });

    it('should return false for non-existent plugin', () => {
      expect(registry.updateConfig('non-existent', { priority: 50 })).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all plugins', () => {
      registry.register(createTestPlugin({ id: 'plugin-1' }));
      registry.register(createTestPlugin({ id: 'plugin-2' }));

      registry.clear();

      expect(registry.count()).toBe(0);
    });
  });

  describe('getIds', () => {
    it('should return all plugin ids', () => {
      registry.register(createTestPlugin({ id: 'plugin-1' }));
      registry.register(createTestPlugin({ id: 'plugin-2' }));

      const ids = registry.getIds();
      expect(ids).toContain('plugin-1');
      expect(ids).toContain('plugin-2');
    });
  });

  describe('getConfigs', () => {
    it('should return all plugin configs', () => {
      registry.register(createTestPlugin({ id: 'plugin-1', name: 'Plugin 1' }));
      registry.register(createTestPlugin({ id: 'plugin-2', name: 'Plugin 2' }));

      const configs = registry.getConfigs();
      expect(configs).toHaveLength(2);
      expect(configs.map((c) => c.name)).toContain('Plugin 1');
      expect(configs.map((c) => c.name)).toContain('Plugin 2');
    });
  });
});
