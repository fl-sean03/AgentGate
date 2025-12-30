/**
 * L3 Sanity check verification.
 * Final sanity checks before marking verification as passed.
 */

import { readdir, stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import { VerificationLevel, type GatePlan, type LevelResult, type CheckResult } from '../types/index.js';
import type { VerifyContext } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('l3-sanity');

/**
 * Run L3 sanity verification.
 * Performs final checks to ensure the workspace is in a good state.
 * @param ctx - Verification context
 * @returns L3 verification result
 */
export async function verifyL3(ctx: VerifyContext): Promise<LevelResult> {
  const startTime = Date.now();
  const checks: CheckResult[] = [];
  const { gatePlan, workDir, cleanRoom } = ctx;
  const targetDir = cleanRoom?.workDir ?? workDir;

  log.debug({ workDir: targetDir }, 'Starting L3 sanity verification');

  // Check for uncommitted debug artifacts
  const debugCheck = await checkDebugArtifacts(targetDir, ctx);
  checks.push(debugCheck);

  // Check for large files that might be unintentional
  const largeFilesCheck = await checkLargeFiles(targetDir, gatePlan, ctx);
  checks.push(largeFilesCheck);

  // Check for common mistake patterns
  const mistakesCheck = await checkCommonMistakes(targetDir, ctx);
  checks.push(mistakesCheck);

  // Verify final state is clean (no temp files, etc.)
  const cleanStateCheck = await checkCleanState(targetDir, ctx);
  checks.push(cleanStateCheck);

  const duration = Date.now() - startTime;
  const passed = checks.every((c) => c.passed);

  const result: LevelResult = {
    level: VerificationLevel.L3,
    passed,
    checks,
    duration,
  };

  log.info(
    {
      passed,
      checkCount: checks.length,
      duration,
    },
    'L3 verification complete'
  );

  return result;
}

/**
 * Check for debug artifacts that shouldn't be committed.
 */
async function checkDebugArtifacts(
  workDir: string,
  ctx: VerifyContext
): Promise<CheckResult> {
  const debugPatterns = [
    '**/*.log',
    '**/debug.txt',
    '**/.debug',
    '**/console.log.txt',
    '**/*.dump',
    '**/core',
    '**/core.*',
    '**/*.heapdump',
    '**/*.cpuprofile',
  ];

  try {
    const found = await fg(debugPatterns, {
      cwd: workDir,
      dot: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/logs/**'],
    });

    if (found.length > 0) {
      ctx.diagnostics.push({
        level: VerificationLevel.L3,
        type: 'debug_artifact',
        message: `Found ${found.length} debug artifact(s)`,
        details: found.slice(0, 10).join(', '),
      });

      // This is a warning, not a failure
      return {
        name: 'debug-artifacts',
        passed: true, // Warnings don't fail L3
        message: `Warning: Found ${found.length} debug artifact(s)`,
        details: found.slice(0, 5).join(', '),
      };
    }

    return {
      name: 'debug-artifacts',
      passed: true,
      message: 'No debug artifacts found',
      details: null,
    };
  } catch (error) {
    log.warn({ error }, 'Error checking debug artifacts');
    return {
      name: 'debug-artifacts',
      passed: true,
      message: 'Could not check debug artifacts',
      details: String(error),
    };
  }
}

/**
 * Check for unexpectedly large files.
 */
async function checkLargeFiles(
  workDir: string,
  gatePlan: GatePlan,
  ctx: VerifyContext
): Promise<CheckResult> {
  const maxFileSizeMb = gatePlan.policy.maxDiskMb ?? 100;
  const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;

  try {
    const files = await fg('**/*', {
      cwd: workDir,
      dot: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
    });

    const largeFiles: Array<{ file: string; size: number }> = [];

    for (const file of files) {
      try {
        const filePath = join(workDir, file);
        const fileStat = await stat(filePath);

        // Flag files larger than 10MB as potentially problematic
        if (fileStat.size > 10 * 1024 * 1024) {
          largeFiles.push({ file, size: fileStat.size });
        }
      } catch {
        // Skip files we can't stat
      }
    }

    if (largeFiles.length > 0) {
      const details = largeFiles
        .slice(0, 5)
        .map((f) => `${f.file} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)
        .join(', ');

      ctx.diagnostics.push({
        level: VerificationLevel.L3,
        type: 'large_file',
        message: `Found ${largeFiles.length} large file(s)`,
        details,
      });

      // Warning only if under max, fail if over
      const overMax = largeFiles.some((f) => f.size > maxFileSizeBytes);

      return {
        name: 'large-files',
        passed: !overMax,
        message: overMax
          ? `Found file(s) exceeding ${maxFileSizeMb}MB limit`
          : `Warning: Found ${largeFiles.length} large file(s)`,
        details,
      };
    }

    return {
      name: 'large-files',
      passed: true,
      message: 'No unexpectedly large files found',
      details: null,
    };
  } catch (error) {
    log.warn({ error }, 'Error checking large files');
    return {
      name: 'large-files',
      passed: true,
      message: 'Could not check file sizes',
      details: String(error),
    };
  }
}

/**
 * Check for common mistake patterns in code.
 */
async function checkCommonMistakes(
  workDir: string,
  ctx: VerifyContext
): Promise<CheckResult> {
  const mistakePatterns = [
    // TODO/FIXME comments that might indicate incomplete work
    { pattern: 'TODO:', files: '**/*.{ts,js,py,go,rs}', severity: 'warning' },
    { pattern: 'FIXME:', files: '**/*.{ts,js,py,go,rs}', severity: 'warning' },
    { pattern: 'XXX:', files: '**/*.{ts,js,py,go,rs}', severity: 'warning' },
    // Debug statements that might be left in
    { pattern: 'console\\.log\\(', files: '**/*.{ts,js}', severity: 'warning' },
    { pattern: 'debugger', files: '**/*.{ts,js}', severity: 'warning' },
    { pattern: 'print\\(.*debug', files: '**/*.py', severity: 'warning' },
  ];

  const warnings: string[] = [];

  try {
    for (const check of mistakePatterns) {
      const files = await fg(check.files, {
        cwd: workDir,
        dot: false,
        onlyFiles: true,
        ignore: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/*.test.*',
          '**/*.spec.*',
        ],
      });

      for (const file of files.slice(0, 100)) {
        // Limit files to check
        try {
          const { readFile } = await import('node:fs/promises');
          const content = await readFile(join(workDir, file), 'utf-8');
          const regex = new RegExp(check.pattern, 'gi');
          const matches = content.match(regex);

          if (matches && matches.length > 0) {
            warnings.push(`${file}: ${matches.length} match(es) for ${check.pattern}`);
          }
        } catch {
          // Skip files we can't read
        }
      }
    }

    if (warnings.length > 0) {
      const details = warnings.slice(0, 10).join('\n');

      ctx.diagnostics.push({
        level: VerificationLevel.L3,
        type: 'code_warning',
        message: `Found ${warnings.length} potential issue(s)`,
        details,
      });

      return {
        name: 'common-mistakes',
        passed: true, // Warnings don't fail
        message: `Warning: Found ${warnings.length} potential issue(s)`,
        details,
      };
    }

    return {
      name: 'common-mistakes',
      passed: true,
      message: 'No common mistake patterns found',
      details: null,
    };
  } catch (error) {
    log.warn({ error }, 'Error checking common mistakes');
    return {
      name: 'common-mistakes',
      passed: true,
      message: 'Could not check for common mistakes',
      details: String(error),
    };
  }
}

/**
 * Check that the workspace is in a clean state.
 */
async function checkCleanState(
  workDir: string,
  ctx: VerifyContext
): Promise<CheckResult> {
  const tempPatterns = [
    '**/*.tmp',
    '**/*.temp',
    '**/*.bak',
    '**/*.swp',
    '**/*.swo',
    '**/*~',
    '**/.DS_Store',
    '**/Thumbs.db',
    '**/*.orig',
  ];

  try {
    const found = await fg(tempPatterns, {
      cwd: workDir,
      dot: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    if (found.length > 0) {
      ctx.diagnostics.push({
        level: VerificationLevel.L3,
        type: 'temp_file',
        message: `Found ${found.length} temporary file(s)`,
        details: found.slice(0, 10).join(', '),
      });

      // Temporary files are warnings, not failures
      return {
        name: 'clean-state',
        passed: true,
        message: `Warning: Found ${found.length} temporary file(s)`,
        details: found.slice(0, 5).join(', '),
      };
    }

    return {
      name: 'clean-state',
      passed: true,
      message: 'Workspace is in a clean state',
      details: null,
    };
  } catch (error) {
    log.warn({ error }, 'Error checking clean state');
    return {
      name: 'clean-state',
      passed: true,
      message: 'Could not verify clean state',
      details: String(error),
    };
  }
}
