import { z } from 'zod';
import type { GatePlanSource } from './work-order.js';

// Runtime Type
export const RuntimeType = {
  NODE: 'node',
  PYTHON: 'python',
  GENERIC: 'generic',
} as const;

export type RuntimeType = (typeof RuntimeType)[keyof typeof RuntimeType];

// Environment Setup
export interface EnvironmentSetup {
  runtime: RuntimeType;
  runtimeVersion: string | null;
  setupCommands: Command[];
}

// Command
export interface Command {
  name: string;
  command: string;
  timeout: number;
  expectedExit: number;
}

// Contract Check
export interface ContractCheck {
  type: 'required_file' | 'forbidden_pattern' | 'schema' | 'naming_convention';
  pattern: string;
  config?: Record<string, unknown>;
}

// Schema Check
export interface SchemaCheck {
  file: string;
  schema: 'json' | 'yaml';
  rules: SchemaRule[];
}

export type SchemaRule =
  | { type: 'has_field'; field: string }
  | { type: 'field_type'; field: string; expectedType: string }
  | { type: 'matches_regex'; field: string; pattern: string }
  | { type: 'json_schema'; schemaPath: string };

// Blackbox Test
export interface BlackboxTest {
  name: string;
  fixture: string;
  command: string;
  assertions: Assertion[];
}

// Assertion
export type Assertion =
  | { type: 'exit_code'; expected: number }
  | { type: 'json_schema'; schema: string }
  | { type: 'contains'; value: string }
  | { type: 'matches_regex'; pattern: string }
  | { type: 'equals_file'; file: string }
  | { type: 'json_equals'; expected: unknown };

// Execution Policy
export interface ExecutionPolicy {
  networkAllowed: boolean;
  maxRuntimeSeconds: number;
  maxDiskMb: number | null;
  disallowedCommands: string[];
}

// Gate Plan (Internal Normalized Format)
export interface GatePlan {
  id: string;
  source: GatePlanSource;
  sourceFile: string | null;
  environment: EnvironmentSetup;
  contracts: {
    requiredFiles: string[];
    requiredSchemas: SchemaCheck[];
    forbiddenPatterns: string[];
    namingConventions: NamingRule[];
  };
  tests: Command[];
  blackbox: BlackboxTest[];
  policy: ExecutionPolicy;
}

// Naming Rule
export interface NamingRule {
  pattern: string;
  rule: 'kebab-case' | 'snake_case' | 'camelCase' | 'PascalCase';
}

// Verify Profile Schema (for verify.yaml)
export const verifyProfileSchema = z.object({
  version: z.string().default('1'),
  name: z.string(),
  environment: z.object({
    runtime: z.enum(['node', 'python', 'generic']).default('generic'),
    version: z.string().optional(),
    setup: z.array(z.string()).default([]),
  }).default({ runtime: 'generic', setup: [] }),
  contracts: z.object({
    required_files: z.array(z.string()).default([]),
    required_schemas: z.array(z.object({
      file: z.string(),
      schema: z.enum(['json', 'yaml']),
      rules: z.array(z.union([
        z.object({ has_field: z.string() }),
        z.object({ field_type: z.object({ field: z.string(), type: z.string() }) }),
        z.object({ matches_regex: z.object({ field: z.string(), pattern: z.string() }) }),
        z.object({ json_schema: z.string() }),
      ])).default([]),
    })).default([]),
    forbidden_patterns: z.array(z.string()).default([]),
    naming_conventions: z.array(z.object({
      pattern: z.string(),
      rule: z.enum(['kebab-case', 'snake_case', 'camelCase', 'PascalCase']),
    })).default([]),
  }).default({ required_files: [], required_schemas: [], forbidden_patterns: [], naming_conventions: [] }),
  tests: z.array(z.object({
    name: z.string(),
    command: z.string(),
    timeout: z.number().positive().default(120),
    expected_exit: z.number().int().default(0),
  })).default([]),
  blackbox: z.array(z.object({
    name: z.string(),
    fixture: z.string(),
    command: z.string(),
    assertions: z.array(z.union([
      z.object({ type: z.literal('exit_code'), expected: z.number() }),
      z.object({ type: z.literal('json_schema'), schema: z.string() }),
      z.object({ type: z.literal('contains'), value: z.string() }),
      z.object({ type: z.literal('matches_regex'), pattern: z.string() }),
      z.object({ type: z.literal('equals_file'), file: z.string() }),
      z.object({ type: z.literal('json_equals'), expected: z.unknown() }),
    ])),
  })).default([]),
  policy: z.object({
    network: z.boolean().default(false),
    max_runtime: z.number().positive().default(600),
    max_disk_mb: z.number().positive().optional(),
    disallowed_commands: z.array(z.string()).default([]),
  }).default({ network: false, max_runtime: 600, disallowed_commands: [] }),
});

export type VerifyProfile = z.infer<typeof verifyProfileSchema>;
