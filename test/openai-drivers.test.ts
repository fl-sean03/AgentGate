/**
 * Unit tests for OpenAI and OpenCode agent drivers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OpenAICodexDriver,
  OpenAIAgentsDriver,
  OpenCodeDriver,
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

describe('OpenAI Agents Driver', () => {
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
    const driver = new OpenAIAgentsDriver();
    expect(driver.name).toBe('openai-agents');
    expect(driver.version).toBe('1.0.0');
  });

  it('should instantiate with custom config', () => {
    const driver = new OpenAIAgentsDriver({
      defaultTimeoutMs: 60000,
      model: 'gpt-4-turbo',
      debugMode: true,
    });
    expect(driver.name).toBe('openai-agents');
  });

  it('should report capabilities', () => {
    const driver = new OpenAIAgentsDriver();
    const caps = driver.getCapabilities();

    expect(caps.supportsSessionResume).toBe(false);
    expect(caps.supportsStructuredOutput).toBe(true);
    expect(caps.supportsToolRestriction).toBe(true);
    expect(caps.supportsTimeout).toBe(true);
    expect(caps.maxTurns).toBe(50);
  });

  it('should be unavailable without API key', async () => {
    delete process.env.OPENAI_API_KEY;
    const driver = new OpenAIAgentsDriver();
    const available = await driver.isAvailable();
    expect(available).toBe(false);
  });

  it('should be available with API key', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const driver = new OpenAIAgentsDriver();
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

describe('Driver Registry', () => {
  it('should have all drivers registered', () => {
    const drivers = driverRegistry.list();
    const names = drivers.map((d) => d.name);

    expect(names).toContain('claude-agent-sdk');
    expect(names).toContain('openai-codex');
    expect(names).toContain('openai-agents');
    expect(names).toContain('opencode');
  });

  it('should get drivers by name', () => {
    const codex = driverRegistry.get('openai-codex');
    expect(codex).not.toBeNull();
    expect(codex?.name).toBe('openai-codex');

    const agents = driverRegistry.get('openai-agents');
    expect(agents).not.toBeNull();
    expect(agents?.name).toBe('openai-agents');

    const opencode = driverRegistry.get('opencode');
    expect(opencode).not.toBeNull();
    expect(opencode?.name).toBe('opencode');
  });

  it('should have claude-agent-sdk as default', () => {
    const defaultDriver = driverRegistry.getDefault();
    expect(defaultDriver.name).toBe('claude-agent-sdk');
  });
});
