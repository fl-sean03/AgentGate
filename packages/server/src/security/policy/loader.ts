/**
 * Security Policy Engine - Policy Loader
 *
 * Functions for loading security policies from YAML files.
 */

import { readFile, readdir, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';
import { SecurityPolicy } from '../types.js';
import { securityPolicySchema, partialSecurityPolicySchema } from '../schemas.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('security-policy-loader');

// ============================================================================
// Configuration Paths
// ============================================================================

/**
 * Get the user's AgentGate security directory.
 */
export function getSecurityProfileDir(): string {
  return join(homedir(), '.agentgate', 'security');
}

/**
 * Get the project security policy path.
 */
export function getProjectPolicyPath(workspaceDir: string): string {
  return join(workspaceDir, '.agentgate', 'security.yaml');
}

/**
 * Get a user profile policy path.
 */
export function getProfilePolicyPath(profileName: string): string {
  return join(getSecurityProfileDir(), `${profileName}.yaml`);
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Check if a file exists and is readable.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Policy Loading Functions
// ============================================================================

/**
 * Load and validate a security policy from a YAML file.
 *
 * @param filePath - Path to the YAML file
 * @returns Validated SecurityPolicy
 * @throws Error if file cannot be read or validation fails
 */
export async function loadPolicyFromFile(filePath: string): Promise<SecurityPolicy> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = YAML.parse(content);

  const result = securityPolicySchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid security policy in ${filePath}: ${errors}`);
  }

  return result.data as SecurityPolicy;
}

/**
 * Load a partial security policy from a YAML file (for merging).
 *
 * @param filePath - Path to the YAML file
 * @returns Partial policy object
 * @throws Error if file cannot be read or validation fails
 */
export async function loadPartialPolicyFromFile(
  filePath: string
): Promise<Partial<SecurityPolicy>> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = YAML.parse(content);

  const result = partialSecurityPolicySchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid security policy in ${filePath}: ${errors}`);
  }

  return result.data as Partial<SecurityPolicy>;
}

/**
 * Load the project-specific security policy.
 *
 * @param workspaceDir - Workspace directory path
 * @returns SecurityPolicy if found and valid, null otherwise
 */
export async function loadProjectPolicy(
  workspaceDir: string
): Promise<Partial<SecurityPolicy> | null> {
  const policyPath = getProjectPolicyPath(workspaceDir);

  if (!(await fileExists(policyPath))) {
    logger.debug({ workspaceDir }, 'No project security policy found');
    return null;
  }

  try {
    const policy = await loadPartialPolicyFromFile(policyPath);
    logger.info({ workspaceDir, policyPath }, 'Loaded project security policy');
    return policy;
  } catch (error) {
    logger.warn(
      { workspaceDir, policyPath, err: error },
      'Failed to load project security policy, using defaults'
    );
    return null;
  }
}

/**
 * Load a user profile security policy.
 *
 * @param profileName - Name of the profile (without .yaml extension)
 * @returns SecurityPolicy if found and valid, null otherwise
 */
export async function loadProfilePolicy(
  profileName: string
): Promise<Partial<SecurityPolicy> | null> {
  const policyPath = getProfilePolicyPath(profileName);

  if (!(await fileExists(policyPath))) {
    logger.warn({ profileName, policyPath }, 'Security profile not found');
    return null;
  }

  try {
    const policy = await loadPartialPolicyFromFile(policyPath);
    logger.info({ profileName, policyPath }, 'Loaded security profile');
    return policy;
  } catch (error) {
    logger.warn(
      { profileName, policyPath, err: error },
      'Failed to load security profile'
    );
    return null;
  }
}

/**
 * List all available user security profiles.
 *
 * @returns Array of profile names (without .yaml extension)
 */
export async function listAvailableProfiles(): Promise<string[]> {
  const profileDir = getSecurityProfileDir();

  if (!(await fileExists(profileDir))) {
    return [];
  }

  try {
    const files = await readdir(profileDir);
    return files
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => f.replace(/\.yaml$/, ''));
  } catch (error) {
    logger.warn({ profileDir, err: error }, 'Failed to list security profiles');
    return [];
  }
}
