/**
 * Workspace Template Types
 *
 * Defines the interfaces and types for the template system.
 */

/**
 * Source types for templates
 */
export type TemplateSourceType = 'inline' | 'directory' | 'git' | 'url';

/**
 * Base interface for template sources
 */
export interface BaseTemplateSource {
  type: TemplateSourceType;
}

/**
 * Inline template source - content is embedded in the config
 */
export interface InlineTemplateSource extends BaseTemplateSource {
  type: 'inline';
  files: Record<string, string>; // filename -> content
}

/**
 * Directory template source - load from local filesystem
 */
export interface DirectoryTemplateSource extends BaseTemplateSource {
  type: 'directory';
  path: string;
}

/**
 * Git template source - clone from git repository
 */
export interface GitTemplateSource extends BaseTemplateSource {
  type: 'git';
  url: string;
  branch?: string;
  tag?: string;
  commit?: string;
  subdirectory?: string;
  auth?: {
    username?: string;
    password?: string;
    token?: string;
    privateKey?: string;
  };
}

/**
 * URL template source - download from URL (tar.gz, zip)
 */
export interface UrlTemplateSource extends BaseTemplateSource {
  type: 'url';
  url: string;
  format?: 'tar' | 'tar.gz' | 'zip';
  stripComponents?: number; // Number of leading path components to strip
  headers?: Record<string, string>;
}

/**
 * Union of all template source types
 */
export type TemplateSource =
  | InlineTemplateSource
  | DirectoryTemplateSource
  | GitTemplateSource
  | UrlTemplateSource;

/**
 * Template variable definition
 */
export interface TemplateVariable {
  name: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: unknown;
  required?: boolean;
  pattern?: string; // Regex pattern for validation
  enum?: unknown[]; // Allowed values
}

/**
 * Hook that runs during template application
 */
export interface TemplateHook {
  /** When to run the hook */
  when: 'before' | 'after';
  /** Shell command to execute */
  command: string;
  /** Working directory (relative to workspace root) */
  cwd?: string;
  /** Continue if command fails */
  continueOnError?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Full workspace template definition
 */
export interface WorkspaceTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this template provides */
  description?: string;
  /** Semantic version */
  version: string;
  /** Where to get the template content */
  source: TemplateSource;
  /** Variables that can be substituted in files */
  variables?: TemplateVariable[];
  /** Hooks to run before/after template application */
  hooks?: TemplateHook[];
  /** Default harness to use with this template */
  defaultHarness?: string;
  /** File patterns to ignore when copying */
  ignore?: string[];
  /** Tags for categorization */
  tags?: string[];
  /** Whether this is a built-in template */
  builtIn?: boolean;
  /** Organization ID that owns this template (for SaaS) */
  organizationId?: string;
  /** Creation timestamp */
  createdAt?: Date;
  /** Last update timestamp */
  updatedAt?: Date;
  /** User who created this template */
  createdBy?: string;
}

/**
 * Input for creating a workspace from a template
 */
export interface TemplateCreateOptions {
  /** Template ID or WorkspaceTemplate object */
  template: string | WorkspaceTemplate;
  /** Variable values to substitute */
  variables?: Record<string, unknown>;
  /** Target directory to create workspace in */
  targetDir: string;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
}

/**
 * Result of creating a workspace from a template
 */
export interface TemplateCreateResult {
  /** Whether creation succeeded */
  success: boolean;
  /** Target directory path */
  targetDir: string;
  /** List of files created */
  files: string[];
  /** Hook execution results */
  hooks?: {
    hook: TemplateHook;
    success: boolean;
    output?: string;
    error?: string;
  }[];
  /** Any errors encountered */
  error?: string;
}

/**
 * Template loader interface - implemented by each source type
 */
export interface TemplateLoader {
  /** Source type this loader handles */
  sourceType: TemplateSourceType;
  /**
   * Load template files from the source
   * @param source The template source configuration
   * @param targetDir Directory to write files to
   * @returns List of files created
   */
  load(source: TemplateSource, targetDir: string): Promise<string[]>;
}

/**
 * Options for listing templates
 */
export interface ListTemplatesOptions {
  /** Filter by tags */
  tags?: string[];
  /** Filter by organization ID */
  organizationId?: string;
  /** Include built-in templates */
  includeBuiltIn?: boolean;
  /** Search term for name/description */
  search?: string;
}
