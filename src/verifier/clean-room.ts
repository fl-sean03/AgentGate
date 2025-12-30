/**
 * Clean-room verification environment.
 * Creates an isolated environment for running verification.
 */

import { mkdir, rm, cp, writeFile, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execa, type Options as ExecaOptions } from 'execa';
import type { CleanRoom, GatePlan } from '../types/index.js';
import { RuntimeType } from '../types/index.js';
import { createTempDir, removeTempDir } from '../utils/temp.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('clean-room');

/**
 * Create a clean-room environment.
 * @param snapshotPath - Path to the snapshot to verify
 * @param gatePlan - The gate plan (for environment setup)
 * @param snapshotId - Optional snapshot ID for tracking
 * @returns CleanRoom environment
 */
export async function createCleanRoom(
  snapshotPath: string,
  gatePlan: GatePlan,
  snapshotId?: string
): Promise<CleanRoom> {
  const startTime = Date.now();
  const id = randomUUID();

  // Create a temporary directory for the clean-room
  const workDir = await createTempDir('cleanroom');

  log.debug({ workDir, snapshotPath }, 'Creating clean-room environment');

  // Copy snapshot to work directory
  await cp(snapshotPath, workDir, {
    recursive: true,
    preserveTimestamps: true,
  });

  // Create virtual environment if needed
  let envDir: string | null = null;

  if (gatePlan.environment.runtime === RuntimeType.PYTHON) {
    envDir = await createPythonVenv(workDir, gatePlan);
  } else if (gatePlan.environment.runtime === RuntimeType.NODE) {
    await setupNodeEnvironment(workDir, gatePlan);
  }

  // Create environment variables (restricted)
  const env: Record<string, string> = {
    HOME: workDir,
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    LANG: 'en_US.UTF-8',
    TERM: 'dumb',
    CI: 'true', // Indicate CI environment for better tool behavior
    AGENTGATE_CLEANROOM: 'true',
  };

  // Add venv to PATH if created
  if (envDir) {
    env['VIRTUAL_ENV'] = envDir;
    env['PATH'] = `${envDir}/bin:${env['PATH']}`;
  }

  // Determine runtime type
  const runtime = gatePlan.environment.runtime as 'node' | 'python' | 'generic';
  const runtimeVersion = gatePlan.environment.runtimeVersion;

  const setupDurationMs = Date.now() - startTime;

  const cleanRoom: CleanRoom = {
    id,
    snapshotId: snapshotId ?? 'unknown',
    workDir,
    envDir,
    runtime,
    runtimeVersion,
    createdAt: new Date(),
    env,
  };

  log.info(
    { id, workDir, envDir, runtime, setupDurationMs },
    'Clean-room environment created'
  );

  return cleanRoom;
}

/**
 * Tear down a clean-room environment.
 * @param cleanRoom - The clean-room to tear down
 */
export async function teardownCleanRoom(cleanRoom: CleanRoom): Promise<void> {
  log.debug({ workDir: cleanRoom.workDir }, 'Tearing down clean-room');

  try {
    await removeTempDir(cleanRoom.workDir);
    log.info({ workDir: cleanRoom.workDir }, 'Clean-room torn down');
  } catch (error) {
    log.warn({ workDir: cleanRoom.workDir, error }, 'Failed to tear down clean-room');
  }
}

/**
 * Create a Python virtual environment.
 */
async function createPythonVenv(
  workDir: string,
  gatePlan: GatePlan
): Promise<string> {
  const venvPath = join(workDir, '.venv');

  log.debug({ venvPath }, 'Creating Python virtual environment');

  // Determine Python version to use
  const pythonVersion = gatePlan.environment.runtimeVersion;
  const pythonCmd = pythonVersion ? `python${pythonVersion}` : 'python3';

  try {
    // Create venv
    await execa(pythonCmd, ['-m', 'venv', venvPath], {
      cwd: workDir,
      timeout: 60000,
    });

    // Install dependencies if requirements.txt exists
    const requirementsPath = join(workDir, 'requirements.txt');
    try {
      const pipPath = join(venvPath, 'bin', 'pip');
      await execa(pipPath, ['install', '-r', requirementsPath], {
        cwd: workDir,
        timeout: 300000, // 5 min for install
      });
    } catch {
      // requirements.txt may not exist, that's fine
    }

    log.debug({ venvPath }, 'Python venv created');
    return venvPath;
  } catch (error) {
    log.warn({ error }, 'Failed to create Python venv, continuing without it');
    return venvPath;
  }
}

/**
 * Set up Node.js environment.
 */
async function setupNodeEnvironment(
  workDir: string,
  gatePlan: GatePlan
): Promise<void> {
  log.debug({ workDir }, 'Setting up Node.js environment');

  // Check if package.json exists
  const packageJsonPath = join(workDir, 'package.json');

  try {
    // Determine package manager
    const pnpmLock = join(workDir, 'pnpm-lock.yaml');
    const yarnLock = join(workDir, 'yarn.lock');
    const npmLock = join(workDir, 'package-lock.json');

    let installCmd: string[];

    try {
      await import('node:fs/promises').then(fs => fs.access(pnpmLock));
      installCmd = ['pnpm', 'install', '--frozen-lockfile'];
    } catch {
      try {
        await import('node:fs/promises').then(fs => fs.access(yarnLock));
        installCmd = ['yarn', 'install', '--frozen-lockfile'];
      } catch {
        installCmd = ['npm', 'ci'];
      }
    }

    log.debug({ installCmd }, 'Running Node.js dependency install');

    await execa(installCmd[0]!, installCmd.slice(1), {
      cwd: workDir,
      timeout: 300000, // 5 min for install
    });

    log.debug({ workDir }, 'Node.js environment setup complete');
  } catch (error) {
    log.warn({ error }, 'Failed to set up Node.js environment');
  }
}

/**
 * Run a command in the clean-room environment.
 * @param cleanRoom - The clean-room environment
 * @param command - Command to run (string or array)
 * @param options - Additional options
 * @returns Execution result
 */
export async function runInCleanRoom(
  cleanRoom: CleanRoom,
  command: string | string[],
  options: {
    timeout?: number;
    cwd?: string;
  } = {}
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  const cmdStr = Array.isArray(command) ? command.join(' ') : command;
  const cwd = options.cwd ?? cleanRoom.workDir;
  const timeout = options.timeout ?? 120000;

  log.debug({ command: cmdStr, cwd, timeout }, 'Running command in clean-room');

  // Build exec options
  const execOptions: ExecaOptions = {
    cwd,
    env: cleanRoom.env,
    timeout,
    shell: true,
    reject: false,
    all: true,
  };

  // TODO: Add network blocking via unshare/firejail if networkBlocked
  // For now, we rely on policy enforcement at the shell level

  const startTime = Date.now();
  const result = await execa(cmdStr, execOptions);
  const duration = Date.now() - startTime;

  const timedOut = result.timedOut ?? false;

  log.debug(
    {
      command: cmdStr,
      exitCode: result.exitCode,
      duration,
      timedOut,
    },
    'Command completed in clean-room'
  );

  return {
    exitCode: result.exitCode ?? (timedOut ? null : 1),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut,
  };
}
