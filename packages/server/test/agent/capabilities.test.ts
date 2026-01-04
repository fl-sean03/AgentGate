/**
 * Tests for Agent Capability System.
 * (v0.2.27 - Thrust 15: Agent Capability Negotiation)
 */

import { describe, it, expect } from 'vitest';
import {
  STANDARD_CAPABILITIES,
  createCapability,
  createAgentCapabilities,
  createTaskRequirements,
  requireCapability,
  hasCapability,
  getCapability,
  getEnabledCapabilities,
  getCapabilityNames,
  mergeCapabilities,
  getClaudeCodeCapabilities,
  getClaudeAgentSDKCapabilities,
} from '../../src/agent/capabilities.js';
import {
  matchCapabilities,
  canFulfill,
  getMatchReason,
  findBestMatch,
  findMatchingAgents,
  explainMismatch,
} from '../../src/agent/matcher.js';

describe('Capabilities', () => {
  describe('createCapability', () => {
    it('should create a simple capability', () => {
      const cap = createCapability('network', true);

      expect(cap.name).toBe('network');
      expect(cap.enabled).toBe(true);
    });

    it('should create capability with options', () => {
      const cap = createCapability('shell', true, {
        version: '1.0.0',
        config: { maxTime: 60 },
        description: 'Shell access',
      });

      expect(cap.version).toBe('1.0.0');
      expect(cap.config).toEqual({ maxTime: 60 });
      expect(cap.description).toBe('Shell access');
    });
  });

  describe('createAgentCapabilities', () => {
    it('should create agent capabilities', () => {
      const caps = createAgentCapabilities(
        'agent-1',
        'claude-code',
        [createCapability('shell', true)],
        {
          agentVersion: '1.0.0',
          maxTokens: 100000,
        }
      );

      expect(caps.agentId).toBe('agent-1');
      expect(caps.agentType).toBe('claude-code');
      expect(caps.capabilities).toHaveLength(1);
      expect(caps.maxTokens).toBe(100000);
    });
  });

  describe('requireCapability', () => {
    it('should create requirement with defaults', () => {
      const req = requireCapability('network');

      expect(req.name).toBe('network');
      expect(req.required).toBe(true);
    });

    it('should create optional requirement', () => {
      const req = requireCapability('browser', { required: false });

      expect(req.required).toBe(false);
    });

    it('should include version requirement', () => {
      const req = requireCapability('shell', { minVersion: '2.0.0' });

      expect(req.minVersion).toBe('2.0.0');
    });
  });

  describe('hasCapability', () => {
    it('should return true for enabled capability', () => {
      const caps = [createCapability('shell', true)];
      expect(hasCapability(caps, 'shell')).toBe(true);
    });

    it('should return false for disabled capability', () => {
      const caps = [createCapability('shell', false)];
      expect(hasCapability(caps, 'shell')).toBe(false);
    });

    it('should return false for missing capability', () => {
      const caps = [createCapability('shell', true)];
      expect(hasCapability(caps, 'network')).toBe(false);
    });
  });

  describe('getCapability', () => {
    it('should find capability by name', () => {
      const caps = [
        createCapability('shell', true),
        createCapability('network', false),
      ];

      const cap = getCapability(caps, 'network');
      expect(cap?.name).toBe('network');
    });

    it('should return undefined for missing', () => {
      const caps = [createCapability('shell', true)];
      expect(getCapability(caps, 'browser')).toBeUndefined();
    });
  });

  describe('getEnabledCapabilities', () => {
    it('should filter to enabled only', () => {
      const caps = [
        createCapability('shell', true),
        createCapability('network', false),
        createCapability('browser', true),
      ];

      const enabled = getEnabledCapabilities(caps);

      expect(enabled).toHaveLength(2);
      expect(enabled.map(c => c.name)).toContain('shell');
      expect(enabled.map(c => c.name)).toContain('browser');
    });
  });

  describe('getCapabilityNames', () => {
    it('should extract names', () => {
      const caps = [
        createCapability('shell', true),
        createCapability('network', false),
      ];

      const names = getCapabilityNames(caps);

      expect(names).toEqual(['shell', 'network']);
    });
  });

  describe('mergeCapabilities', () => {
    it('should merge capability sets', () => {
      const set1 = [createCapability('shell', true)];
      const set2 = [createCapability('network', true)];

      const merged = mergeCapabilities(set1, set2);

      expect(merged).toHaveLength(2);
    });

    it('should override with later values', () => {
      const set1 = [createCapability('shell', true)];
      const set2 = [createCapability('shell', false)];

      const merged = mergeCapabilities(set1, set2);

      expect(merged).toHaveLength(1);
      expect(merged[0].enabled).toBe(false);
    });
  });

  describe('getClaudeCodeCapabilities', () => {
    it('should return Claude Code defaults', () => {
      const caps = getClaudeCodeCapabilities('agent-1');

      expect(caps.agentType).toBe('claude-code');
      expect(hasCapability(caps.capabilities, STANDARD_CAPABILITIES.SHELL)).toBe(true);
      expect(hasCapability(caps.capabilities, STANDARD_CAPABILITIES.FILESYSTEM)).toBe(true);
      expect(hasCapability(caps.capabilities, STANDARD_CAPABILITIES.NETWORK)).toBe(false);
    });
  });

  describe('getClaudeAgentSDKCapabilities', () => {
    it('should return Agent SDK defaults', () => {
      const caps = getClaudeAgentSDKCapabilities('agent-1');

      expect(caps.agentType).toBe('claude-agent-sdk');
      expect(hasCapability(caps.capabilities, STANDARD_CAPABILITIES.NETWORK)).toBe(true);
      expect(hasCapability(caps.capabilities, STANDARD_CAPABILITIES.BROWSER)).toBe(true);
    });
  });
});

describe('Capability Matcher', () => {
  describe('matchCapabilities', () => {
    it('should match when all required capabilities present', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [
        createCapability('shell', true),
        createCapability('filesystem', true),
      ]);

      const requirements = createTaskRequirements({
        requiredCapabilities: [
          requireCapability('shell'),
          requireCapability('filesystem'),
        ],
      });

      const result = matchCapabilities(agent, requirements);

      expect(result.canFulfill).toBe(true);
      expect(result.score).toBe(100);
    });

    it('should fail when required capability missing', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [
        createCapability('shell', true),
      ]);

      const requirements = createTaskRequirements({
        requiredCapabilities: [
          requireCapability('shell'),
          requireCapability('network'),
        ],
      });

      const result = matchCapabilities(agent, requirements);

      expect(result.canFulfill).toBe(false);
      expect(result.missingRequired).toContain('network');
    });

    it('should fail when forbidden capability present', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [
        createCapability('network', true),
      ]);

      const requirements = createTaskRequirements({
        forbiddenCapabilities: ['network'],
      });

      const result = matchCapabilities(agent, requirements);

      expect(result.canFulfill).toBe(false);
      expect(result.hasForbidden).toContain('network');
    });

    it('should pass with missing preferred', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [
        createCapability('shell', true),
      ]);

      const requirements = createTaskRequirements({
        requiredCapabilities: [requireCapability('shell')],
        preferredCapabilities: [requireCapability('browser', { required: false })],
      });

      const result = matchCapabilities(agent, requirements);

      expect(result.canFulfill).toBe(true);
      expect(result.missingPreferred).toContain('browser');
    });

    it('should check version requirements', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [
        createCapability('shell', true, { version: '1.0.0' }),
      ]);

      const requirements = createTaskRequirements({
        requiredCapabilities: [
          requireCapability('shell', { minVersion: '2.0.0' }),
        ],
      });

      const result = matchCapabilities(agent, requirements);

      expect(result.canFulfill).toBe(false);
    });

    it('should check min tokens', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [], {
        maxTokens: 50000,
      });

      const requirements = createTaskRequirements({
        minTokens: 100000,
      });

      const result = matchCapabilities(agent, requirements);

      expect(result.canFulfill).toBe(false);
    });

    it('should check required languages', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [], {
        supportedLanguages: ['javascript', 'python'],
      });

      const requirements = createTaskRequirements({
        requiredLanguages: ['rust'],
      });

      const result = matchCapabilities(agent, requirements);

      expect(result.canFulfill).toBe(false);
    });
  });

  describe('canFulfill', () => {
    it('should return boolean result', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [
        createCapability('shell', true),
      ]);

      const requirements = createTaskRequirements({
        requiredCapabilities: [requireCapability('shell')],
      });

      expect(canFulfill(agent, requirements)).toBe(true);
    });
  });

  describe('getMatchReason', () => {
    it('should return human-readable reason', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [
        createCapability('shell', true),
      ]);

      const requirements = createTaskRequirements({
        requiredCapabilities: [requireCapability('network')],
      });

      const reason = getMatchReason(agent, requirements);

      expect(reason).toContain('network');
    });
  });

  describe('findBestMatch', () => {
    it('should find best matching agent', () => {
      const agents = [
        createAgentCapabilities('agent-1', 'test', [
          createCapability('shell', true),
        ]),
        createAgentCapabilities('agent-2', 'test', [
          createCapability('shell', true),
          createCapability('network', true),
        ]),
      ];

      const requirements = createTaskRequirements({
        requiredCapabilities: [requireCapability('shell')],
        preferredCapabilities: [requireCapability('network', { required: false })],
      });

      const match = findBestMatch(agents, requirements);

      expect(match).not.toBeNull();
      expect(match?.agent.agentId).toBe('agent-2');
    });

    it('should return null when no match', () => {
      const agents = [
        createAgentCapabilities('agent-1', 'test', []),
      ];

      const requirements = createTaskRequirements({
        requiredCapabilities: [requireCapability('shell')],
      });

      const match = findBestMatch(agents, requirements);

      expect(match).toBeNull();
    });
  });

  describe('findMatchingAgents', () => {
    it('should find all matching agents sorted by score', () => {
      const agents = [
        createAgentCapabilities('agent-1', 'test', [
          createCapability('shell', true),
        ]),
        createAgentCapabilities('agent-2', 'test', [
          createCapability('shell', true),
          createCapability('network', true),
        ]),
        createAgentCapabilities('agent-3', 'test', []),
      ];

      const requirements = createTaskRequirements({
        requiredCapabilities: [requireCapability('shell')],
        preferredCapabilities: [requireCapability('network', { required: false })],
      });

      const matches = findMatchingAgents(agents, requirements);

      expect(matches).toHaveLength(2);
      expect(matches[0].agent.agentId).toBe('agent-2'); // Higher score first
    });
  });

  describe('explainMismatch', () => {
    it('should explain why agent cannot match', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [
        createCapability('shell', true),
        createCapability('network', true),
      ]);

      const requirements = createTaskRequirements({
        requiredCapabilities: [requireCapability('browser')],
        forbiddenCapabilities: ['network'],
      });

      const explanations = explainMismatch(agent, requirements);

      expect(explanations.length).toBeGreaterThan(0);
      expect(explanations.some(e => e.includes('browser'))).toBe(true);
      expect(explanations.some(e => e.includes('network'))).toBe(true);
    });

    it('should indicate success when matches', () => {
      const agent = createAgentCapabilities('agent-1', 'test', [
        createCapability('shell', true),
      ]);

      const requirements = createTaskRequirements({
        requiredCapabilities: [requireCapability('shell')],
      });

      const explanations = explainMismatch(agent, requirements);

      expect(explanations[0]).toContain('fulfill');
    });
  });
});

describe('STANDARD_CAPABILITIES', () => {
  it('should define standard capability names', () => {
    expect(STANDARD_CAPABILITIES.NETWORK).toBe('network');
    expect(STANDARD_CAPABILITIES.FILESYSTEM).toBe('filesystem');
    expect(STANDARD_CAPABILITIES.SHELL).toBe('shell');
    expect(STANDARD_CAPABILITIES.BROWSER).toBe('browser');
    expect(STANDARD_CAPABILITIES.DOCKER).toBe('docker');
    expect(STANDARD_CAPABILITIES.TOOL_USE).toBe('tool-use');
  });
});
