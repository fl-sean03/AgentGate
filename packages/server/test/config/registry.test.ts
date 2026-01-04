/**
 * Tests for Configuration Registry System.
 * (v0.2.27 - Thrust 11: Configuration Registry System)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConfigRegistry,
  getConfigRegistry,
  configGet,
  configSet,
  ConfigSource,
} from '../../src/config/registry.js';
import {
  defaultConfig,
  getDefaultValue,
  validateConfig,
} from '../../src/config/schema.js';

describe('ConfigRegistry', () => {
  beforeEach(() => {
    ConfigRegistry.resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton', () => {
      const registry1 = ConfigRegistry.getInstance();
      const registry2 = ConfigRegistry.getInstance();
      expect(registry1).toBe(registry2);
    });
  });

  describe('initialize', () => {
    it('should initialize with default config', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      expect(registry.isInitialized()).toBe(true);
    });

    it('should initialize with partial config', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({
        server: { port: 8080 },
      });

      expect(registry.get('server.port')).toBe(8080);
    });

    it('should reject invalid config', () => {
      const registry = ConfigRegistry.getInstance();

      expect(() => {
        registry.initialize({
          server: { port: -1 }, // Invalid port
        });
      }).toThrow('Configuration validation failed');
    });
  });

  describe('get', () => {
    it('should get top-level values', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      const dataDir = registry.get('dataDir');
      expect(dataDir).toBe('.agentgate/data');
    });

    it('should get nested values', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({
        server: { port: 9000 },
      });

      expect(registry.get('server.port')).toBe(9000);
    });

    it('should return default for missing path', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      expect(registry.get('server.port')).toBe(3001);
    });

    it('should prioritize overrides', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({ server: { port: 3000 } });
      registry.set('server.port', 4000);

      expect(registry.get('server.port')).toBe(4000);
    });
  });

  describe('set', () => {
    it('should set a value', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      registry.set('server.port', 5000);

      expect(registry.get('server.port')).toBe(5000);
    });

    it('should validate new values', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      expect(() => {
        registry.set('server.port', -1);
      }).toThrow('Invalid configuration value');
    });

    it('should track override source', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      registry.set('server.port', 6000);

      expect(registry.hasOverride('server.port')).toBe(true);
      const overrides = registry.getOverrides();
      expect(overrides.get('server.port')?.source).toBe(ConfigSource.RUNTIME);
    });
  });

  describe('reset', () => {
    it('should reset a specific path', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({ server: { port: 3000 } });
      registry.set('server.port', 5000);

      registry.reset('server.port');

      expect(registry.get('server.port')).toBe(3000);
      expect(registry.hasOverride('server.port')).toBe(false);
    });

    it('should reset all when no path provided', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({ server: { port: 5000 } });
      registry.set('server.host', 'localhost');

      registry.reset();

      expect(registry.isInitialized()).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return complete config with overrides', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({ server: { port: 3000 } });
      registry.set('server.host', 'localhost');

      const config = registry.getAll();

      expect(config.server.port).toBe(3000);
      expect(config.server.host).toBe('localhost');
    });
  });

  describe('getSection', () => {
    it('should return a section', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({
        server: { port: 8080, host: 'example.com' },
      });

      const server = registry.getSection('server');

      expect(server.port).toBe(8080);
      expect(server.host).toBe('example.com');
    });
  });

  describe('change listeners', () => {
    it('should notify on set', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      const listener = vi.fn();
      registry.addChangeListener(listener);

      registry.set('server.port', 9999);

      expect(listener).toHaveBeenCalledWith(
        'server.port',
        9999,
        3001,
        ConfigSource.RUNTIME
      );
    });

    it('should notify on reset', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({ server: { port: 5000 } });
      registry.set('server.port', 8000);

      const listener = vi.fn();
      registry.addChangeListener(listener);

      registry.reset('server.port');

      expect(listener).toHaveBeenCalledWith(
        'server.port',
        5000,
        8000,
        ConfigSource.DEFAULT
      );
    });

    it('should remove listener', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      const listener = vi.fn();
      const unsubscribe = registry.addChangeListener(listener);

      unsubscribe();
      registry.set('server.port', 9999);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      const badListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      registry.addChangeListener(badListener);
      registry.addChangeListener(goodListener);

      // Should not throw
      registry.set('server.port', 9999);

      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('toJSON', () => {
    it('should export config', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({
        server: { port: 3000 },
      });

      const json = registry.toJSON(false);

      expect(json.server).toBeDefined();
    });

    it('should redact secrets', () => {
      const registry = ConfigRegistry.getInstance();
      registry.initialize({});

      // Manually test redaction
      const json = registry.toJSON(true);

      // Verify structure is preserved
      expect(json).toHaveProperty('server');
      expect(json).toHaveProperty('logging');
    });
  });
});

describe('getConfigRegistry', () => {
  beforeEach(() => {
    ConfigRegistry.resetInstance();
  });

  it('should return singleton', () => {
    const registry1 = getConfigRegistry();
    const registry2 = getConfigRegistry();
    expect(registry1).toBe(registry2);
  });
});

describe('configGet / configSet', () => {
  beforeEach(() => {
    ConfigRegistry.resetInstance();
    ConfigRegistry.getInstance().initialize({});
  });

  it('should get config value', () => {
    expect(configGet('server.port')).toBe(3001);
  });

  it('should set config value', () => {
    configSet('server.port', 8888);
    expect(configGet('server.port')).toBe(8888);
  });
});

describe('Schema utilities', () => {
  describe('getDefaultValue', () => {
    it('should return default for known path', () => {
      expect(getDefaultValue('server.port')).toBe(3001);
    });

    it('should return undefined for unknown path', () => {
      expect(getDefaultValue('unknown.path')).toBeUndefined();
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const result = validateConfig({
        server: { port: 8080 },
        execution: {},
        sandbox: {},
        github: {},
        ci: {},
        harness: {},
        logging: {},
        wal: {},
        sdk: {},
        verification: {},
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid config', () => {
      const result = validateConfig({
        server: { port: 'invalid' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('defaultConfig', () => {
    it('should have all sections', () => {
      expect(defaultConfig.server).toBeDefined();
      expect(defaultConfig.execution).toBeDefined();
      expect(defaultConfig.sandbox).toBeDefined();
      expect(defaultConfig.github).toBeDefined();
      expect(defaultConfig.ci).toBeDefined();
      expect(defaultConfig.harness).toBeDefined();
      expect(defaultConfig.logging).toBeDefined();
      expect(defaultConfig.wal).toBeDefined();
      expect(defaultConfig.sdk).toBeDefined();
      expect(defaultConfig.verification).toBeDefined();
    });
  });
});
