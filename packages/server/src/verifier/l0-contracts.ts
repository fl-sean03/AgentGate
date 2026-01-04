/**
 * L0 Contract verification.
 * Checks required files, forbidden patterns, schemas, and naming conventions.
 */

import { access, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import fg from 'fast-glob';
import Ajv, { type ValidateFunction, type ErrorObject, type AnySchema } from 'ajv';
import { VerificationLevel, type LevelResult, type CheckResult } from '../types/index.js';
import type { VerifyContext } from './types.js';
import { createLogger } from '../utils/logger.js';
import {
  isSecurityEngineEnabled,
  runSecurityVerification,
} from '../security/integration/index.js';

const log = createLogger('l0-contracts');

/**
 * Schema cache for JSON Schema validation.
 * Maps schema path to compiled validate function.
 */
const schemaCache = new Map<string, ValidateFunction>();

/**
 * Ajv instance for JSON Schema validation.
 * Using strict mode and all errors for comprehensive validation.
 */
const ajv = new Ajv({
  strict: true,
  allErrors: true,
  verbose: true,
});

/**
 * Clear the schema cache. Useful for testing.
 */
export function clearSchemaCache(): void {
  schemaCache.clear();
}

/**
 * Get the current schema cache size. Useful for testing.
 */
export function getSchemaCacheSize(): number {
  return schemaCache.size;
}

/**
 * Run L0 contract verification.
 * @param ctx - Verification context
 * @returns L0 verification result
 */
export async function verifyL0(ctx: VerifyContext): Promise<LevelResult> {
  const startTime = Date.now();
  const checks: CheckResult[] = [];
  const { gatePlan, workDir } = ctx;

  log.debug({ workDir }, 'Starting L0 contract verification');

  // Check required files
  const requiredFilesResult = await checkRequiredFiles(
    workDir,
    gatePlan.contracts.requiredFiles,
    ctx
  );
  checks.push(requiredFilesResult);

  // Check forbidden patterns / security verification
  // Use new Security Engine if enabled, otherwise fall back to legacy checkForbiddenPatterns
  if (isSecurityEngineEnabled()) {
    log.debug({ workDir }, 'Using new Security Policy Engine');
    const securityResult = await runSecurityVerification(workDir, ctx);
    checks.push(securityResult);
  } else {
    // Legacy: Check forbidden patterns
    // @deprecated - Will be removed when Security Engine is fully rolled out
    const forbiddenResult = await checkForbiddenPatterns(
      workDir,
      gatePlan.contracts.forbiddenPatterns,
      ctx
    );
    checks.push(forbiddenResult);
  }

  // Check schemas
  for (const schemaCheck of gatePlan.contracts.requiredSchemas) {
    const schemaResult = await checkSchema(workDir, schemaCheck, ctx);
    checks.push(schemaResult);
  }

  // Check naming conventions
  for (const namingRule of gatePlan.contracts.namingConventions) {
    const namingResult = await checkNamingConvention(workDir, namingRule, ctx);
    checks.push(namingResult);
  }

  const duration = Date.now() - startTime;
  const passed = checks.every((c) => c.passed);

  const result: LevelResult = {
    level: VerificationLevel.L0,
    passed,
    checks,
    duration,
  };

  log.info(
    { passed, checkCount: checks.length, duration },
    'L0 verification complete'
  );

  return result;
}

/**
 * Check that all required files exist.
 */
async function checkRequiredFiles(
  workDir: string,
  requiredFiles: string[],
  ctx: VerifyContext
): Promise<CheckResult> {
  if (requiredFiles.length === 0) {
    return {
      name: 'required-files',
      passed: true,
      message: 'No required files specified',
      details: null,
    };
  }

  const missing: string[] = [];

  for (const file of requiredFiles) {
    const filePath = join(workDir, file);
    try {
      await access(filePath);
    } catch {
      missing.push(file);
      ctx.diagnostics.push({
        level: VerificationLevel.L0,
        type: 'missing_file',
        message: `Required file not found: ${file}`,
        file,
      });
    }
  }

  if (missing.length > 0) {
    return {
      name: 'required-files',
      passed: false,
      message: `Missing ${missing.length} required file(s)`,
      details: `Missing: ${missing.join(', ')}`,
    };
  }

  return {
    name: 'required-files',
    passed: true,
    message: `All ${requiredFiles.length} required file(s) present`,
    details: null,
  };
}

/**
 * Check that no forbidden patterns are present.
 */
async function checkForbiddenPatterns(
  workDir: string,
  forbiddenPatterns: string[],
  ctx: VerifyContext
): Promise<CheckResult> {
  if (forbiddenPatterns.length === 0) {
    return {
      name: 'forbidden-patterns',
      passed: true,
      message: 'No forbidden patterns specified',
      details: null,
    };
  }

  const found: string[] = [];

  try {
    // Build ignore patterns - start with standard excludes
    const ignorePatterns = ['**/node_modules/**', '**/dist/**', '**/.git/**'];

    // Read .gitignore to exclude already-ignored files (enables dogfooding with local .env files)
    try {
      const gitignorePath = join(workDir, '.gitignore');
      const gitignoreContent = await readFile(gitignorePath, 'utf-8');
      const gitignoreLines = gitignoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => line.startsWith('!') ? line : `**/${line.replace(/^\//, '')}`);
      ignorePatterns.push(...gitignoreLines);
    } catch {
      // .gitignore doesn't exist or can't be read - continue without it
    }

    const matches = await fg(forbiddenPatterns, {
      cwd: workDir,
      dot: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: ignorePatterns,
    });

    for (const match of matches) {
      found.push(match);
      ctx.diagnostics.push({
        level: VerificationLevel.L0,
        type: 'forbidden_file',
        message: `Forbidden file found: ${match}`,
        file: match,
      });
    }
  } catch (error) {
    log.warn({ error }, 'Error checking forbidden patterns');
  }

  if (found.length > 0) {
    return {
      name: 'forbidden-patterns',
      passed: false,
      message: `Found ${found.length} forbidden file(s)`,
      details: `Found: ${found.slice(0, 10).join(', ')}${found.length > 10 ? '...' : ''}`,
    };
  }

  return {
    name: 'forbidden-patterns',
    passed: true,
    message: 'No forbidden files found',
    details: null,
  };
}

/**
 * Check a schema rule.
 */
async function checkSchema(
  workDir: string,
  schemaCheck: {
    file: string;
    schema: string;
    rules: Array<
      | { type: 'has_field'; field: string }
      | { type: 'field_type'; field: string; expectedType: string }
      | { type: 'matches_regex'; field: string; pattern: string }
      | { type: 'json_schema'; schemaPath: string }
    >;
  },
  ctx: VerifyContext
): Promise<CheckResult> {
  const filePath = join(workDir, schemaCheck.file);

  // Check file exists
  try {
    await access(filePath);
  } catch {
    ctx.diagnostics.push({
      level: VerificationLevel.L0,
      type: 'schema_error',
      message: `Schema target file not found: ${schemaCheck.file}`,
      file: schemaCheck.file,
    });

    return {
      name: `schema:${schemaCheck.file}`,
      passed: false,
      message: `File not found: ${schemaCheck.file}`,
      details: null,
    };
  }

  // Read and parse file
  let content: string;
  let parsed: unknown;

  try {
    content = await readFile(filePath, 'utf-8');
    parsed = JSON.parse(content);
  } catch (error) {
    ctx.diagnostics.push({
      level: VerificationLevel.L0,
      type: 'schema_error',
      message: `Failed to parse ${schemaCheck.file} as JSON`,
      file: schemaCheck.file,
      details: String(error),
    });

    return {
      name: `schema:${schemaCheck.file}`,
      passed: false,
      message: `Failed to parse as JSON: ${schemaCheck.file}`,
      details: String(error),
    };
  }

  // Apply rules
  const failures: string[] = [];

  for (const rule of schemaCheck.rules) {
    const ruleResult = await checkSchemaRule(parsed, rule, workDir);
    if (!ruleResult.passed) {
      failures.push(ruleResult.message);
      ctx.diagnostics.push({
        level: VerificationLevel.L0,
        type: 'schema_error',
        message: ruleResult.message,
        file: schemaCheck.file,
      });
    }
  }

  if (failures.length > 0) {
    return {
      name: `schema:${schemaCheck.file}`,
      passed: false,
      message: `${failures.length} schema rule(s) failed`,
      details: failures.join('; '),
    };
  }

  return {
    name: `schema:${schemaCheck.file}`,
    passed: true,
    message: `Schema validation passed for ${schemaCheck.file}`,
    details: null,
  };
}

/**
 * Check a single schema rule against parsed content.
 */
async function checkSchemaRule(
  parsed: unknown,
  rule:
    | { type: 'has_field'; field: string }
    | { type: 'field_type'; field: string; expectedType: string }
    | { type: 'matches_regex'; field: string; pattern: string }
    | { type: 'json_schema'; schemaPath: string },
  workDir: string
): Promise<{ passed: boolean; message: string }> {
  if (typeof parsed !== 'object' || parsed === null) {
    return { passed: false, message: 'Content is not an object' };
  }

  const obj = parsed as Record<string, unknown>;

  switch (rule.type) {
    case 'has_field': {
      const hasField = getNestedField(obj, rule.field) !== undefined;
      return {
        passed: hasField,
        message: hasField ? '' : `Missing required field: ${rule.field}`,
      };
    }

    case 'field_type': {
      const value = getNestedField(obj, rule.field);
      if (value === undefined) {
        return { passed: false, message: `Field not found: ${rule.field}` };
      }
      const actualType = typeof value;
      const passed = actualType === rule.expectedType;
      return {
        passed,
        message: passed
          ? ''
          : `Field ${rule.field} has type '${actualType}', expected '${rule.expectedType}'`,
      };
    }

    case 'matches_regex': {
      const value = getNestedField(obj, rule.field);
      if (value === undefined) {
        return { passed: false, message: `Field not found: ${rule.field}` };
      }
      if (typeof value !== 'string') {
        return { passed: false, message: `Field ${rule.field} is not a string` };
      }
      const regex = new RegExp(rule.pattern);
      const passed = regex.test(value);
      return {
        passed,
        message: passed
          ? ''
          : `Field ${rule.field} does not match pattern: ${rule.pattern}`,
      };
    }

    case 'json_schema': {
      return validateJsonSchema(parsed, rule.schemaPath, workDir);
    }

    default:
      return { passed: true, message: '' };
  }
}

/**
 * Format Ajv validation errors into a human-readable message.
 */
function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return 'Validation failed';
  }

  return errors
    .map((err) => {
      const path = err.instancePath || '/';
      const message = err.message || 'unknown error';
      const params = err.params ? ` (${JSON.stringify(err.params)})` : '';
      return `${path}: ${message}${params}`;
    })
    .join('; ');
}

/**
 * Validate data against a JSON Schema file.
 * Uses caching to avoid re-parsing and re-compiling schemas.
 */
async function validateJsonSchema(
  data: unknown,
  schemaPath: string,
  workDir: string
): Promise<{ passed: boolean; message: string }> {
  const absoluteSchemaPath = join(workDir, schemaPath);

  // Check cache first
  let validate = schemaCache.get(absoluteSchemaPath);

  if (!validate) {
    // Load and compile the schema
    try {
      await access(absoluteSchemaPath);
    } catch {
      return {
        passed: false,
        message: `JSON Schema file not found: ${schemaPath}`,
      };
    }

    let schemaContent: string;
    let schema: AnySchema;

    try {
      schemaContent = await readFile(absoluteSchemaPath, 'utf-8');
      schema = JSON.parse(schemaContent);
    } catch (error) {
      return {
        passed: false,
        message: `Failed to parse JSON Schema file ${schemaPath}: ${String(error)}`,
      };
    }

    try {
      validate = ajv.compile(schema);
      schemaCache.set(absoluteSchemaPath, validate);
      log.debug({ schemaPath }, 'Compiled and cached JSON Schema');
    } catch (error) {
      return {
        passed: false,
        message: `Failed to compile JSON Schema ${schemaPath}: ${String(error)}`,
      };
    }
  }

  // Validate the data against the schema
  // At this point validate is guaranteed to be set (either from cache or compiled)
  const valid = validate!(data);

  if (valid) {
    return { passed: true, message: '' };
  }

  return {
    passed: false,
    message: `JSON Schema validation failed: ${formatAjvErrors(validate!.errors)}`,
  };
}

/**
 * Get a nested field value using dot notation.
 */
function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Check a naming convention rule.
 */
async function checkNamingConvention(
  workDir: string,
  rule: { pattern: string; rule: string },
  ctx: VerifyContext
): Promise<CheckResult> {
  // Find files matching the pattern
  const files = await fg(rule.pattern, {
    cwd: workDir,
    dot: true,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  });

  if (files.length === 0) {
    return {
      name: `naming:${rule.pattern}`,
      passed: true,
      message: `No files match pattern: ${rule.pattern}`,
      details: null,
    };
  }

  const violations: string[] = [];

  for (const file of files) {
    const filename = basename(file);
    const ext = extname(file);
    const nameWithoutExt = filename.slice(0, -ext.length || undefined);

    if (!checkNamingRule(nameWithoutExt, rule.rule)) {
      violations.push(file);
      ctx.diagnostics.push({
        level: VerificationLevel.L0,
        type: 'naming_violation',
        message: `File ${file} violates naming convention: ${rule.rule}`,
        file,
      });
    }
  }

  if (violations.length > 0) {
    return {
      name: `naming:${rule.pattern}`,
      passed: false,
      message: `${violations.length} file(s) violate naming convention`,
      details: violations.slice(0, 5).join(', '),
    };
  }

  return {
    name: `naming:${rule.pattern}`,
    passed: true,
    message: `All ${files.length} file(s) follow naming convention`,
    details: null,
  };
}

/**
 * Check if a name follows a naming rule.
 */
function checkNamingRule(name: string, rule: string): boolean {
  switch (rule.toLowerCase()) {
    case 'kebab-case':
      return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
    case 'camelcase':
      return /^[a-z][a-zA-Z0-9]*$/.test(name);
    case 'pascalcase':
      return /^[A-Z][a-zA-Z0-9]*$/.test(name);
    case 'snake_case':
      return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
    case 'screaming_snake_case':
    case 'constant_case':
      return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name);
    default:
      // Treat rule as a regex pattern
      try {
        return new RegExp(rule).test(name);
      } catch {
        return true; // Invalid regex, pass by default
      }
  }
}
