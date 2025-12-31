/**
 * Parser for verify.yaml profile files.
 */

import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { verifyProfileSchema, type VerifyProfile } from '../types/index.js';
import { ProfileParseError, ProfileValidationError } from './errors.js';

/**
 * Search locations for verify.yaml, relative to workspace root.
 */
const PROFILE_SEARCH_PATHS = [
  'verify.yaml',
  '.agentgate/verify.yaml',
  'agentgate/verify.yaml',
];

/**
 * Parse verify.yaml content into a VerifyProfile.
 * @param content - Raw YAML content string
 * @returns Parsed and validated VerifyProfile
 * @throws ProfileParseError if YAML parsing fails
 * @throws ProfileValidationError if validation fails
 */
export function parseVerifyProfile(content: string): VerifyProfile {
  let parsed: unknown;

  try {
    parsed = parseYaml(content);
  } catch (error) {
    throw new ProfileParseError(
      '<string>',
      error instanceof Error ? error : new Error(String(error))
    );
  }

  return validateProfile(parsed);
}

/**
 * Validate an unknown object as a VerifyProfile.
 * @param profile - Unknown object to validate
 * @returns Validated VerifyProfile
 * @throws ProfileValidationError if validation fails
 */
export function validateProfile(profile: unknown): VerifyProfile {
  try {
    return verifyProfileSchema.parse(profile);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationErrors = error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      throw new ProfileValidationError(null, validationErrors);
    }
    throw error;
  }
}

/**
 * Find the path to a verify.yaml file in the workspace.
 * @param workspacePath - Path to the workspace root
 * @returns Path to the verify.yaml file, or null if not found
 */
export async function findProfilePath(workspacePath: string): Promise<string | null> {
  for (const relativePath of PROFILE_SEARCH_PATHS) {
    const fullPath = join(workspacePath, relativePath);
    try {
      await access(fullPath);
      return fullPath;
    } catch {
      // File doesn't exist, continue searching
    }
  }
  return null;
}

/**
 * Load and parse a verify.yaml file from the workspace.
 * @param workspacePath - Path to the workspace root
 * @returns Parsed VerifyProfile, or null if no profile found
 * @throws ProfileParseError if YAML parsing fails
 * @throws ProfileValidationError if validation fails
 */
export async function loadVerifyProfile(workspacePath: string): Promise<VerifyProfile | null> {
  const profilePath = await findProfilePath(workspacePath);

  if (!profilePath) {
    return null;
  }

  let content: string;
  try {
    content = await readFile(profilePath, 'utf-8');
  } catch (error) {
    throw new ProfileParseError(
      profilePath,
      error instanceof Error ? error : new Error(String(error))
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (error) {
    throw new ProfileParseError(
      profilePath,
      error instanceof Error ? error : new Error(String(error))
    );
  }

  try {
    return verifyProfileSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationErrors = error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      throw new ProfileValidationError(profilePath, validationErrors);
    }
    throw error;
  }
}

/**
 * Get the search paths for verify.yaml files.
 * @param workspacePath - Path to the workspace root
 * @returns Array of absolute paths that would be searched
 */
export function getSearchPaths(workspacePath: string): string[] {
  return PROFILE_SEARCH_PATHS.map((p) => join(workspacePath, p));
}
