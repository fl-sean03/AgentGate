/**
 * Unit tests for OpenAI and OpenCode agent drivers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OpenAICodexDriver,
  OpenCodeDriver,
  ClaudeCodeDriver,
  ClaudeCodeSubscriptionDriver,
  driverRegistry,
} from '../src/agent/index.js';

describe('OpenAI Codex Driver', () => {
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey) {
      process.env.OPENAI_API_KEY = originalApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('should instantiate with default config', () => {
    const driver = new OpenAICodexDriver();
    expect(driver.name).toBe('openai-codex');
    expect(driver.version).toBe('1.0.0');
  });

  it('should instantiate with custom config', () => {
    const driver = new OpenAICodexDriver({
      defaultTimeoutMs: 60000,
      debugEvents: true,
      skipGitRepoCheck: false,
    });
    expect(driver.name).toBe('openai-codex');
  });

  it('should report capabilities', () => {
    const driver = new OpenAICodexDriver();
    const caps = driver.getCapabilities();

    expect(caps.supportsSessionResume).toBe(true);
    expect(caps.supportsStructuredOutput).toBe(true);
    expect(caps.supportsToolRestriction).toBe(false);
    expect(caps.supportsTimeout).toBe(true);
    expect(caps.maxTurns).toBe(100);
  });

  it('should be unavailable without API key', async () => {
    delete process.env.OPENAI_API_KEY;
    const driver = new OpenAICodexDriver();
    const available = await driver.isAvailable();
    expect(available).toBe(false);
  });

  it('should be available with API key', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const driver = new OpenAICodexDriver();
    const available = await driver.isAvailable();
    expect(available).toBe(true);
  });
});

describe('OpenCode Driver', () => {
  it('should instantiate with default config', () => {
    const driver = new OpenCodeDriver();
    expect(driver.name).toBe('opencode');
    expect(driver.version).toBe('1.0.0');
  });

  it('should instantiate with custom config', () => {
    const driver = new OpenCodeDriver({
      defaultTimeoutMs: 60000,
      debugMode: true,
      hostname: '127.0.0.1',
      port: 5000,
    });
    expect(driver.name).toBe('opencode');
  });

  it('should report capabilities', () => {
    const driver = new OpenCodeDriver();
    const caps = driver.getCapabilities();

    expect(caps.supportsSessionResume).toBe(true);
    expect(caps.supportsStructuredOutput).toBe(false);
    expect(caps.supportsToolRestriction).toBe(false);
    expect(caps.supportsTimeout).toBe(true);
    expect(caps.maxTurns).toBe(50);
  });

  it('should be available when SDK can be imported', async () => {
    const driver = new OpenCodeDriver();
    const available = await driver.isAvailable();
    // SDK is installed, so it should be available
    expect(available).toBe(true);
  });
});

describe('Claude Code Drivers', () => {
  it('should instantiate Claude Code API driver', () => {
    const driver = new ClaudeCodeDriver();
    expect(driver.name).toBe('claude-code');
    expect(driver.version).toBe('1.0.0');
  });

  it('should instantiate Claude Code Subscription driver', () => {
    const driver = new ClaudeCodeSubscriptionDriver();
    expect(driver.name).toBe('claude-code-subscription');
    expect(driver.version).toBe('1.0.0');
  });
});

describe('Driver Registry', () => {
  it('should have all drivers registered', () => {
    const drivers = driverRegistry.list();
    const names = drivers.map((d) => d.name);

    // Should have exactly 4 drivers
    expect(names).toContain('claude-code');
    expect(names).toContain('claude-code-subscription');
    expect(names).toContain('openai-codex');
    expect(names).toContain('opencode');

    // Should NOT have removed drivers
    expect(names).not.toContain('claude-agent-sdk');
    expect(names).not.toContain('openai-agents');
  });

  it('should get drivers by name', () => {
    const claudeCode = driverRegistry.get('claude-code');
    expect(claudeCode).not.toBeNull();
    expect(claudeCode?.name).toBe('claude-code');

    const subscription = driverRegistry.get('claude-code-subscription');
    expect(subscription).not.toBeNull();
    expect(subscription?.name).toBe('claude-code-subscription');

    const codex = driverRegistry.get('openai-codex');
    expect(codex).not.toBeNull();
    expect(codex?.name).toBe('openai-codex');

    const opencode = driverRegistry.get('opencode');
    expect(opencode).not.toBeNull();
    expect(opencode?.name).toBe('opencode');
  });

  it('should have claude-code as default', () => {
    const defaultDriver = driverRegistry.getDefault();
    expect(defaultDriver.name).toBe('claude-code');
  });
});
