/**
 * Parser for GitHub Actions workflow files.
 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { ProfileParseError } from './errors.js';

/**
 * Intermediate representation of a CI workflow plan.
 */
export interface CIPlan {
  source: string;
  nodeVersion: string | null;
  pythonVersion: string | null;
  setupCommands: string[];
  testCommands: string[];
  buildCommands: string[];
  lintCommands: string[];
  isSimple: boolean;
}

/**
 * GitHub Actions workflow structure (partial).
 */
interface GitHubWorkflow {
  name?: string;
  on?: unknown;
  jobs?: Record<string, GitHubJob>;
}

interface GitHubJob {
  'runs-on'?: string;
  strategy?: {
    matrix?: {
      'node-version'?: string[];
      'python-version'?: string[];
      node?: string[];
      python?: string[];
    };
  };
  steps?: GitHubStep[];
}

interface GitHubStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

/**
 * Parse a GitHub Actions workflow file.
 * @param path - Path to the workflow file
 * @returns CIPlan or null if parsing fails or workflow is too complex
 */
export async function parseGitHubActions(path: string): Promise<CIPlan | null> {
  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch {
    return null;
  }

  let workflow: GitHubWorkflow;
  try {
    workflow = parseYaml(content) as GitHubWorkflow;
  } catch (error) {
    throw new ProfileParseError(
      path,
      error instanceof Error ? error : new Error(String(error))
    );
  }

  if (!workflow || !workflow.jobs) {
    return null;
  }

  const runCommands = extractRunCommands(workflow);
  const nodeVersion = extractNodeVersion(workflow);
  const pythonVersion = extractPythonVersion(workflow);
  const isSimple = isSimpleWorkflow(workflow);

  // Categorize commands
  const setupCommands: string[] = [];
  const testCommands: string[] = [];
  const buildCommands: string[] = [];
  const lintCommands: string[] = [];

  for (const cmd of runCommands) {
    const lowerCmd = cmd.toLowerCase();
    if (isSetupCommand(lowerCmd)) {
      setupCommands.push(cmd);
    } else if (isTestCommand(lowerCmd)) {
      testCommands.push(cmd);
    } else if (isBuildCommand(lowerCmd)) {
      buildCommands.push(cmd);
    } else if (isLintCommand(lowerCmd)) {
      lintCommands.push(cmd);
    }
  }

  return {
    source: path,
    nodeVersion,
    pythonVersion,
    setupCommands,
    testCommands,
    buildCommands,
    lintCommands,
    isSimple,
  };
}

/**
 * Extract all run commands from a workflow.
 * @param workflow - Parsed GitHub Actions workflow
 * @returns Array of run command strings
 */
export function extractRunCommands(workflow: GitHubWorkflow): string[] {
  const commands: string[] = [];

  if (!workflow.jobs) {
    return commands;
  }

  for (const job of Object.values(workflow.jobs)) {
    if (!job.steps) {
      continue;
    }

    for (const step of job.steps) {
      if (step.run) {
        // Split multi-line commands
        const lines = step.run
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'));
        commands.push(...lines);
      }
    }
  }

  return commands;
}

/**
 * Extract Node.js version from a workflow.
 * @param workflow - Parsed GitHub Actions workflow
 * @returns Node version string or null
 */
export function extractNodeVersion(workflow: GitHubWorkflow): string | null {
  if (!workflow.jobs) {
    return null;
  }

  for (const job of Object.values(workflow.jobs)) {
    // Check matrix
    if (job.strategy?.matrix) {
      const matrix = job.strategy.matrix;
      const nodeVersions = matrix['node-version'] || matrix.node;
      if (nodeVersions && nodeVersions.length > 0) {
        // Return the latest (usually last) version
        return String(nodeVersions[nodeVersions.length - 1]);
      }
    }

    // Check steps for setup-node action
    if (job.steps) {
      for (const step of job.steps) {
        if (step.uses?.includes('actions/setup-node')) {
          const version = step.with?.['node-version'];
          if (version) {
            return String(version);
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract Python version from a workflow.
 * @param workflow - Parsed GitHub Actions workflow
 * @returns Python version string or null
 */
export function extractPythonVersion(workflow: GitHubWorkflow): string | null {
  if (!workflow.jobs) {
    return null;
  }

  for (const job of Object.values(workflow.jobs)) {
    // Check matrix
    if (job.strategy?.matrix) {
      const matrix = job.strategy.matrix;
      const pythonVersions = matrix['python-version'] || matrix.python;
      if (pythonVersions && pythonVersions.length > 0) {
        return String(pythonVersions[pythonVersions.length - 1]);
      }
    }

    // Check steps for setup-python action
    if (job.steps) {
      for (const step of job.steps) {
        if (step.uses?.includes('actions/setup-python')) {
          const version = step.with?.['python-version'];
          if (version) {
            return String(version);
          }
        }
      }
    }
  }

  return null;
}

/**
 * Determine if a workflow is simple enough to reliably extract commands.
 * Complex workflows with conditionals, secrets, or services are not simple.
 * @param workflow - Parsed GitHub Actions workflow
 * @returns true if the workflow is simple
 */
export function isSimpleWorkflow(workflow: GitHubWorkflow): boolean {
  if (!workflow.jobs) {
    return false;
  }

  const jobCount = Object.keys(workflow.jobs).length;

  // More than 3 jobs is complex
  if (jobCount > 3) {
    return false;
  }

  for (const job of Object.values(workflow.jobs)) {
    // Check for services (database containers, etc.)
    if ('services' in job) {
      return false;
    }

    // Check for complex expressions in steps
    if (job.steps) {
      for (const step of job.steps) {
        // Steps with conditionals are complex
        if ('if' in step) {
          return false;
        }

        // Steps using secrets are complex
        if (step.run && step.run.includes('${{ secrets.')) {
          return false;
        }

        // Steps with complex environment setups
        if ('env' in step) {
          const env = step.env as Record<string, unknown>;
          if (Object.keys(env).length > 5) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

/**
 * Check if a command is a setup command.
 */
function isSetupCommand(cmd: string): boolean {
  return (
    cmd.includes('npm install') ||
    cmd.includes('npm ci') ||
    cmd.includes('yarn install') ||
    cmd.includes('pnpm install') ||
    cmd.includes('pip install') ||
    cmd.includes('poetry install') ||
    cmd.includes('pipenv install')
  );
}

/**
 * Check if a command is a test command.
 */
function isTestCommand(cmd: string): boolean {
  return (
    cmd.includes('npm test') ||
    cmd.includes('npm run test') ||
    cmd.includes('yarn test') ||
    cmd.includes('pnpm test') ||
    cmd.includes('pytest') ||
    cmd.includes('vitest') ||
    cmd.includes('jest') ||
    cmd.includes('mocha') ||
    cmd.includes('cargo test')
  );
}

/**
 * Check if a command is a build command.
 */
function isBuildCommand(cmd: string): boolean {
  return (
    cmd.includes('npm run build') ||
    cmd.includes('yarn build') ||
    cmd.includes('pnpm build') ||
    cmd.includes('tsc') ||
    cmd.includes('webpack') ||
    cmd.includes('vite build') ||
    cmd.includes('cargo build')
  );
}

/**
 * Check if a command is a lint command.
 */
function isLintCommand(cmd: string): boolean {
  return (
    cmd.includes('eslint') ||
    cmd.includes('npm run lint') ||
    cmd.includes('yarn lint') ||
    cmd.includes('pnpm lint') ||
    cmd.includes('prettier') ||
    cmd.includes('flake8') ||
    cmd.includes('pylint') ||
    cmd.includes('black') ||
    cmd.includes('ruff') ||
    cmd.includes('clippy')
  );
}
