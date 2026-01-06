/**
 * Test Plugin (L1)
 *
 * Runs the project's test suite using the configured harness.
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { BasePlugin } from '../base-plugin.js';
import type {
  VerificationContext,
  VerificationResult,
  VerificationCheck,
} from '../types.js';

export class TestPlugin extends BasePlugin {
  constructor() {
    super({
      id: 'built-in:test',
      name: 'Tests',
      description: 'Run project test suite',
      level: 'L1',
      priority: 20,
      enabled: true,
      continueOnFail: false,
    });
  }

  shouldRun(context: VerificationContext): boolean {
    // Run if we have a harness or can detect tests
    if (context.harness) return true;

    if (!context.workDir || !fs.existsSync(context.workDir)) {
      return false;
    }

    // Check for common test configurations
    const indicators = [
      'package.json', // npm test
      'Cargo.toml',   // cargo test
      'pytest.ini',   // pytest
      'pyproject.toml', // pytest/poetry
      'setup.py',     // python tests
      'Makefile',     // make test
    ];

    return indicators.some((file) =>
      fs.existsSync(path.join(context.workDir, file))
    );
  }

  async verify(context: VerificationContext): Promise<VerificationResult> {
    const startTime = Date.now();
    const checks: VerificationCheck[] = [];

    // Determine test command
    const testCommand = context.harness || this.detectTestCommand(context.workDir);

    if (!testCommand) {
      return this.skipped(
        'No test command configured and none detected',
        Date.now() - startTime
      );
    }

    // Run tests
    const testResult = await this.runTests(context.workDir, testCommand, context.timeoutMs);
    checks.push(testResult.check);

    const durationMs = Date.now() - startTime;

    if (testResult.check.status === 'passed') {
      return this.success(
        `Tests passed: ${testCommand}`,
        checks,
        durationMs
      );
    } else if (testResult.check.status === 'skipped') {
      return this.skipped(testResult.check.message || 'Tests skipped', durationMs);
    } else {
      return this.failure(
        `Tests failed: ${testCommand}`,
        checks,
        durationMs
      );
    }
  }

  private detectTestCommand(workDir: string): string | null {
    // Check package.json for test script
    const packageJsonPath = path.join(workDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
          return 'npm test';
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Rust
    if (fs.existsSync(path.join(workDir, 'Cargo.toml'))) {
      return 'cargo test';
    }

    // Python pytest
    if (
      fs.existsSync(path.join(workDir, 'pytest.ini')) ||
      fs.existsSync(path.join(workDir, 'tests'))
    ) {
      return 'pytest';
    }

    // Python pyproject.toml
    if (fs.existsSync(path.join(workDir, 'pyproject.toml'))) {
      return 'pytest';
    }

    // Makefile
    if (fs.existsSync(path.join(workDir, 'Makefile'))) {
      const makefile = fs.readFileSync(path.join(workDir, 'Makefile'), 'utf-8');
      if (makefile.includes('test:')) {
        return 'make test';
      }
    }

    // Go
    if (fs.existsSync(path.join(workDir, 'go.mod'))) {
      return 'go test ./...';
    }

    return null;
  }

  private async runTests(
    workDir: string,
    command: string,
    timeoutMs?: number
  ): Promise<{ check: VerificationCheck; output: string }> {
    const timeout = timeoutMs || 300000; // 5 min default

    return new Promise((resolve) => {
      const startTime = Date.now();
      let output = '';

      try {
        const result = execSync(command, {
          cwd: workDir,
          stdio: 'pipe',
          timeout,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });

        output = typeof result === 'string' ? result : '';
        const durationMs = Date.now() - startTime;

        resolve({
          check: this.check('Test Suite', 'passed', {
            message: 'All tests passed',
            details: output.slice(-5000), // Last 5KB of output
            durationMs,
          }),
          output,
        });
      } catch (error) {
        const durationMs = Date.now() - startTime;

        // Check if it was a timeout
        if (
          error instanceof Error &&
          (error.message.includes('TIMEOUT') || error.message.includes('timed out'))
        ) {
          resolve({
            check: this.check('Test Suite', 'failed', {
              message: `Tests timed out after ${timeout}ms`,
              durationMs,
            }),
            output: '',
          });
          return;
        }

        // Extract output from error
        if (error instanceof Error && 'stdout' in error) {
          output = String((error as { stdout: unknown }).stdout);
        }
        if (error instanceof Error && 'stderr' in error) {
          output += '\n' + String((error as { stderr: unknown }).stderr);
        }

        resolve({
          check: this.check('Test Suite', 'failed', {
            message: 'Tests failed',
            details: output.slice(-5000),
            durationMs,
          }),
          output,
        });
      }
    });
  }
}

export const testPlugin = new TestPlugin();
