/**
 * Agent Capability Matcher
 * Matches agent capabilities against task requirements.
 *
 * (v0.2.27 - Thrust 15: Agent Capability Negotiation)
 */

import { createLogger } from '../utils/logger.js';
import {
  type AgentCapabilities,
  type TaskRequirements,
  type CapabilityRequirement,
  type Capability,
  hasCapability,
  getCapability,
  getEnabledCapabilities,
} from './capabilities.js';

const log = createLogger('capability-matcher');

/**
 * Match result for a single capability
 */
export interface CapabilityMatchResult {
  /** Capability name */
  name: string;
  /** Whether requirement was satisfied */
  satisfied: boolean;
  /** Whether this was a required capability */
  required: boolean;
  /** Reason for failure if not satisfied */
  reason?: string;
}

/**
 * Overall match result
 */
export interface MatchResult {
  /** Whether agent can fulfill the requirements */
  canFulfill: boolean;
  /** Overall match score (0-100) */
  score: number;
  /** Results for individual capabilities */
  capabilityResults: CapabilityMatchResult[];
  /** Unsatisfied required capabilities */
  missingRequired: string[];
  /** Unsatisfied preferred capabilities */
  missingPreferred: string[];
  /** Forbidden capabilities that agent has */
  hasForbidden: string[];
  /** Human-readable explanation */
  reason: string;
}

/**
 * Compare semantic versions (simple implementation)
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

/**
 * Check if a version meets minimum requirement
 */
function meetsMinVersion(actual: string | undefined, required: string | undefined): boolean {
  if (!required) return true;
  if (!actual) return false;
  return compareVersions(actual, required) >= 0;
}

/**
 * Check if a single capability requirement is satisfied
 */
function checkCapabilityRequirement(
  agentCaps: Capability[],
  requirement: CapabilityRequirement
): CapabilityMatchResult {
  const capability = getCapability(agentCaps, requirement.name);

  // Check if capability exists and is enabled
  if (!capability || !capability.enabled) {
    return {
      name: requirement.name,
      satisfied: false,
      required: requirement.required,
      reason: `Capability '${requirement.name}' not available`,
    };
  }

  // Check version requirement
  if (requirement.minVersion && !meetsMinVersion(capability.version, requirement.minVersion)) {
    return {
      name: requirement.name,
      satisfied: false,
      required: requirement.required,
      reason: `Capability '${requirement.name}' version ${capability.version} does not meet minimum ${requirement.minVersion}`,
    };
  }

  // Check config requirements (if any)
  if (requirement.config) {
    for (const [key, value] of Object.entries(requirement.config)) {
      if (capability.config?.[key] !== value) {
        return {
          name: requirement.name,
          satisfied: false,
          required: requirement.required,
          reason: `Capability '${requirement.name}' config mismatch for '${key}'`,
        };
      }
    }
  }

  return {
    name: requirement.name,
    satisfied: true,
    required: requirement.required,
  };
}

/**
 * Check if agent capabilities can fulfill task requirements
 */
export function canFulfill(
  agent: AgentCapabilities,
  requirements: TaskRequirements
): boolean {
  const result = matchCapabilities(agent, requirements);
  return result.canFulfill;
}

/**
 * Get reason why agent can or cannot fulfill requirements
 */
export function getMatchReason(
  agent: AgentCapabilities,
  requirements: TaskRequirements
): string {
  const result = matchCapabilities(agent, requirements);
  return result.reason;
}

/**
 * Match agent capabilities against task requirements
 */
export function matchCapabilities(
  agent: AgentCapabilities,
  requirements: TaskRequirements
): MatchResult {
  const results: CapabilityMatchResult[] = [];
  const missingRequired: string[] = [];
  const missingPreferred: string[] = [];
  const hasForbidden: string[] = [];

  // Check required capabilities
  if (requirements.requiredCapabilities) {
    for (const req of requirements.requiredCapabilities) {
      const result = checkCapabilityRequirement(agent.capabilities, req);
      results.push(result);
      if (!result.satisfied) {
        missingRequired.push(req.name);
      }
    }
  }

  // Check preferred capabilities
  if (requirements.preferredCapabilities) {
    for (const req of requirements.preferredCapabilities) {
      const result = checkCapabilityRequirement(agent.capabilities, req);
      results.push(result);
      if (!result.satisfied) {
        missingPreferred.push(req.name);
      }
    }
  }

  // Check forbidden capabilities
  if (requirements.forbiddenCapabilities) {
    for (const forbidden of requirements.forbiddenCapabilities) {
      if (hasCapability(agent.capabilities, forbidden)) {
        hasForbidden.push(forbidden);
      }
    }
  }

  // Check minimum tokens
  if (requirements.minTokens && agent.maxTokens) {
    if (agent.maxTokens < requirements.minTokens) {
      missingRequired.push(`tokens:${requirements.minTokens}`);
      results.push({
        name: 'minTokens',
        satisfied: false,
        required: true,
        reason: `Agent max tokens (${agent.maxTokens}) less than required (${requirements.minTokens})`,
      });
    }
  }

  // Check required languages
  if (requirements.requiredLanguages && agent.supportedLanguages) {
    for (const lang of requirements.requiredLanguages) {
      if (!agent.supportedLanguages.includes(lang)) {
        missingRequired.push(`language:${lang}`);
        results.push({
          name: `language:${lang}`,
          satisfied: false,
          required: true,
          reason: `Language '${lang}' not supported`,
        });
      }
    }
  }

  // Determine if can fulfill
  const canFulfill = missingRequired.length === 0 && hasForbidden.length === 0;

  // Calculate score
  const score = calculateMatchScore(results, missingRequired, missingPreferred, hasForbidden);

  // Generate reason
  const reason = generateReason(canFulfill, missingRequired, missingPreferred, hasForbidden);

  const matchResult: MatchResult = {
    canFulfill,
    score,
    capabilityResults: results,
    missingRequired,
    missingPreferred,
    hasForbidden,
    reason,
  };

  log.debug(
    {
      agentId: agent.agentId,
      canFulfill,
      score,
      missingRequired,
      hasForbidden,
    },
    'Capability match result'
  );

  return matchResult;
}

/**
 * Calculate match score (0-100)
 */
function calculateMatchScore(
  results: CapabilityMatchResult[],
  missingRequired: string[],
  missingPreferred: string[],
  hasForbidden: string[]
): number {
  // Can't fulfill = score of 0
  if (missingRequired.length > 0 || hasForbidden.length > 0) {
    return 0;
  }

  // Start at 100, subtract for missing preferred
  const totalPreferred = results.filter(r => !r.required).length;
  const satisfiedPreferred = results.filter(r => !r.required && r.satisfied).length;

  if (totalPreferred === 0) return 100;

  const preferredScore = (satisfiedPreferred / totalPreferred) * 100;
  return Math.round(preferredScore);
}

/**
 * Generate human-readable reason
 */
function generateReason(
  canFulfill: boolean,
  missingRequired: string[],
  missingPreferred: string[],
  hasForbidden: string[]
): string {
  if (canFulfill) {
    if (missingPreferred.length === 0) {
      return 'Agent fully satisfies all requirements';
    }
    return `Agent satisfies requirements but lacks preferred: ${missingPreferred.join(', ')}`;
  }

  const reasons: string[] = [];

  if (missingRequired.length > 0) {
    reasons.push(`Missing required capabilities: ${missingRequired.join(', ')}`);
  }

  if (hasForbidden.length > 0) {
    reasons.push(`Has forbidden capabilities: ${hasForbidden.join(', ')}`);
  }

  return reasons.join('; ');
}

/**
 * Find the best matching agent from a list
 */
export function findBestMatch(
  agents: AgentCapabilities[],
  requirements: TaskRequirements
): { agent: AgentCapabilities; result: MatchResult } | null {
  let bestAgent: AgentCapabilities | null = null;
  let bestResult: MatchResult | null = null;
  let bestScore = -1;

  for (const agent of agents) {
    const result = matchCapabilities(agent, requirements);

    if (result.canFulfill && result.score > bestScore) {
      bestAgent = agent;
      bestResult = result;
      bestScore = result.score;
    }
  }

  if (bestAgent && bestResult) {
    log.info(
      { agentId: bestAgent.agentId, score: bestResult.score },
      'Found best matching agent'
    );
    return { agent: bestAgent, result: bestResult };
  }

  log.warn('No agent found matching requirements');
  return null;
}

/**
 * Get all agents that can fulfill requirements
 */
export function findMatchingAgents(
  agents: AgentCapabilities[],
  requirements: TaskRequirements
): Array<{ agent: AgentCapabilities; result: MatchResult }> {
  const matches: Array<{ agent: AgentCapabilities; result: MatchResult }> = [];

  for (const agent of agents) {
    const result = matchCapabilities(agent, requirements);
    if (result.canFulfill) {
      matches.push({ agent, result });
    }
  }

  // Sort by score (highest first)
  matches.sort((a, b) => b.result.score - a.result.score);

  return matches;
}

/**
 * Explain why an agent cannot fulfill requirements
 */
export function explainMismatch(
  agent: AgentCapabilities,
  requirements: TaskRequirements
): string[] {
  const result = matchCapabilities(agent, requirements);

  if (result.canFulfill) {
    return ['Agent can fulfill all requirements'];
  }

  const explanations: string[] = [];

  for (const capResult of result.capabilityResults) {
    if (!capResult.satisfied && capResult.reason) {
      explanations.push(capResult.reason);
    }
  }

  if (result.hasForbidden.length > 0) {
    explanations.push(
      `Agent has forbidden capabilities: ${result.hasForbidden.join(', ')}`
    );
  }

  return explanations;
}
