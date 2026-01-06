/**
 * Lint Plugin (L0)
 *
 * Checks for syntax errors and basic code quality issues.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { BasePlugin } from '../base-plugin.js';
import type {
  VerificationContext,
  VerificationResult,
  VerificationCheck,
} from '../types.js';

export class LintPlugin extends BasePlugin {
  constructor() {
    super({
      id: 'built-in:lint',
      name: 'Lint',
      description: 'Check for syntax errors and lint issues',
      level: 'L0',
      priority: 10,
      enabled: true,
      continueOnFail: true,
    });
  }

  shouldRun(context: VerificationContext): boolean {
    // Run if we have a workDir
    return !!context.workDir && fs.existsSync(context.workDir);
  }

  async verify(context: VerificationContext): Promise<VerificationResult> {
    const startTime = Date.now();
    const checks: VerificationCheck[] = [];

    // Detect project type and run appropriate linters
    const hasPackageJson = fs.existsSync(
      path.join(context.workDir, 'package.json')
    );
    const hasRustCargo = fs.existsSync(
      path.join(context.workDir, 'Cargo.toml')
    );
    const hasPythonSetup =
      fs.existsSync(path.join(context.workDir, 'setup.py')) ||
      fs.existsSync(path.join(context.workDir, 'pyproject.toml'));

    // TypeScript/JavaScript
    if (hasPackageJson) {
      checks.push(await this.checkTypeScript(context.workDir));
    }

    // Rust
    if (hasRustCargo) {
      checks.push(await this.checkRust(context.workDir));
    }

    // Python
    if (hasPythonSetup) {
      checks.push(await this.checkPython(context.workDir));
    }

    // If no specific checks ran, try generic syntax check
    if (checks.length === 0 && context.modifiedFiles?.length) {
      for (const file of context.modifiedFiles.slice(0, 10)) {
        // Limit checks
        checks.push(await this.checkFile(context.workDir, file));
      }
    }

    const durationMs = Date.now() - startTime;
    const failed = checks.filter((c) => c.status === 'failed').length;
    const passed = checks.filter((c) => c.status === 'passed').length;

    if (checks.length === 0) {
      return this.skipped('No lintable files found', durationMs);
    }

    if (failed > 0) {
      return this.failure(
        `${failed} lint check(s) failed, ${passed} passed`,
        checks,
        durationMs
      );
    }

    return this.success(`All ${passed} lint check(s) passed`, checks, durationMs);
  }

  private async checkTypeScript(workDir: string): Promise<VerificationCheck> {
    try {
      // Check if TypeScript is available
      const hasTsConfig = fs.existsSync(path.join(workDir, 'tsconfig.json'));

      if (hasTsConfig) {
        try {
          execSync('npx tsc --noEmit', {
            cwd: workDir,
            stdio: 'pipe',
            timeout: 60000,
          });
          return this.check('TypeScript', 'passed', {
            message: 'No type errors found',
          });
        } catch (error) {
          const stderr =
            error instanceof Error && 'stderr' in error
              ? String((error as { stderr: unknown }).stderr)
              : '';
          return this.check('TypeScript', 'failed', {
            message: 'Type errors found',
            details: stderr.slice(0, 2000),
          });
        }
      }

      // Try ESLint if available
      const hasEslint = fs.existsSync(path.join(workDir, '.eslintrc.json')) ||
                        fs.existsSync(path.join(workDir, '.eslintrc.js')) ||
                        fs.existsSync(path.join(workDir, 'eslint.config.js'));

      if (hasEslint) {
        try {
          execSync('npx eslint . --max-warnings 0', {
            cwd: workDir,
            stdio: 'pipe',
            timeout: 60000,
          });
          return this.check('ESLint', 'passed', {
            message: 'No ESLint errors',
          });
        } catch (error) {
          const stderr =
            error instanceof Error && 'stderr' in error
              ? String((error as { stderr: unknown }).stderr)
              : '';
          return this.check('ESLint', 'failed', {
            message: 'ESLint errors found',
            details: stderr.slice(0, 2000),
          });
        }
      }

      return this.check('JavaScript/TypeScript', 'skipped', {
        message: 'No TypeScript config or ESLint found',
      });
    } catch (error) {
      return this.check('JavaScript/TypeScript', 'error', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async checkRust(workDir: string): Promise<VerificationCheck> {
    try {
      execSync('cargo check', {
        cwd: workDir,
        stdio: 'pipe',
        timeout: 120000,
      });
      return this.check('Rust', 'passed', {
        message: 'cargo check passed',
      });
    } catch (error) {
      const stderr =
        error instanceof Error && 'stderr' in error
          ? String((error as { stderr: unknown }).stderr)
          : '';
      return this.check('Rust', 'failed', {
        message: 'cargo check failed',
        details: stderr.slice(0, 2000),
      });
    }
  }

  private async checkPython(workDir: string): Promise<VerificationCheck> {
    try {
      // Try ruff first (fast modern linter)
      try {
        execSync('ruff check .', {
          cwd: workDir,
          stdio: 'pipe',
          timeout: 60000,
        });
        return this.check('Python (ruff)', 'passed', {
          message: 'No ruff errors',
        });
      } catch {
        // Ruff not available or found issues
      }

      // Fall back to flake8
      try {
        execSync('flake8 .', {
          cwd: workDir,
          stdio: 'pipe',
          timeout: 60000,
        });
        return this.check('Python (flake8)', 'passed', {
          message: 'No flake8 errors',
        });
      } catch (error) {
        const stderr =
          error instanceof Error && 'stderr' in error
            ? String((error as { stderr: unknown }).stderr)
            : '';
        return this.check('Python', 'failed', {
          message: 'Linting errors found',
          details: stderr.slice(0, 2000),
        });
      }
    } catch {
      return this.check('Python', 'skipped', {
        message: 'No Python linter available',
      });
    }
  }

  private async checkFile(workDir: string, file: string): Promise<VerificationCheck> {
    const ext = path.extname(file).toLowerCase();
    const fullPath = path.join(workDir, file);

    if (!fs.existsSync(fullPath)) {
      return this.check(file, 'skipped', {
        message: 'File does not exist',
      });
    }

    // JSON syntax check
    if (ext === '.json') {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        JSON.parse(content);
        return this.check(file, 'passed', {
          message: 'Valid JSON syntax',
        });
      } catch {
        return this.check(file, 'failed', {
          message: 'Invalid JSON syntax',
        });
      }
    }

    // Python syntax check
    if (ext === '.py') {
      try {
        execSync(`python3 -m py_compile "${fullPath}"`, {
          stdio: 'pipe',
          timeout: 10000,
        });
        return this.check(file, 'passed', {
          message: 'Valid Python syntax',
        });
      } catch {
        return this.check(file, 'failed', {
          message: 'Python syntax error',
        });
      }
    }

    return this.check(file, 'skipped', {
      message: 'No syntax checker for this file type',
    });
  }
}

export const lintPlugin = new LintPlugin();
