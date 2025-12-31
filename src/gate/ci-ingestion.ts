/**
 * CI workflow ingestion module.
 * Discovers and parses CI configuration files to create a GatePlan.
 */

import * as fg from 'fast-glob';
import { nanoid } from 'nanoid';
import { RuntimeType, GatePlanSource, type GatePlan } from '../types/index.js';
import { parseGitHubActions, type CIPlan } from './github-actions-parser.js';

/**
 * Known CI configuration locations.
 */
const CI_CONFIG_PATTERNS = [
  '.github/workflows/*.yml',
  '.github/workflows/*.yaml',
  // Future: GitLab CI, CircleCI, etc.
  // '.gitlab-ci.yml',
  // '.circleci/config.yml',
];

/**
 * Find CI configuration files in a workspace.
 * @param workspacePath - Path to the workspace root
 * @returns Array of absolute paths to CI config files
 */
export async function findCIConfigs(workspacePath: string): Promise<string[]> {
  try {
    const files = await fg.default(CI_CONFIG_PATTERNS, {
      cwd: workspacePath,
      absolute: true,
      onlyFiles: true,
    });
    return files;
  } catch {
    return [];
  }
}

/**
 * Ingest CI workflows and create a GatePlan.
 * @param workspacePath - Path to the workspace root
 * @returns GatePlan if CI workflows found and parseable, null otherwise
 */
export async function ingestCIWorkflows(workspacePath: string): Promise<GatePlan | null> {
  const configFiles = await findCIConfigs(workspacePath);

  if (configFiles.length === 0) {
    return null;
  }

  // Try to parse each workflow file
  const ciPlans: CIPlan[] = [];

  for (const configFile of configFiles) {
    const plan = await parseGitHubActions(configFile);
    if (plan && plan.isSimple) {
      ciPlans.push(plan);
    }
  }

  if (ciPlans.length === 0) {
    return null;
  }

  // Merge all CI plans into a single GatePlan
  return mergeCIPlans(ciPlans, workspacePath);
}

/**
 * Merge multiple CI plans into a single GatePlan.
 */
function mergeCIPlans(plans: CIPlan[], _workspacePath: string): GatePlan {
  // Collect all unique commands
  const allSetupCommands = new Set<string>();
  const allTestCommands = new Set<string>();
  const allBuildCommands = new Set<string>();
  const allLintCommands = new Set<string>();

  let nodeVersion: string | null = null;
  let pythonVersion: string | null = null;
  const sourceFiles: string[] = [];

  for (const plan of plans) {
    plan.setupCommands.forEach((cmd) => allSetupCommands.add(cmd));
    plan.testCommands.forEach((cmd) => allTestCommands.add(cmd));
    plan.buildCommands.forEach((cmd) => allBuildCommands.add(cmd));
    plan.lintCommands.forEach((cmd) => allLintCommands.add(cmd));

    if (plan.nodeVersion && !nodeVersion) {
      nodeVersion = plan.nodeVersion;
    }
    if (plan.pythonVersion && !pythonVersion) {
      pythonVersion = plan.pythonVersion;
    }
    sourceFiles.push(plan.source);
  }

  // Determine runtime type
  let runtime: RuntimeType = RuntimeType.GENERIC;
  let runtimeVersion: string | null = null;

  if (nodeVersion) {
    runtime = RuntimeType.NODE;
    runtimeVersion = nodeVersion;
  } else if (pythonVersion) {
    runtime = RuntimeType.PYTHON;
    runtimeVersion = pythonVersion;
  }

  // Build setup commands
  const setupCommands = Array.from(allSetupCommands).map((cmd, idx) => ({
    name: `setup-${idx + 1}`,
    command: cmd,
    timeout: 300,
    expectedExit: 0,
  }));

  // Build test commands (combine test, lint, build)
  const testCommands = [
    ...Array.from(allLintCommands).map((cmd, idx) => ({
      name: `lint-${idx + 1}`,
      command: cmd,
      timeout: 120,
      expectedExit: 0,
    })),
    ...Array.from(allTestCommands).map((cmd, idx) => ({
      name: `test-${idx + 1}`,
      command: cmd,
      timeout: 300,
      expectedExit: 0,
    })),
    ...Array.from(allBuildCommands).map((cmd, idx) => ({
      name: `build-${idx + 1}`,
      command: cmd,
      timeout: 300,
      expectedExit: 0,
    })),
  ];

  return {
    id: nanoid(),
    source: GatePlanSource.CI_WORKFLOW,
    sourceFile: sourceFiles.join(', '),
    environment: {
      runtime,
      runtimeVersion,
      setupCommands,
    },
    contracts: {
      requiredFiles: [],
      requiredSchemas: [],
      forbiddenPatterns: [],
      namingConventions: [],
    },
    tests: testCommands,
    blackbox: [],
    policy: {
      networkAllowed: false,
      maxRuntimeSeconds: 600,
      maxDiskMb: null,
      disallowedCommands: [],
    },
  };
}

/**
 * Check if a workspace has any CI configuration.
 * @param workspacePath - Path to the workspace root
 * @returns true if CI configs exist
 */
export async function hasCIConfig(workspacePath: string): Promise<boolean> {
  const configs = await findCIConfigs(workspacePath);
  return configs.length > 0;
}
