/**
 * Config Loader Module
 *
 * Provides YAML profile loading with validation for the harness configuration system.
 * Supports the ~/.agentgate/harnesses/ directory structure for profile discovery.
 *
 * @module harness/config-loader
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as YAML from 'yaml';
import { ZodError } from 'zod';
import { harnessConfigSchema, type HarnessConfig } from '../types/harness-config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('config-loader');

// Constants
export const HARNESS_DIR = path.join(os.homedir(), '.agentgate', 'harnesses');
export const DEFAULT_PROFILE_NAME = 'default';
export const PROFILE_EXTENSION = '.yaml';

/**
 * Information about a harness profile
 */
export interface HarnessProfileInfo {
  /** Profile name (without extension) */
  name: string;
  /** Full path to the profile file */
  path: string;
  /** Description from profile metadata */
  description: string | null;
  /** Parent profile name (inheritance) */
  extends: string | null;
}

/**
 * Error thrown when a profile is not found
 */
export class ProfileNotFoundError extends Error {
  constructor(
    public readonly nameOrPath: string,
    public readonly searchPaths: string[]
  ) {
    super(`Profile not found: ${nameOrPath}. Searched: ${searchPaths.join(', ')}`);
    this.name = 'ProfileNotFoundError';
  }
}

/**
 * Error thrown when a profile has invalid YAML syntax
 */
export class ProfileParseError extends Error {
  constructor(
    public readonly profilePath: string,
    public readonly cause: Error
  ) {
    super(`Failed to parse YAML in ${profilePath}: ${cause.message}`);
    this.name = 'ProfileParseError';
  }
}

/**
 * Error thrown when a profile fails schema validation
 */
export class ProfileValidationError extends Error {
  constructor(
    public readonly profilePath: string,
    public readonly zodError: ZodError
  ) {
    const issues = zodError.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    super(`Profile validation failed for ${profilePath}:\n${issues}`);
    this.name = 'ProfileValidationError';
  }
}

/**
 * Lists all available profiles from the HARNESS_DIR
 *
 * @returns Array of profile info objects
 */
export async function listProfiles(): Promise<HarnessProfileInfo[]> {
  try {
    const entries = await fs.readdir(HARNESS_DIR, { withFileTypes: true });
    const profiles: HarnessProfileInfo[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(PROFILE_EXTENSION)) {
        continue;
      }

      const profilePath = path.join(HARNESS_DIR, entry.name);
      const profileName = entry.name.slice(0, -PROFILE_EXTENSION.length);

      try {
        const content = await fs.readFile(profilePath, 'utf-8');
        const parsed = YAML.parse(content) as Record<string, unknown> | null;

        // Extract metadata with type guards
        const desc = parsed?.description;
        const ext = parsed?.extends;

        profiles.push({
          name: profileName,
          path: profilePath,
          description: typeof desc === 'string' ? desc : null,
          extends: typeof ext === 'string' ? ext : null,
        });
      } catch (err) {
        // Log but don't fail - include profile with minimal info
        logger.warn({ profilePath, err }, 'Failed to parse profile metadata');
        profiles.push({
          name: profileName,
          path: profilePath,
          description: null,
          extends: null,
        });
      }
    }

    return profiles;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Directory doesn't exist - return empty array
      logger.debug({ dir: HARNESS_DIR }, 'Harness directory does not exist');
      return [];
    }
    throw err;
  }
}

/**
 * Resolves a profile name or path to an absolute file path
 *
 * @param nameOrPath - Profile name, relative path, or absolute path
 * @returns The resolved absolute path
 */
function resolveProfilePath(nameOrPath: string): string {
  // If it's an absolute path, use it directly
  if (path.isAbsolute(nameOrPath)) {
    return nameOrPath;
  }

  // If it has an extension, treat as relative path
  if (nameOrPath.endsWith(PROFILE_EXTENSION)) {
    return path.resolve(process.cwd(), nameOrPath);
  }

  // Otherwise, look up in HARNESS_DIR by name
  return path.join(HARNESS_DIR, `${nameOrPath}${PROFILE_EXTENSION}`);
}

/**
 * Loads and validates a profile from the given name or path
 *
 * @param nameOrPath - Profile name, relative path, or absolute path
 * @returns Validated HarnessConfig
 * @throws ProfileNotFoundError if the profile doesn't exist
 * @throws ProfileParseError if the YAML is invalid
 * @throws ProfileValidationError if the profile fails schema validation
 */
export async function loadProfile(nameOrPath: string): Promise<HarnessConfig> {
  const profilePath = resolveProfilePath(nameOrPath);
  const searchPaths = [profilePath];

  logger.debug({ nameOrPath, profilePath }, 'Loading profile');

  // Read file
  let content: string;
  try {
    content = await fs.readFile(profilePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProfileNotFoundError(nameOrPath, searchPaths);
    }
    throw err;
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (err) {
    throw new ProfileParseError(profilePath, err as Error);
  }

  // Validate against schema
  const result = harnessConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProfileValidationError(profilePath, result.error);
  }

  logger.debug({ profilePath, config: result.data }, 'Profile loaded successfully');
  return result.data;
}

/**
 * Checks if a profile exists in the HARNESS_DIR
 *
 * @param name - Profile name (without extension)
 * @returns True if the profile exists
 */
export async function profileExists(name: string): Promise<boolean> {
  const profilePath = path.join(HARNESS_DIR, `${name}${PROFILE_EXTENSION}`);
  try {
    await fs.access(profilePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves a profile to the HARNESS_DIR
 *
 * @param name - Profile name (without extension)
 * @param config - Configuration to save
 * @throws ProfileValidationError if the config fails schema validation
 */
export async function saveProfile(name: string, config: HarnessConfig): Promise<void> {
  // Validate before saving
  const result = harnessConfigSchema.safeParse(config);
  if (!result.success) {
    const profilePath = path.join(HARNESS_DIR, `${name}${PROFILE_EXTENSION}`);
    throw new ProfileValidationError(profilePath, result.error);
  }

  // Ensure directory exists
  await ensureHarnessDir();

  // Serialize and write
  const profilePath = path.join(HARNESS_DIR, `${name}${PROFILE_EXTENSION}`);
  const yamlContent = YAML.stringify(result.data, { indent: 2 });

  await fs.writeFile(profilePath, yamlContent, 'utf-8');
  logger.info({ profilePath, name }, 'Profile saved');
}

/**
 * Ensures the harness directory exists, creating it if necessary
 */
export async function ensureHarnessDir(): Promise<void> {
  try {
    await fs.mkdir(HARNESS_DIR, { recursive: true });
    logger.debug({ dir: HARNESS_DIR }, 'Ensured harness directory exists');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Deletes a profile from the HARNESS_DIR
 * (v0.2.17 - Thrust 2)
 *
 * @param name - Profile name (without extension)
 * @throws ProfileNotFoundError if the profile doesn't exist
 */
export async function deleteProfile(name: string): Promise<void> {
  const profilePath = path.join(HARNESS_DIR, `${name}${PROFILE_EXTENSION}`);

  try {
    await fs.unlink(profilePath);
    logger.info({ profilePath, name }, 'Profile deleted');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProfileNotFoundError(name, [profilePath]);
    }
    throw err;
  }
}
