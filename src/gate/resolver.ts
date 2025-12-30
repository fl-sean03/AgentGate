/**
 * Main Gate Resolver module.
 * Resolves a GatePlan from various sources based on preference.
 */

import { GatePlanSource, type GatePlan } from '../types/index.js';
import { loadVerifyProfile, findProfilePath } from './verify-profile-parser.js';
import { ingestCIWorkflows } from './ci-ingestion.js';
import { normalizeFromProfile, createDefaultPlan, mergePlans } from './normalizer.js';
import { ProfileParseError, ProfileValidationError } from './errors.js';

/**
 * Result of resolving a GatePlan.
 */
export interface ResolveResult {
  plan: GatePlan;
  warnings: string[];
}

/**
 * Resolve a GatePlan for a workspace.
 *
 * Resolution order when preference is AUTO:
 * 1. Try verify.yaml profile first
 * 2. Fall back to CI workflow ingestion
 * 3. Fall back to default plan
 *
 * @param workspacePath - Path to the workspace root
 * @param preference - Preferred source for the plan
 * @returns Resolved GatePlan
 */
export async function resolveGatePlan(
  workspacePath: string,
  preference: GatePlanSource = GatePlanSource.AUTO
): Promise<GatePlan> {
  const result = await resolveGatePlanWithWarnings(workspacePath, preference);
  return result.plan;
}

/**
 * Resolve a GatePlan with warnings about fallbacks or issues.
 *
 * @param workspacePath - Path to the workspace root
 * @param preference - Preferred source for the plan
 * @returns ResolveResult with plan and any warnings
 */
export async function resolveGatePlanWithWarnings(
  workspacePath: string,
  preference: GatePlanSource = GatePlanSource.AUTO
): Promise<ResolveResult> {
  const warnings: string[] = [];

  // Handle explicit preferences
  if (preference === GatePlanSource.VERIFY_PROFILE) {
    return resolveFromProfile(workspacePath, warnings);
  }

  if (preference === GatePlanSource.CI_WORKFLOW) {
    return resolveFromCI(workspacePath, warnings);
  }

  if (preference === GatePlanSource.DEFAULT) {
    return {
      plan: createDefaultPlan(),
      warnings: ['Using default plan as explicitly requested'],
    };
  }

  // AUTO mode: try sources in order
  return resolveAuto(workspacePath, warnings);
}

/**
 * Resolve from verify.yaml profile.
 */
async function resolveFromProfile(
  workspacePath: string,
  warnings: string[]
): Promise<ResolveResult> {
  try {
    const profile = await loadVerifyProfile(workspacePath);

    if (!profile) {
      warnings.push('No verify.yaml found, falling back to default plan');
      return {
        plan: createDefaultPlan(),
        warnings,
      };
    }

    const profilePath = await findProfilePath(workspacePath);
    const plan = normalizeFromProfile(profile, profilePath ?? undefined);

    // Merge with default to ensure security policies are present
    const mergedPlan = mergePlans(createDefaultPlan(), plan);
    mergedPlan.source = GatePlanSource.VERIFY_PROFILE;
    mergedPlan.sourceFile = profilePath;

    return { plan: mergedPlan, warnings };
  } catch (error) {
    if (error instanceof ProfileParseError) {
      warnings.push(`Failed to parse verify.yaml: ${error.message}`);
    } else if (error instanceof ProfileValidationError) {
      warnings.push(`Invalid verify.yaml: ${error.validationErrors.join('; ')}`);
    } else {
      warnings.push(`Error loading verify.yaml: ${String(error)}`);
    }

    return {
      plan: createDefaultPlan(),
      warnings,
    };
  }
}

/**
 * Resolve from CI workflows.
 */
async function resolveFromCI(
  workspacePath: string,
  warnings: string[]
): Promise<ResolveResult> {
  try {
    const ciPlan = await ingestCIWorkflows(workspacePath);

    if (!ciPlan) {
      warnings.push('No usable CI workflows found, falling back to default plan');
      return {
        plan: createDefaultPlan(),
        warnings,
      };
    }

    // Merge with default to ensure security policies are present
    const mergedPlan = mergePlans(createDefaultPlan(), ciPlan);

    return { plan: mergedPlan, warnings };
  } catch (error) {
    warnings.push(`Error parsing CI workflows: ${String(error)}`);
    return {
      plan: createDefaultPlan(),
      warnings,
    };
  }
}

/**
 * Auto-resolve: try sources in order of preference.
 */
async function resolveAuto(
  workspacePath: string,
  warnings: string[]
): Promise<ResolveResult> {
  // 1. Try verify.yaml first
  try {
    const profile = await loadVerifyProfile(workspacePath);

    if (profile) {
      const profilePath = await findProfilePath(workspacePath);
      const plan = normalizeFromProfile(profile, profilePath ?? undefined);
      const mergedPlan = mergePlans(createDefaultPlan(), plan);
      mergedPlan.source = GatePlanSource.VERIFY_PROFILE;
      mergedPlan.sourceFile = profilePath;

      return { plan: mergedPlan, warnings };
    }
  } catch (error) {
    if (error instanceof ProfileParseError || error instanceof ProfileValidationError) {
      warnings.push(`verify.yaml found but invalid: ${error.message}`);
    }
    // Continue to next source
  }

  // 2. Try CI workflow ingestion
  try {
    const ciPlan = await ingestCIWorkflows(workspacePath);

    if (ciPlan) {
      warnings.push('No verify.yaml found, using CI workflow configuration');
      const mergedPlan = mergePlans(createDefaultPlan(), ciPlan);
      return { plan: mergedPlan, warnings };
    }
  } catch (error) {
    warnings.push(`CI workflow parsing failed: ${String(error)}`);
    // Continue to default
  }

  // 3. Fall back to default
  warnings.push('No verify.yaml or CI workflows found, using default plan');
  return {
    plan: createDefaultPlan(),
    warnings,
  };
}

/**
 * Quick check if a workspace has any gate configuration.
 * @param workspacePath - Path to the workspace root
 * @returns Object indicating what configurations are available
 */
export async function detectGateConfig(
  workspacePath: string
): Promise<{
  hasVerifyProfile: boolean;
  hasCIWorkflows: boolean;
  profilePath: string | null;
}> {
  const profilePath = await findProfilePath(workspacePath);
  const { findCIConfigs } = await import('./ci-ingestion.js');
  const ciConfigs = await findCIConfigs(workspacePath);

  return {
    hasVerifyProfile: profilePath !== null,
    hasCIWorkflows: ciConfigs.length > 0,
    profilePath,
  };
}
