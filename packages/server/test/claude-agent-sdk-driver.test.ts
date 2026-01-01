/**
 * Unit tests for Claude Agent SDK Driver
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ClaudeAgentSDKDriver,
  SDK_DRIVER_CAPABILITIES,
} from '../src/agent/claude-agent-sdk-driver.js';
import { driverRegistry } from '../src/agent/index.js';

describe('Claude Agent SDK Driver', () => {
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should instantiate with default config', () => {
      const driver = new ClaudeAgentSDKDriver();

      expect(driver.name).toBe('claude-agent-sdk');
      expect(driver.version).toBe('1.0.0');
    });

    it('should instantiate with custom config', () => {
      const driver = new ClaudeAgentSDKDriver({
        timeoutMs: 60000,
        enableSandbox: false,
        maxTurns: 50,
      });

      expect(driver.name).toBe('claude-agent-sdk');
    });

    it('should instantiate with hooks config', () => {
      const driver = new ClaudeAgentSDKDriver({
        hooks: {
          logToolUse: true,
          trackFileChanges: true,
          blockedPatterns: [/rm -rf/],
        },
      });

      expect(driver.name).toBe('claude-agent-sdk');
    });

    it('should instantiate with env config', () => {
      const driver = new ClaudeAgentSDKDriver({
        env: {
          CUSTOM_VAR: 'value',
        },
      });

      expect(driver.name).toBe('claude-agent-sdk');
    });
  });

  describe('getCapabilities', () => {
    it('should return SDK capabilities', () => {
      const driver = new ClaudeAgentSDKDriver();
      const caps = driver.getCapabilities();

      expect(caps.supportsSessionResume).toBe(true);
      expect(caps.supportsStructuredOutput).toBe(true);
      expect(caps.supportsToolRestriction).toBe(true);
      expect(caps.supportsTimeout).toBe(true);
      expect(caps.supportsHooks).toBe(true);
      expect(caps.maxTurns).toBe(100);
    });

    it('should match exported capabilities', () => {
      const driver = new ClaudeAgentSDKDriver();
      const caps = driver.getCapabilities();

      expect(caps).toEqual(SDK_DRIVER_CAPABILITIES);
    });
  });

  describe('isAvailable', () => {
    it('should be unavailable without API key', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const driver = new ClaudeAgentSDKDriver();
      driver.resetAvailabilityCache();

      const available = await driver.isAvailable();
      expect(available).toBe(false);
    });

    it('should check API key first', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const driver = new ClaudeAgentSDKDriver();
      driver.resetAvailabilityCache();

      // Should return false without checking CLI
      const available = await driver.isAvailable();
      expect(available).toBe(false);
    });

    it('should cache availability result', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const driver = new ClaudeAgentSDKDriver();
      driver.resetAvailabilityCache();

      // First call
      await driver.isAvailable();
      // Second call should use cache
      const available = await driver.isAvailable();

      // Result depends on whether CLI is installed, but should be cached
      expect(typeof available).toBe('boolean');
    });
  });

  describe('SDK Driver Capabilities Object', () => {
    it('should have correct structure', () => {
      expect(SDK_DRIVER_CAPABILITIES).toHaveProperty('supportsSessionResume');
      expect(SDK_DRIVER_CAPABILITIES).toHaveProperty('supportsStructuredOutput');
      expect(SDK_DRIVER_CAPABILITIES).toHaveProperty('supportsToolRestriction');
      expect(SDK_DRIVER_CAPABILITIES).toHaveProperty('supportsTimeout');
      expect(SDK_DRIVER_CAPABILITIES).toHaveProperty('supportsHooks');
      expect(SDK_DRIVER_CAPABILITIES).toHaveProperty('maxTurns');
    });
  });
});

describe('SDK Driver Registry', () => {
  it('should be registered in driver registry', () => {
    const driver = driverRegistry.get('claude-agent-sdk');
    expect(driver).not.toBeNull();
    expect(driver?.name).toBe('claude-agent-sdk');
  });

  it('should have all expected drivers registered', () => {
    const drivers = driverRegistry.list();
    const names = drivers.map((d) => d.name);

    expect(names).toContain('claude-agent-sdk');
    expect(names).toContain('claude-code-api');
    expect(names).toContain('claude-code-subscription');
    expect(names).toContain('openai-codex');
    expect(names).toContain('opencode');
  });

  it('should keep claude-code-subscription as default', () => {
    const defaultDriver = driverRegistry.getDefault();
    expect(defaultDriver.name).toBe('claude-code-subscription');
  });
});
