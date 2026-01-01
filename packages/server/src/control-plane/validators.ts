import { z, ZodError, type ZodSchema } from 'zod';
import {
  submitRequestSchema,
  listFiltersSchema,
  WorkOrderStatus,
  AgentType,
  GatePlanSource,
  WorkspaceTemplate,
  workspaceSourceSchema,
  executionPoliciesSchema,
  VerificationLevel,
} from '../types/index.js';

/**
 * Validation result type.
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Individual validation error.
 */
export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Convert Zod errors to our ValidationError format.
 */
function formatZodErrors(error: ZodError): ValidationError[] {
  return error.errors.map(e => ({
    path: e.path.join('.'),
    message: e.message,
    code: e.code,
  }));
}

/**
 * Generic validation function for Zod schemas.
 */
export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: formatZodErrors(result.error),
  };
}

/**
 * Validate and throw on error.
 */
export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = validate(schema, data);

  if (!result.success) {
    const errorMessages = result.errors
      ?.map(e => `${e.path ? `${e.path}: ` : ''}${e.message}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  return result.data!;
}

// Re-export schemas for convenience
export {
  submitRequestSchema,
  listFiltersSchema,
  workspaceSourceSchema,
  executionPoliciesSchema,
};

/**
 * Validate a submit request.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Complex generic type inference
export function validateSubmitRequest(data: unknown) {
  return validate(submitRequestSchema, data);
}

/**
 * Validate list filters.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Complex generic type inference
export function validateListFilters(data: unknown) {
  return validate(listFiltersSchema, data);
}

/**
 * CLI-specific schemas for command parsing.
 */

/**
 * Schema for submit command options.
 */
export const submitCommandOptionsSchema = z.object({
  prompt: z.string().min(1, 'Task prompt is required').max(10000),
  path: z.string().optional(),
  gitUrl: z.string().url().optional(),
  gitBranch: z.string().optional(),
  fresh: z.string().optional(), // Path for fresh workspace
  template: z.nativeEnum(WorkspaceTemplate).optional(),
  projectName: z.string().optional(),
  // GitHub options (v0.2.4)
  github: z.string().optional(), // owner/repo for existing repo
  githubNew: z.string().optional(), // owner/repo for new repo
  public: z.boolean().default(false), // For github-new - repos are private by default
  waitForCi: z.boolean().default(false), // CI polling (Thrust 16)
  skipVerification: z.array(z.nativeEnum(VerificationLevel)).optional(), // Skip verification levels (v0.2.15)
  agent: z.nativeEnum(AgentType).default(AgentType.CLAUDE_CODE_SUBSCRIPTION),
  maxIterations: z.coerce.number().int().min(1).max(10).default(3),
  maxTime: z.coerce.number().int().min(60).max(86400).default(3600),
  gatePlan: z.nativeEnum(GatePlanSource).default(GatePlanSource.AUTO),
  network: z.boolean().default(false),
});

export type SubmitCommandOptions = z.infer<typeof submitCommandOptionsSchema>;

/**
 * Schema for list command options.
 */
export const listCommandOptionsSchema = z.object({
  status: z.nativeEnum(WorkOrderStatus).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  json: z.boolean().default(false),
});

export type ListCommandOptions = z.infer<typeof listCommandOptionsSchema>;

/**
 * Schema for status command options.
 */
export const statusCommandOptionsSchema = z.object({
  json: z.boolean().default(false),
});

export type StatusCommandOptions = z.infer<typeof statusCommandOptionsSchema>;

/**
 * Schema for cancel command options.
 */
export const cancelCommandOptionsSchema = z.object({
  force: z.boolean().default(false),
});

export type CancelCommandOptions = z.infer<typeof cancelCommandOptionsSchema>;

/**
 * Validate a work order ID.
 */
export const workOrderIdSchema = z.string().min(1, 'Work order ID is required');

export function validateWorkOrderId(id: unknown): ValidationResult<string> {
  return validate(workOrderIdSchema, id);
}

/**
 * Options for workspace source parsing.
 */
export interface WorkspaceSourceOptions {
  path?: string | undefined;
  gitUrl?: string | undefined;
  gitBranch?: string | undefined;
  fresh?: string | undefined;
  template?: WorkspaceTemplate | undefined;
  projectName?: string | undefined;
  // GitHub options (v0.2.4)
  github?: string | undefined; // owner/repo for existing repo
  githubNew?: string | undefined; // owner/repo for new repo
  public?: boolean | undefined; // For github-new - make repo public (default is private)
}

/**
 * Parse owner/repo string into owner and repo parts
 */
function parseOwnerRepo(input: string): { owner: string; repo: string } | null {
  const parts = input.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Parse and validate workspace source from CLI options.
 */
export function parseWorkspaceSource(
  options: WorkspaceSourceOptions
): z.infer<typeof workspaceSourceSchema> {
  // GitHub-new takes priority (v0.2.4)
  if (options.githubNew) {
    const parsed = parseOwnerRepo(options.githubNew);
    if (!parsed) {
      // Will be caught by validation
      return {
        type: 'github-new',
        owner: '',
        repoName: '',
      };
    }
    return {
      type: 'github-new',
      owner: parsed.owner,
      repoName: parsed.repo,
      private: !options.public, // Default to private, --public makes it public
      template: options.template,
    };
  }

  // GitHub existing repo (v0.2.4)
  if (options.github) {
    const parsed = parseOwnerRepo(options.github);
    if (!parsed) {
      // Will be caught by validation
      return {
        type: 'github',
        owner: '',
        repo: '',
      };
    }
    return {
      type: 'github',
      owner: parsed.owner,
      repo: parsed.repo,
      branch: options.gitBranch,
    };
  }

  // Fresh workspace
  if (options.fresh) {
    return {
      type: 'fresh',
      destPath: options.fresh,
      template: options.template,
      projectName: options.projectName,
    };
  }

  if (options.gitUrl) {
    return {
      type: 'git',
      url: options.gitUrl,
      branch: options.gitBranch,
    };
  }

  if (options.path) {
    return {
      type: 'local',
      path: options.path,
    };
  }

  // Default to current directory
  return {
    type: 'local',
    path: process.cwd(),
  };
}

/**
 * Validate workspace source from CLI options.
 */
export function validateWorkspaceSourceOptions(
  options: WorkspaceSourceOptions
): ValidationResult<z.infer<typeof workspaceSourceSchema>> {
  // Count how many source types are specified (v0.2.4: added github options)
  const sourceCount = [
    options.path,
    options.gitUrl,
    options.fresh,
    options.github,
    options.githubNew,
  ].filter(Boolean).length;

  if (sourceCount > 1) {
    return {
      success: false,
      errors: [
        {
          path: '',
          message: 'Cannot specify more than one of --path, --git-url, --fresh, --github, or --github-new',
          code: 'custom',
        },
      ],
    };
  }

  // gitBranch requires gitUrl or github
  if (options.gitBranch && !options.gitUrl && !options.github) {
    return {
      success: false,
      errors: [
        {
          path: 'gitBranch',
          message: '--git-branch requires --git-url or --github',
          code: 'custom',
        },
      ],
    };
  }

  // template requires fresh or github-new
  if (options.template && !options.fresh && !options.githubNew) {
    return {
      success: false,
      errors: [
        {
          path: 'template',
          message: '--template requires --fresh or --github-new',
          code: 'custom',
        },
      ],
    };
  }

  // projectName only works with fresh
  if (options.projectName && !options.fresh) {
    return {
      success: false,
      errors: [
        {
          path: 'projectName',
          message: '--project-name requires --fresh',
          code: 'custom',
        },
      ],
    };
  }

  // --public only works with github-new
  if (options.public && !options.githubNew) {
    return {
      success: false,
      errors: [
        {
          path: 'public',
          message: '--public requires --github-new',
          code: 'custom',
        },
      ],
    };
  }

  // Validate github format (owner/repo)
  if (options.github) {
    const parsed = parseOwnerRepo(options.github);
    if (!parsed) {
      return {
        success: false,
        errors: [
          {
            path: 'github',
            message: 'Invalid format. Expected: owner/repo',
            code: 'custom',
          },
        ],
      };
    }
  }

  // Validate github-new format (owner/repo)
  if (options.githubNew) {
    const parsed = parseOwnerRepo(options.githubNew);
    if (!parsed) {
      return {
        success: false,
        errors: [
          {
            path: 'githubNew',
            message: 'Invalid format. Expected: owner/repo',
            code: 'custom',
          },
        ],
      };
    }
  }

  const source = parseWorkspaceSource(options);
  return validate(workspaceSourceSchema, source);
}
