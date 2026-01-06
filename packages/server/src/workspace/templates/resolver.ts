/**
 * Template Resolver
 *
 * Resolves and applies workspace templates.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import type {
  WorkspaceTemplate,
  TemplateCreateOptions,
  TemplateCreateResult,
  TemplateHook,
  TemplateVariable,
} from './types.js';
import { getLoader } from './loaders/index.js';
import { TemplateRegistry, defaultTemplateRegistry } from './registry.js';

export class TemplateResolver {
  private registry: TemplateRegistry;

  constructor(registry: TemplateRegistry = defaultTemplateRegistry) {
    this.registry = registry;
  }

  /**
   * Create a workspace from a template
   */
  async create(options: TemplateCreateOptions): Promise<TemplateCreateResult> {
    const result: TemplateCreateResult = {
      success: false,
      targetDir: options.targetDir,
      files: [],
      hooks: [],
    };

    try {
      // Resolve template
      const template =
        typeof options.template === 'string'
          ? this.registry.get(options.template)
          : options.template;

      if (!template) {
        result.error =
          typeof options.template === 'string'
            ? `Template not found: ${options.template}`
            : 'Invalid template';
        return result;
      }

      // Validate variables
      if (template.variables) {
        const validationError = this.validateVariables(
          template.variables,
          options.variables || {}
        );
        if (validationError) {
          result.error = validationError;
          return result;
        }
      }

      // Check if target directory exists
      const targetExists = await this.directoryExists(options.targetDir);
      if (targetExists && !options.overwrite) {
        const entries = await fs.readdir(options.targetDir);
        if (entries.length > 0) {
          result.error = `Target directory is not empty: ${options.targetDir}`;
          return result;
        }
      }

      // Run before hooks
      if (template.hooks) {
        const beforeHooks = template.hooks.filter((h) => h.when === 'before');
        for (const hook of beforeHooks) {
          const hookResult = await this.runHook(hook, options.targetDir);
          result.hooks!.push(hookResult);

          if (!hookResult.success && !hook.continueOnError) {
            result.error = `Before hook failed: ${hookResult.error}`;
            return result;
          }
        }
      }

      // Load template files
      const loader = getLoader(template.source.type);
      result.files = await loader.load(template.source, options.targetDir);

      // Apply variable substitution
      if (template.variables && options.variables) {
        await this.applyVariables(
          options.targetDir,
          result.files,
          template.variables,
          options.variables
        );
      }

      // Run after hooks
      if (template.hooks) {
        const afterHooks = template.hooks.filter((h) => h.when === 'after');
        for (const hook of afterHooks) {
          const hookResult = await this.runHook(hook, options.targetDir);
          result.hooks!.push(hookResult);

          if (!hookResult.success && !hook.continueOnError) {
            result.error = `After hook failed: ${hookResult.error}`;
            // Still mark success as true since files were created
            // But the hook error is recorded
          }
        }
      }

      result.success = true;
      return result;
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return result;
    }
  }

  /**
   * Validate that required variables are provided and match constraints
   */
  private validateVariables(
    definitions: TemplateVariable[],
    values: Record<string, unknown>
  ): string | undefined {
    for (const varDef of definitions) {
      const value = values[varDef.name];

      // Check required
      if (varDef.required && value === undefined) {
        if (varDef.default === undefined) {
          return `Required variable missing: ${varDef.name}`;
        }
      }

      // Skip validation if no value and has default
      if (value === undefined) {
        continue;
      }

      // Type validation
      const actualType = Array.isArray(value)
        ? 'array'
        : typeof value === 'object' && value !== null
        ? 'object'
        : typeof value;

      if (actualType !== varDef.type) {
        return `Variable '${varDef.name}' must be of type ${varDef.type}, got ${actualType}`;
      }

      // Pattern validation for strings
      if (varDef.type === 'string' && varDef.pattern) {
        const regex = new RegExp(varDef.pattern);
        if (!regex.test(value as string)) {
          return `Variable '${varDef.name}' does not match pattern: ${varDef.pattern}`;
        }
      }

      // Enum validation
      if (varDef.enum) {
        if (!varDef.enum.includes(value)) {
          return `Variable '${varDef.name}' must be one of: ${varDef.enum.join(', ')}`;
        }
      }
    }

    return undefined;
  }

  /**
   * Apply variable substitution to template files
   */
  private async applyVariables(
    targetDir: string,
    files: string[],
    definitions: TemplateVariable[],
    values: Record<string, unknown>
  ): Promise<void> {
    // Build substitution map with defaults
    const substitutions: Record<string, string> = {};
    for (const varDef of definitions) {
      const value = values[varDef.name] ?? varDef.default;
      if (value !== undefined) {
        substitutions[varDef.name] =
          typeof value === 'string' ? value : JSON.stringify(value);
      }
    }

    // Process each file
    for (const file of files) {
      const filePath = path.join(targetDir, file);

      // Skip binary files
      if (this.isBinaryFile(file)) {
        continue;
      }

      try {
        let content = await fs.readFile(filePath, 'utf-8');

        // Replace {{VARIABLE_NAME}} patterns
        for (const [name, value] of Object.entries(substitutions)) {
          const pattern = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g');
          content = content.replace(pattern, value);
        }

        await fs.writeFile(filePath, content, 'utf-8');
      } catch {
        // Skip files that can't be read as text
      }
    }
  }

  /**
   * Check if a file is likely binary based on extension
   */
  private isBinaryFile(filename: string): boolean {
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
      '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
      '.exe', '.dll', '.so', '.dylib',
      '.woff', '.woff2', '.ttf', '.eot',
      '.mp3', '.mp4', '.wav', '.avi', '.mov',
      '.db', '.sqlite',
    ];

    const ext = path.extname(filename).toLowerCase();
    return binaryExtensions.includes(ext);
  }

  /**
   * Run a template hook
   */
  private async runHook(
    hook: TemplateHook,
    targetDir: string
  ): Promise<{
    hook: TemplateHook;
    success: boolean;
    output?: string;
    error?: string;
  }> {
    const cwd = hook.cwd ? path.join(targetDir, hook.cwd) : targetDir;

    try {
      // Ensure directory exists
      await fs.mkdir(cwd, { recursive: true });

      const output = execSync(hook.command, {
        cwd,
        stdio: 'pipe',
        timeout: hook.timeoutMs || 60000,
        encoding: 'utf-8',
      });

      return {
        hook,
        success: true,
        output: typeof output === 'string' ? output : undefined,
      };
    } catch (error) {
      if (hook.continueOnError) {
        return {
          hook,
          success: true, // Marked success because continueOnError is true
          error: error instanceof Error ? error.message : 'Hook failed',
        };
      }

      return {
        hook,
        success: false,
        error: error instanceof Error ? error.message : 'Hook failed',
      };
    }
  }

  /**
   * Check if a directory exists
   */
  private async directoryExists(dir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}

export const defaultResolver = new TemplateResolver();
