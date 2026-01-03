/**
 * TaskSpec Loader (v0.2.24)
 *
 * Loads TaskSpec from various sources: files, objects, and profiles.
 *
 * @module task-spec/loader
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import yaml from 'yaml';
import { z } from 'zod';
import {
  taskMetadataSchema,
  goalSpecSchema,
  type TaskSpec,
  type TaskMetadata,
  type TaskSpecBody,
} from '../types/task-spec.js';
import { convergenceConfigSchema, convergenceLimitsSchema } from '../types/convergence.js';
import { gateSchema } from '../types/gate.js';
import { executionSpecSchema, workspaceSpecSchema, sandboxSpecSchema, agentSpecSchema } from '../types/execution-spec.js';
import { deliverySpecSchema, gitSpecSchema, prSpecSchema, notificationSpecSchema } from '../types/delivery-spec.js';

// ═══════════════════════════════════════════════════════════════════════════
// FULL TASKSPEC SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convergence spec schema with gates
 */
const convergenceSpecSchema = z.object({
  strategy: z.enum(['fixed', 'hybrid', 'ralph', 'adaptive', 'manual']),
  config: convergenceConfigSchema.optional(),
  gates: z.array(gateSchema),
  limits: convergenceLimitsSchema,
});

/**
 * Full TaskSpecBody schema
 */
const taskSpecBodySchema = z.object({
  goal: goalSpecSchema,
  convergence: convergenceSpecSchema,
  execution: executionSpecSchema,
  delivery: deliverySpecSchema,
});

/**
 * Full TaskSpec schema for validation
 */
export const taskSpecSchema = z.object({
  apiVersion: z.literal('agentgate.io/v1'),
  kind: z.literal('TaskSpec'),
  metadata: taskMetadataSchema,
  spec: taskSpecBodySchema,
});

// ═══════════════════════════════════════════════════════════════════════════
// LOADER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for loading TaskSpec
 */
export interface LoadOptions {
  /** Validate against schema (default: true) */
  validate?: boolean;
  /** Allow unknown fields (default: false) */
  allowUnknown?: boolean;
}

/**
 * Result of a load operation
 */
export interface LoadResult {
  success: boolean;
  spec?: TaskSpec;
  errors?: string[];
  warnings?: string[];
}

/**
 * TaskSpec loader interface
 */
export interface TaskSpecLoader {
  /** Load from file path (YAML or JSON) */
  loadFromFile(filePath: string, options?: LoadOptions): Promise<LoadResult>;

  /** Load from inline object */
  loadFromObject(obj: unknown, options?: LoadOptions): LoadResult;

  /** Load from named profile */
  loadFromProfile(name: string, options?: LoadOptions): Promise<LoadResult>;

  /** List available profiles */
  listProfiles(): Promise<string[]>;

  /** Save as profile */
  saveProfile(name: string, spec: TaskSpec): Promise<void>;

  /** Delete a profile */
  deleteProfile(name: string): Promise<boolean>;

  /** Get profiles directory path */
  getProfilesDir(): string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default profiles directory
 */
const DEFAULT_PROFILES_DIR = path.join(os.homedir(), '.agentgate', 'taskspecs');

/**
 * Creates a TaskSpec loader
 */
export function createTaskSpecLoader(
  profilesDir: string = DEFAULT_PROFILES_DIR
): TaskSpecLoader {
  return {
    async loadFromFile(filePath: string, options: LoadOptions = {}): Promise<LoadResult> {
      const { validate = true } = options;

      try {
        const absolutePath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(process.cwd(), filePath);

        const content = await fs.readFile(absolutePath, 'utf-8');
        const ext = path.extname(absolutePath).toLowerCase();

        let parsed: unknown;
        if (ext === '.yaml' || ext === '.yml') {
          parsed = yaml.parse(content);
        } else if (ext === '.json') {
          parsed = JSON.parse(content);
        } else {
          // Try YAML first, fall back to JSON
          try {
            parsed = yaml.parse(content);
          } catch {
            parsed = JSON.parse(content);
          }
        }

        if (validate) {
          return this.loadFromObject(parsed, options);
        }

        return {
          success: true,
          spec: parsed as TaskSpec,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          errors: [`Failed to load file: ${message}`],
        };
      }
    },

    loadFromObject(obj: unknown, options: LoadOptions = {}): LoadResult {
      const { validate = true, allowUnknown = false } = options;
      const warnings: string[] = [];

      if (!validate) {
        return {
          success: true,
          spec: obj as TaskSpec,
        };
      }

      try {
        // Use passthrough if allowing unknown fields
        const schema = allowUnknown
          ? taskSpecSchema.passthrough()
          : taskSpecSchema;

        const parseResult = schema.safeParse(obj);

        if (!parseResult.success) {
          const errors = parseResult.error.errors.map((err) => {
            const path = err.path.join('.');
            return path ? `${path}: ${err.message}` : err.message;
          });
          return {
            success: false,
            errors,
          };
        }

        // Check for deprecated fields and add warnings
        const spec = parseResult.data as TaskSpec;

        // Future: Add deprecation warnings here
        // if (spec.spec.someLegacyField) {
        //   warnings.push('someLegacyField is deprecated, use newField instead');
        // }

        const loadResult: LoadResult = {
          success: true,
          spec,
        };
        if (warnings.length > 0) {
          loadResult.warnings = warnings;
        }
        return loadResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          errors: [`Validation error: ${message}`],
        };
      }
    },

    async loadFromProfile(name: string, options: LoadOptions = {}): Promise<LoadResult> {
      const profilePath = path.join(profilesDir, `${name}.yaml`);

      try {
        await fs.access(profilePath);
      } catch {
        // Try JSON extension
        const jsonPath = path.join(profilesDir, `${name}.json`);
        try {
          await fs.access(jsonPath);
          return this.loadFromFile(jsonPath, options);
        } catch {
          return {
            success: false,
            errors: [`Profile not found: ${name}`],
          };
        }
      }

      return this.loadFromFile(profilePath, options);
    },

    async listProfiles(): Promise<string[]> {
      try {
        await fs.mkdir(profilesDir, { recursive: true });
        const files = await fs.readdir(profilesDir);

        return files
          .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'))
          .map((f) => path.basename(f, path.extname(f)));
      } catch {
        return [];
      }
    },

    async saveProfile(name: string, spec: TaskSpec): Promise<void> {
      await fs.mkdir(profilesDir, { recursive: true });
      const profilePath = path.join(profilesDir, `${name}.yaml`);
      const content = yaml.stringify(spec);
      await fs.writeFile(profilePath, content, 'utf-8');
    },

    async deleteProfile(name: string): Promise<boolean> {
      const profilePath = path.join(profilesDir, `${name}.yaml`);

      try {
        await fs.unlink(profilePath);
        return true;
      } catch {
        // Try JSON extension
        const jsonPath = path.join(profilesDir, `${name}.json`);
        try {
          await fs.unlink(jsonPath);
          return true;
        } catch {
          return false;
        }
      }
    },

    getProfilesDir(): string {
      return profilesDir;
    },
  };
}

/**
 * Default loader instance
 */
let defaultLoader: TaskSpecLoader | null = null;

/**
 * Get the default TaskSpec loader
 */
export function getDefaultLoader(): TaskSpecLoader {
  if (!defaultLoader) {
    defaultLoader = createTaskSpecLoader();
  }
  return defaultLoader;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load TaskSpec from a file
 */
export async function loadTaskSpec(
  filePath: string,
  options?: LoadOptions
): Promise<LoadResult> {
  return getDefaultLoader().loadFromFile(filePath, options);
}

/**
 * Parse and validate a TaskSpec object
 */
export function parseTaskSpec(
  obj: unknown,
  options?: LoadOptions
): LoadResult {
  return getDefaultLoader().loadFromObject(obj, options);
}

/**
 * Load TaskSpec from a named profile
 */
export async function loadProfile(
  name: string,
  options?: LoadOptions
): Promise<LoadResult> {
  return getDefaultLoader().loadFromProfile(name, options);
}
