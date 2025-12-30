/**
 * Normalizer module.
 * Converts various input formats to the internal GatePlan format.
 */

import { nanoid } from 'nanoid';
import {
  RuntimeType,
  GatePlanSource,
  type GatePlan,
  type VerifyProfile,
  type Command,
  type SchemaCheck,
  type SchemaRule,
  type NamingRule,
  type BlackboxTest,
  type Assertion,
} from '../types/index.js';
import type { CIPlan } from './github-actions-parser.js';

/**
 * Input type for schema rules from verify.yaml.
 */
type SchemaRuleInput =
  | { has_field: string }
  | { field_type: { field: string; type: string } }
  | { matches_regex: { field: string; pattern: string } }
  | { json_schema: string };

/**
 * Normalize a VerifyProfile to a GatePlan.
 * @param profile - Parsed verify.yaml profile
 * @param sourcePath - Path to the source file
 * @returns Normalized GatePlan
 */
export function normalizeFromProfile(profile: VerifyProfile, sourcePath?: string): GatePlan {
  // Convert runtime
  const runtime = profile.environment.runtime as RuntimeType;

  // Convert setup commands
  const setupCommands: Command[] = profile.environment.setup.map((cmd, idx) => ({
    name: `setup-${idx + 1}`,
    command: cmd,
    timeout: 300,
    expectedExit: 0,
  }));

  // Convert test commands
  const tests: Command[] = profile.tests.map((test) => ({
    name: test.name,
    command: test.command,
    timeout: test.timeout,
    expectedExit: test.expected_exit,
  }));

  // Convert schema checks
  const requiredSchemas: SchemaCheck[] = profile.contracts.required_schemas.map((schema) => ({
    file: schema.file,
    schema: schema.schema,
    rules: convertSchemaRules(schema.rules as SchemaRuleInput[]),
  }));

  // Convert naming conventions
  const namingConventions: NamingRule[] = profile.contracts.naming_conventions.map((nc) => ({
    pattern: nc.pattern,
    rule: nc.rule,
  }));

  // Convert blackbox tests
  const blackbox: BlackboxTest[] = profile.blackbox.map((bb) => ({
    name: bb.name,
    fixture: bb.fixture,
    command: bb.command,
    assertions: bb.assertions as Assertion[],
  }));

  return {
    id: nanoid(),
    source: GatePlanSource.VERIFY_PROFILE,
    sourceFile: sourcePath ?? null,
    environment: {
      runtime,
      runtimeVersion: profile.environment.version ?? null,
      setupCommands,
    },
    contracts: {
      requiredFiles: profile.contracts.required_files,
      requiredSchemas,
      forbiddenPatterns: profile.contracts.forbidden_patterns,
      namingConventions,
    },
    tests,
    blackbox,
    policy: {
      networkAllowed: profile.policy.network,
      maxRuntimeSeconds: profile.policy.max_runtime,
      maxDiskMb: profile.policy.max_disk_mb ?? null,
      disallowedCommands: profile.policy.disallowed_commands,
    },
  };
}

/**
 * Convert schema rules from profile format to internal format.
 */
function convertSchemaRules(rules: SchemaRuleInput[]): SchemaRule[] {
  return rules.map((rule) => {
    if ('has_field' in rule) {
      return { type: 'has_field', field: rule.has_field };
    }
    if ('field_type' in rule) {
      return {
        type: 'field_type',
        field: rule.field_type.field,
        expectedType: rule.field_type.type,
      };
    }
    if ('matches_regex' in rule) {
      return {
        type: 'matches_regex',
        field: rule.matches_regex.field,
        pattern: rule.matches_regex.pattern,
      };
    }
    if ('json_schema' in rule) {
      return { type: 'json_schema', schemaPath: rule.json_schema };
    }
    // Fallback (should never happen with proper typing)
    throw new Error(`Unknown schema rule type: ${JSON.stringify(rule)}`);
  });
}

/**
 * Normalize a CIPlan to a GatePlan.
 * @param ciPlan - Parsed CI workflow plan
 * @returns Normalized GatePlan
 */
export function normalizeFromCI(ciPlan: CIPlan): GatePlan {
  // Determine runtime
  let runtime: RuntimeType = RuntimeType.GENERIC;
  let runtimeVersion: string | null = null;

  if (ciPlan.nodeVersion) {
    runtime = RuntimeType.NODE;
    runtimeVersion = ciPlan.nodeVersion;
  } else if (ciPlan.pythonVersion) {
    runtime = RuntimeType.PYTHON;
    runtimeVersion = ciPlan.pythonVersion;
  }

  // Convert setup commands
  const setupCommands: Command[] = ciPlan.setupCommands.map((cmd, idx) => ({
    name: `setup-${idx + 1}`,
    command: cmd,
    timeout: 300,
    expectedExit: 0,
  }));

  // Convert test commands
  const tests: Command[] = [
    ...ciPlan.lintCommands.map((cmd, idx) => ({
      name: `lint-${idx + 1}`,
      command: cmd,
      timeout: 120,
      expectedExit: 0,
    })),
    ...ciPlan.testCommands.map((cmd, idx) => ({
      name: `test-${idx + 1}`,
      command: cmd,
      timeout: 300,
      expectedExit: 0,
    })),
    ...ciPlan.buildCommands.map((cmd, idx) => ({
      name: `build-${idx + 1}`,
      command: cmd,
      timeout: 300,
      expectedExit: 0,
    })),
  ];

  return {
    id: nanoid(),
    source: GatePlanSource.CI_WORKFLOW,
    sourceFile: ciPlan.source,
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
    tests,
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
 * Create a default GatePlan when no configuration is found.
 * @returns Default GatePlan with minimal checks
 */
export function createDefaultPlan(): GatePlan {
  return {
    id: nanoid(),
    source: GatePlanSource.DEFAULT,
    sourceFile: null,
    environment: {
      runtime: RuntimeType.GENERIC,
      runtimeVersion: null,
      setupCommands: [],
    },
    contracts: {
      requiredFiles: [],
      requiredSchemas: [],
      forbiddenPatterns: [
        '**/.env',
        '**/.env.*',
        '**/secrets/**',
        '**/*.pem',
        '**/*.key',
      ],
      namingConventions: [],
    },
    tests: [],
    blackbox: [],
    policy: {
      networkAllowed: false,
      maxRuntimeSeconds: 600,
      maxDiskMb: null,
      disallowedCommands: ['rm -rf /', 'sudo rm -rf'],
    },
  };
}

/**
 * Merge two GatePlans, with override taking precedence.
 * @param base - Base plan
 * @param override - Partial plan to merge on top
 * @returns Merged GatePlan
 */
export function mergePlans(base: GatePlan, override: Partial<GatePlan>): GatePlan {
  return {
    id: override.id ?? base.id,
    source: override.source ?? base.source,
    sourceFile: override.sourceFile ?? base.sourceFile,
    environment: {
      runtime: override.environment?.runtime ?? base.environment.runtime,
      runtimeVersion: override.environment?.runtimeVersion ?? base.environment.runtimeVersion,
      setupCommands: override.environment?.setupCommands ?? base.environment.setupCommands,
    },
    contracts: {
      requiredFiles: mergeArrays(
        base.contracts.requiredFiles,
        override.contracts?.requiredFiles
      ),
      requiredSchemas: override.contracts?.requiredSchemas ?? base.contracts.requiredSchemas,
      forbiddenPatterns: mergeArrays(
        base.contracts.forbiddenPatterns,
        override.contracts?.forbiddenPatterns
      ),
      namingConventions:
        override.contracts?.namingConventions ?? base.contracts.namingConventions,
    },
    tests: override.tests ?? base.tests,
    blackbox: override.blackbox ?? base.blackbox,
    policy: {
      networkAllowed: override.policy?.networkAllowed ?? base.policy.networkAllowed,
      maxRuntimeSeconds: override.policy?.maxRuntimeSeconds ?? base.policy.maxRuntimeSeconds,
      maxDiskMb: override.policy?.maxDiskMb ?? base.policy.maxDiskMb,
      disallowedCommands: mergeArrays(
        base.policy.disallowedCommands,
        override.policy?.disallowedCommands
      ),
    },
  };
}

/**
 * Merge two arrays, removing duplicates.
 */
function mergeArrays<T>(base: T[], override?: T[]): T[] {
  if (!override) {
    return base;
  }
  return Array.from(new Set([...base, ...override]));
}
