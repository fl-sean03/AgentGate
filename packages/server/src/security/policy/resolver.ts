/**
 * Security Policy Engine - Policy Resolver
 *
 * Functions for resolving and merging security policies with inheritance support.
 */

import { createHash } from 'crypto';
import {
  SecurityPolicy,
  ResolvedSecurityPolicy,
  DetectorConfig,
  RuntimeConfig,
  AuditConfig,
  EnforcementMap,
  AllowlistEntry,
} from '../types.js';
import {
  DEFAULT_POLICY,
  getBuiltinPolicy,
  isBuiltinProfile,
} from './defaults.js';
import { loadProjectPolicy, loadProfilePolicy, loadPartialPolicyFromFile, getProfilePolicyPath } from './loader.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('security-policy-resolver');

// ============================================================================
// Policy Merging
// ============================================================================

/**
 * Merge two detector arrays.
 * Override detector replaces base detector of the same type.
 * New detector types from override are added.
 *
 * @param base - Base detector configurations
 * @param override - Override detector configurations
 * @returns Merged detector array
 */
export function mergeDetectors(
  base: DetectorConfig[],
  override: DetectorConfig[]
): DetectorConfig[] {
  const result = new Map<string, DetectorConfig>();

  // Add all base detectors
  for (const detector of base) {
    result.set(detector.type, { ...detector });
  }

  // Override or add from override array
  for (const detector of override) {
    const existing = result.get(detector.type);
    if (existing) {
      // Deep merge detector config
      result.set(detector.type, {
        ...existing,
        ...detector,
        options: {
          ...existing.options,
          ...detector.options,
        },
      });
    } else {
      result.set(detector.type, { ...detector });
    }
  }

  return Array.from(result.values());
}

/**
 * Merge two enforcement maps.
 * Override values win per key.
 *
 * @param base - Base enforcement mapping
 * @param override - Partial override mapping
 * @returns Merged enforcement map
 */
export function mergeEnforcement(
  base: EnforcementMap,
  override: Partial<EnforcementMap>
): EnforcementMap {
  return {
    ...base,
    ...override,
  };
}

/**
 * Merge two allowlist arrays.
 * Entries are concatenated (not deduplicated).
 *
 * @param base - Base allowlist entries
 * @param override - Additional allowlist entries
 * @returns Merged allowlist array
 */
export function mergeAllowlist(
  base: AllowlistEntry[],
  override: AllowlistEntry[]
): AllowlistEntry[] {
  return [...base, ...override];
}

/**
 * Merge two exclude arrays.
 * Patterns are merged and deduplicated.
 *
 * @param base - Base exclude patterns
 * @param override - Additional exclude patterns
 * @returns Merged and deduplicated exclude array
 */
export function mergeExcludes(base: string[], override: string[]): string[] {
  return [...new Set([...base, ...override])];
}

/**
 * Merge runtime configurations.
 *
 * @param base - Base runtime config
 * @param override - Partial override config
 * @returns Merged runtime config
 */
export function mergeRuntimeConfig(
  base: RuntimeConfig,
  override: Partial<RuntimeConfig>
): RuntimeConfig {
  return {
    ...base,
    ...override,
  };
}

/**
 * Merge audit configurations.
 *
 * @param base - Base audit config
 * @param override - Partial override config
 * @returns Merged audit config
 */
export function mergeAuditConfig(
  base: AuditConfig,
  override: Partial<AuditConfig>
): AuditConfig {
  return {
    ...base,
    ...override,
  };
}

/**
 * Merge two security policies.
 *
 * Merge rules:
 * - Scalars: override wins
 * - Detectors: override replaces same type, adds new types
 * - Allowlist: concatenate
 * - Excludes: merge and deduplicate
 * - Enforcement: override per key
 * - Runtime/Audit: deep merge
 *
 * @param base - Base policy
 * @param override - Override policy (partial)
 * @returns Merged policy
 */
export function mergePolicies(
  base: SecurityPolicy,
  override: Partial<SecurityPolicy>
): SecurityPolicy {
  // Determine extends value - only include if it exists
  const extendsValue = override.extends ?? base.extends;

  const result: SecurityPolicy = {
    version: '1.0',
    name: override.name ?? base.name,
    detectors: override.detectors
      ? mergeDetectors(base.detectors, override.detectors)
      : base.detectors,
    enforcement: override.enforcement
      ? mergeEnforcement(base.enforcement, override.enforcement)
      : base.enforcement,
    allowlist: override.allowlist
      ? mergeAllowlist(base.allowlist, override.allowlist)
      : base.allowlist,
    excludes: override.excludes
      ? mergeExcludes(base.excludes, override.excludes)
      : base.excludes,
    runtime: override.runtime
      ? mergeRuntimeConfig(base.runtime, override.runtime)
      : base.runtime,
    audit: override.audit
      ? mergeAuditConfig(base.audit, override.audit)
      : base.audit,
  };

  // Only add extends if it has a value
  if (extendsValue !== undefined) {
    result.extends = extendsValue;
  }

  return result;
}

// ============================================================================
// Inheritance Handling
// ============================================================================

/**
 * Handle policy inheritance by recursively loading and merging parent policies.
 *
 * @param policy - Policy with potential extends field
 * @param inheritanceChain - Current inheritance chain (for cycle detection)
 * @returns Fully resolved policy with all inheritance applied
 * @throws Error on circular inheritance
 */
export async function handleInheritance(
  policy: Partial<SecurityPolicy>,
  inheritanceChain: string[] = []
): Promise<{ policy: SecurityPolicy; chain: string[] }> {
  const policyName = policy.name ?? 'unnamed';

  // Check for circular inheritance
  if (inheritanceChain.includes(policyName)) {
    throw new Error(
      `Circular inheritance detected: ${[...inheritanceChain, policyName].join(' -> ')}`
    );
  }

  const newChain = [...inheritanceChain, policyName];

  // If no extends, merge with default policy
  if (!policy.extends) {
    return {
      policy: mergePolicies(DEFAULT_POLICY, policy),
      chain: newChain,
    };
  }

  const parentName = policy.extends;

  // Load parent policy
  let parentPolicy: SecurityPolicy;
  let parentChain: string[];

  if (isBuiltinProfile(parentName)) {
    // Built-in profile
    parentPolicy = getBuiltinPolicy(parentName);
    parentChain = [parentName];
  } else {
    // Try to load from user profiles
    const profilePath = getProfilePolicyPath(parentName);
    try {
      const loadedParent = await loadPartialPolicyFromFile(profilePath);
      const resolved = await handleInheritance(loadedParent, newChain);
      parentPolicy = resolved.policy;
      parentChain = resolved.chain;
    } catch (error) {
      logger.warn(
        { parentName, err: error },
        `Failed to load parent policy "${parentName}", using default`
      );
      parentPolicy = DEFAULT_POLICY;
      parentChain = ['default'];
    }
  }

  // Merge parent with current
  return {
    policy: mergePolicies(parentPolicy, policy),
    chain: [...parentChain, ...newChain],
  };
}

// ============================================================================
// Policy Hash
// ============================================================================

/**
 * Compute a SHA-256 hash of a security policy for audit comparison.
 *
 * @param policy - Policy to hash
 * @returns Hex string hash
 */
export function computePolicyHash(policy: SecurityPolicy): string {
  // Serialize with sorted keys for consistent hashing
  const serialized = JSON.stringify(policy, Object.keys(policy).sort());
  return createHash('sha256').update(serialized).digest('hex');
}

// ============================================================================
// Policy Resolution
// ============================================================================

/**
 * Resolve the complete security policy for a workspace.
 *
 * Resolution order:
 * 1. Start with DEFAULT_POLICY
 * 2. If profileName specified, load and merge profile policy
 * 3. Load and merge project policy if exists
 * 4. Handle inheritance chain
 * 5. Compute hash and add metadata
 *
 * @param workspaceDir - Workspace directory path
 * @param profileName - Optional profile name to apply
 * @returns Fully resolved security policy with metadata
 */
export async function resolveSecurityPolicy(
  workspaceDir: string,
  profileName?: string
): Promise<ResolvedSecurityPolicy> {
  let currentPolicy: SecurityPolicy = { ...DEFAULT_POLICY };
  const sources: string[] = ['default'];

  // Apply profile if specified
  if (profileName) {
    if (isBuiltinProfile(profileName)) {
      currentPolicy = mergePolicies(currentPolicy, getBuiltinPolicy(profileName));
      sources.push(profileName);
    } else {
      const profilePolicy = await loadProfilePolicy(profileName);
      if (profilePolicy) {
        // Handle inheritance from profile
        if (profilePolicy.extends) {
          const resolved = await handleInheritance(profilePolicy, []);
          currentPolicy = resolved.policy;
          sources.push(...resolved.chain);
        } else {
          currentPolicy = mergePolicies(currentPolicy, profilePolicy);
          sources.push(profileName);
        }
      }
    }
  }

  // Apply project policy if exists
  const projectPolicy = await loadProjectPolicy(workspaceDir);
  if (projectPolicy) {
    // Handle inheritance from project policy
    if (projectPolicy.extends) {
      const resolved = await handleInheritance(projectPolicy, sources);
      currentPolicy = resolved.policy;
      sources.push(...resolved.chain.filter((s) => !sources.includes(s)));
    } else {
      currentPolicy = mergePolicies(currentPolicy, projectPolicy);
      sources.push('project');
    }
  }

  // Build resolved policy
  const resolvedPolicy: ResolvedSecurityPolicy = {
    ...currentPolicy,
    source: sources[sources.length - 1] ?? 'default',
    inheritanceChain: sources,
    resolvedAt: new Date(),
    hash: computePolicyHash(currentPolicy),
  };

  logger.info(
    {
      workspaceDir,
      profileName,
      source: resolvedPolicy.source,
      inheritanceChain: resolvedPolicy.inheritanceChain,
      hash: resolvedPolicy.hash,
    },
    'Resolved security policy'
  );

  return resolvedPolicy;
}
