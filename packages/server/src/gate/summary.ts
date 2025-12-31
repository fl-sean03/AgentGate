/**
 * Summary generator for GatePlan.
 * Creates human-readable summaries for agents.
 */

import { GatePlanSource, RuntimeType, type GatePlan } from '../types/index.js';

/**
 * Generate a human-readable summary of a GatePlan.
 * This is designed to be included in agent prompts.
 *
 * @param plan - The GatePlan to summarize
 * @returns Human-readable summary string
 */
export function generateGateSummary(plan: GatePlan): string {
  const lines: string[] = [];

  // Header
  lines.push('## Verification Gate Plan');
  lines.push('');

  // Source information
  lines.push(`**Source:** ${formatSource(plan.source)}`);
  if (plan.sourceFile) {
    lines.push(`**Config File:** ${plan.sourceFile}`);
  }
  lines.push('');

  // Environment
  lines.push('### Environment');
  lines.push(`- **Runtime:** ${formatRuntime(plan.environment.runtime)}`);
  if (plan.environment.runtimeVersion) {
    lines.push(`- **Version:** ${plan.environment.runtimeVersion}`);
  }

  if (plan.environment.setupCommands.length > 0) {
    lines.push('- **Setup Commands:**');
    for (const cmd of plan.environment.setupCommands) {
      lines.push(`  - \`${cmd.command}\``);
    }
  }
  lines.push('');

  // Contracts
  if (hasContracts(plan)) {
    lines.push('### Contracts');

    if (plan.contracts.requiredFiles.length > 0) {
      lines.push('- **Required Files:**');
      for (const file of plan.contracts.requiredFiles) {
        lines.push(`  - ${file}`);
      }
    }

    if (plan.contracts.forbiddenPatterns.length > 0) {
      lines.push('- **Forbidden Patterns:**');
      for (const pattern of plan.contracts.forbiddenPatterns) {
        lines.push(`  - ${pattern}`);
      }
    }

    if (plan.contracts.namingConventions.length > 0) {
      lines.push('- **Naming Conventions:**');
      for (const rule of plan.contracts.namingConventions) {
        lines.push(`  - ${rule.pattern}: ${rule.rule}`);
      }
    }

    if (plan.contracts.requiredSchemas.length > 0) {
      lines.push('- **Schema Validations:**');
      for (const schema of plan.contracts.requiredSchemas) {
        lines.push(`  - ${schema.file} (${schema.schema})`);
      }
    }
    lines.push('');
  }

  // Tests
  if (plan.tests.length > 0) {
    lines.push('### Tests');
    lines.push('The following commands will be run to verify your changes:');
    lines.push('');
    for (const test of plan.tests) {
      lines.push(`- **${test.name}:** \`${test.command}\``);
      if (test.timeout !== 120) {
        lines.push(`  - Timeout: ${test.timeout}s`);
      }
      if (test.expectedExit !== 0) {
        lines.push(`  - Expected exit: ${test.expectedExit}`);
      }
    }
    lines.push('');
  }

  // Blackbox tests
  if (plan.blackbox.length > 0) {
    lines.push('### Blackbox Tests');
    lines.push('The following blackbox tests will validate outputs:');
    lines.push('');
    for (const bb of plan.blackbox) {
      lines.push(`- **${bb.name}:** \`${bb.command}\``);
      lines.push(`  - Fixture: ${bb.fixture}`);
      lines.push(`  - Assertions: ${bb.assertions.length}`);
    }
    lines.push('');
  }

  // Policy
  lines.push('### Execution Policy');
  lines.push(`- **Network Access:** ${plan.policy.networkAllowed ? 'Allowed' : 'Denied'}`);
  lines.push(`- **Max Runtime:** ${plan.policy.maxRuntimeSeconds}s`);
  if (plan.policy.maxDiskMb) {
    lines.push(`- **Max Disk:** ${plan.policy.maxDiskMb} MB`);
  }
  if (plan.policy.disallowedCommands.length > 0) {
    lines.push('- **Disallowed Commands:**');
    for (const cmd of plan.policy.disallowedCommands) {
      lines.push(`  - ${cmd}`);
    }
  }
  lines.push('');

  // Summary stats
  lines.push('### Summary');
  lines.push(`- ${plan.tests.length} test command(s)`);
  lines.push(`- ${plan.blackbox.length} blackbox test(s)`);
  lines.push(`- ${plan.contracts.requiredFiles.length} required file(s)`);
  lines.push(`- ${plan.contracts.forbiddenPatterns.length} forbidden pattern(s)`);

  return lines.join('\n');
}

/**
 * Generate a compact one-line summary.
 * @param plan - The GatePlan to summarize
 * @returns Compact summary string
 */
export function generateCompactSummary(plan: GatePlan): string {
  const parts: string[] = [];

  parts.push(`[${formatSource(plan.source)}]`);

  if (plan.environment.runtime !== RuntimeType.GENERIC) {
    const version = plan.environment.runtimeVersion ? ` ${plan.environment.runtimeVersion}` : '';
    parts.push(`${formatRuntime(plan.environment.runtime)}${version}`);
  }

  if (plan.tests.length > 0) {
    parts.push(`${plan.tests.length} tests`);
  }

  if (plan.blackbox.length > 0) {
    parts.push(`${plan.blackbox.length} blackbox`);
  }

  if (plan.contracts.requiredFiles.length > 0) {
    parts.push(`${plan.contracts.requiredFiles.length} required files`);
  }

  if (!plan.policy.networkAllowed) {
    parts.push('no-network');
  }

  return parts.join(' | ');
}

/**
 * Generate a JSON-friendly summary object.
 * @param plan - The GatePlan to summarize
 * @returns Summary object
 */
export function generateSummaryObject(plan: GatePlan): {
  source: string;
  sourceFile: string | null;
  runtime: string;
  runtimeVersion: string | null;
  testCount: number;
  blackboxCount: number;
  requiredFileCount: number;
  forbiddenPatternCount: number;
  networkAllowed: boolean;
  maxRuntimeSeconds: number;
} {
  return {
    source: plan.source,
    sourceFile: plan.sourceFile,
    runtime: plan.environment.runtime,
    runtimeVersion: plan.environment.runtimeVersion,
    testCount: plan.tests.length,
    blackboxCount: plan.blackbox.length,
    requiredFileCount: plan.contracts.requiredFiles.length,
    forbiddenPatternCount: plan.contracts.forbiddenPatterns.length,
    networkAllowed: plan.policy.networkAllowed,
    maxRuntimeSeconds: plan.policy.maxRuntimeSeconds,
  };
}

/**
 * Format source for display.
 */
function formatSource(source: GatePlanSource): string {
  switch (source) {
    case GatePlanSource.VERIFY_PROFILE:
      return 'verify.yaml';
    case GatePlanSource.CI_WORKFLOW:
      return 'CI Workflow';
    case GatePlanSource.AUTO:
      return 'Auto-detected';
    case GatePlanSource.DEFAULT:
      return 'Default';
    default:
      return source;
  }
}

/**
 * Format runtime for display.
 */
function formatRuntime(runtime: RuntimeType): string {
  switch (runtime) {
    case RuntimeType.NODE:
      return 'Node.js';
    case RuntimeType.PYTHON:
      return 'Python';
    case RuntimeType.GENERIC:
      return 'Generic';
    default:
      return runtime;
  }
}

/**
 * Check if plan has any contract rules.
 */
function hasContracts(plan: GatePlan): boolean {
  return (
    plan.contracts.requiredFiles.length > 0 ||
    plan.contracts.forbiddenPatterns.length > 0 ||
    plan.contracts.namingConventions.length > 0 ||
    plan.contracts.requiredSchemas.length > 0
  );
}
