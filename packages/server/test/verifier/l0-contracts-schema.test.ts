/**
 * Tests for JSON Schema validation in L0 contracts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  verifyL0,
  clearSchemaCache,
  getSchemaCacheSize,
} from '../../src/verifier/l0-contracts.js';
import { VerificationLevel, type GatePlan } from '../../src/types/index.js';
import type { VerifyContext } from '../../src/verifier/types.js';

/**
 * Create a minimal GatePlan for testing schema validation.
 */
function createGatePlan(requiredSchemas: GatePlan['contracts']['requiredSchemas']): GatePlan {
  return {
    source: 'test',
    environment: {
      runtime: 'generic',
    },
    contracts: {
      requiredFiles: [],
      forbiddenPatterns: [],
      requiredSchemas,
      namingConventions: [],
    },
    executionPolicy: {
      networkAccess: 'denied',
      maxRuntimeSeconds: 60,
      disallowedCommands: [],
    },
    testCommands: [],
    blackboxTests: [],
  };
}

/**
 * Create a VerifyContext for testing.
 */
function createVerifyContext(workDir: string, gatePlan: GatePlan): VerifyContext {
  return {
    workDir,
    gatePlan,
    cleanRoom: null,
    startTime: new Date(),
    timeoutMs: 60000,
    results: {
      l0: null,
      l1: null,
      l2: null,
      l3: null,
    },
    diagnostics: [],
  };
}

describe('L0 Contracts - JSON Schema Validation', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    const uniqueId = randomBytes(8).toString('hex');
    testDir = join(tmpdir(), `l0-schema-test-${uniqueId}`);
    await mkdir(testDir, { recursive: true });
    // Clear the schema cache before each test
    clearSchemaCache();
  });

  afterEach(async () => {
    // Clean up the temp directory
    await rm(testDir, { recursive: true, force: true });
    clearSchemaCache();
  });

  describe('validateJsonSchema', () => {
    it('should pass validation when data matches the schema', async () => {
      // Create a JSON Schema
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
        },
        required: ['name', 'version'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create a valid data file
      const data = { name: 'my-project', version: '1.0.0' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(true);
      expect(result.checks.find((c) => c.name === 'schema:data.json')?.passed).toBe(true);
    });

    it('should fail validation when required field is missing', async () => {
      // Create a JSON Schema
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
        },
        required: ['name', 'version'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create an invalid data file (missing 'version')
      const data = { name: 'my-project' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(false);
      const schemaCheck = result.checks.find((c) => c.name === 'schema:data.json');
      expect(schemaCheck?.passed).toBe(false);
      expect(schemaCheck?.details).toContain('version');
    });

    it('should fail validation when field has wrong type', async () => {
      // Create a JSON Schema
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          count: { type: 'number' },
        },
        required: ['count'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create an invalid data file (count is string instead of number)
      const data = { count: 'not-a-number' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(false);
      const schemaCheck = result.checks.find((c) => c.name === 'schema:data.json');
      expect(schemaCheck?.passed).toBe(false);
      expect(schemaCheck?.details).toContain('number');
    });

    it('should fail when schema file does not exist', async () => {
      // Create a valid data file
      const data = { name: 'my-project' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'nonexistent-schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(false);
      const schemaCheck = result.checks.find((c) => c.name === 'schema:data.json');
      expect(schemaCheck?.passed).toBe(false);
      expect(schemaCheck?.details).toContain('not found');
    });

    it('should fail when schema file is invalid JSON', async () => {
      // Create an invalid JSON schema file
      await writeFile(join(testDir, 'invalid-schema.json'), 'not valid json {{{');

      // Create a data file
      const data = { name: 'my-project' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'invalid-schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(false);
      const schemaCheck = result.checks.find((c) => c.name === 'schema:data.json');
      expect(schemaCheck?.passed).toBe(false);
      expect(schemaCheck?.details).toContain('parse');
    });

    it('should fail when schema is not a valid JSON Schema', async () => {
      // Create an invalid JSON Schema (type is wrong)
      const invalidSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'invalid-type-that-does-not-exist',
      };
      await writeFile(join(testDir, 'invalid-schema.json'), JSON.stringify(invalidSchema));

      // Create a data file
      const data = { name: 'my-project' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'invalid-schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(false);
      const schemaCheck = result.checks.find((c) => c.name === 'schema:data.json');
      expect(schemaCheck?.passed).toBe(false);
      expect(schemaCheck?.details).toContain('compile');
    });

    it('should validate nested objects', async () => {
      // Create a JSON Schema with nested objects
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer', minimum: 0 },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create a valid data file
      const data = { user: { name: 'John', age: 30 } };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(true);
    });

    it('should validate arrays', async () => {
      // Create a JSON Schema with array validation
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
        },
        required: ['items'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create a valid data file
      const data = { items: ['one', 'two', 'three'] };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(true);
    });

    it('should fail when array has wrong item types', async () => {
      // Create a JSON Schema with array validation
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['items'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create an invalid data file (array contains numbers)
      const data = { items: ['one', 2, 'three'] };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(false);
      const schemaCheck = result.checks.find((c) => c.name === 'schema:data.json');
      expect(schemaCheck?.passed).toBe(false);
    });

    it('should validate with pattern constraints', async () => {
      // Create a JSON Schema with pattern validation
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          email: {
            type: 'string',
            pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          },
        },
        required: ['email'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create a valid data file
      const data = { email: 'test@example.com' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(true);
    });

    it('should fail when pattern constraint is violated', async () => {
      // Create a JSON Schema with pattern validation
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          email: {
            type: 'string',
            pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          },
        },
        required: ['email'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create an invalid data file
      const data = { email: 'not-an-email' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(false);
      const schemaCheck = result.checks.find((c) => c.name === 'schema:data.json');
      expect(schemaCheck?.passed).toBe(false);
      expect(schemaCheck?.details).toContain('pattern');
    });

    it('should add diagnostics for schema validation failures', async () => {
      // Create a JSON Schema
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create an invalid data file
      const data = { notName: 'value' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      await verifyL0(ctx);

      expect(ctx.diagnostics.length).toBeGreaterThan(0);
      expect(ctx.diagnostics.some((d) => d.type === 'schema_error')).toBe(true);
      expect(ctx.diagnostics.some((d) => d.level === VerificationLevel.L0)).toBe(true);
    });
  });

  describe('Schema Caching', () => {
    it('should cache compiled schemas', async () => {
      // Create a JSON Schema
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create data files
      const data1 = { name: 'project1' };
      const data2 = { name: 'project2' };
      await writeFile(join(testDir, 'data1.json'), JSON.stringify(data1));
      await writeFile(join(testDir, 'data2.json'), JSON.stringify(data2));

      expect(getSchemaCacheSize()).toBe(0);

      // Validate first file
      const gatePlan1 = createGatePlan([
        {
          file: 'data1.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);
      const ctx1 = createVerifyContext(testDir, gatePlan1);
      await verifyL0(ctx1);

      expect(getSchemaCacheSize()).toBe(1);

      // Validate second file with same schema
      const gatePlan2 = createGatePlan([
        {
          file: 'data2.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);
      const ctx2 = createVerifyContext(testDir, gatePlan2);
      await verifyL0(ctx2);

      // Cache size should still be 1 (reused)
      expect(getSchemaCacheSize()).toBe(1);
    });

    it('should cache different schemas separately', async () => {
      // Create two different schemas
      const schema1 = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };
      const schema2 = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { version: { type: 'string' } },
        required: ['version'],
      };
      await writeFile(join(testDir, 'schema1.json'), JSON.stringify(schema1));
      await writeFile(join(testDir, 'schema2.json'), JSON.stringify(schema2));

      // Create data files
      const data1 = { name: 'project' };
      const data2 = { version: '1.0.0' };
      await writeFile(join(testDir, 'data1.json'), JSON.stringify(data1));
      await writeFile(join(testDir, 'data2.json'), JSON.stringify(data2));

      expect(getSchemaCacheSize()).toBe(0);

      // Validate with both schemas
      const gatePlan = createGatePlan([
        {
          file: 'data1.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema1.json' }],
        },
        {
          file: 'data2.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema2.json' }],
        },
      ]);
      const ctx = createVerifyContext(testDir, gatePlan);
      await verifyL0(ctx);

      // Should have 2 cached schemas
      expect(getSchemaCacheSize()).toBe(2);
    });

    it('should clear cache when clearSchemaCache is called', async () => {
      // Create a schema and validate
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));
      const data = { name: 'project' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);
      const ctx = createVerifyContext(testDir, gatePlan);
      await verifyL0(ctx);

      expect(getSchemaCacheSize()).toBe(1);

      clearSchemaCache();

      expect(getSchemaCacheSize()).toBe(0);
    });
  });

  describe('Multiple Rules Integration', () => {
    it('should combine json_schema with other rule types', async () => {
      // Create a JSON Schema
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
        },
        required: ['name', 'version'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create a valid data file
      const data = { name: 'my-project', version: '1.0.0' };
      await writeFile(join(testDir, 'package.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'package.json',
          schema: 'json',
          rules: [
            { type: 'has_field', field: 'name' },
            { type: 'field_type', field: 'version', expectedType: 'string' },
            { type: 'matches_regex', field: 'version', pattern: '^\\d+\\.\\d+\\.\\d+$' },
            { type: 'json_schema', schemaPath: 'schema.json' },
          ],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(true);
    });

    it('should fail if any rule fails (mixed rules)', async () => {
      // Create a JSON Schema
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
        },
        required: ['name', 'version'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Create a data file that passes schema but fails regex
      const data = { name: 'my-project', version: 'invalid-version' };
      await writeFile(join(testDir, 'package.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'package.json',
          schema: 'json',
          rules: [
            { type: 'json_schema', schemaPath: 'schema.json' },
            { type: 'matches_regex', field: 'version', pattern: '^\\d+\\.\\d+\\.\\d+$' },
          ],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(false);
      const schemaCheck = result.checks.find((c) => c.name === 'schema:package.json');
      expect(schemaCheck?.passed).toBe(false);
      expect(schemaCheck?.details).toContain('pattern');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty object data', async () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        additionalProperties: false,
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      const data = {};
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(true);
    });

    it('should validate with additionalProperties: false', async () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Data with extra property should fail
      const data = { name: 'test', extra: 'not-allowed' };
      await writeFile(join(testDir, 'data.json'), JSON.stringify(data));

      const gatePlan = createGatePlan([
        {
          file: 'data.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);

      const ctx = createVerifyContext(testDir, gatePlan);
      const result = await verifyL0(ctx);

      expect(result.passed).toBe(false);
      const schemaCheck = result.checks.find((c) => c.name === 'schema:data.json');
      expect(schemaCheck?.passed).toBe(false);
      expect(schemaCheck?.details).toContain('additionalProperties');
    });

    it('should validate enum constraints', async () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'pending'],
          },
        },
        required: ['status'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Valid enum value
      const validData = { status: 'active' };
      await writeFile(join(testDir, 'valid.json'), JSON.stringify(validData));

      // Invalid enum value
      const invalidData = { status: 'unknown' };
      await writeFile(join(testDir, 'invalid.json'), JSON.stringify(invalidData));

      // Test valid
      const gatePlan1 = createGatePlan([
        {
          file: 'valid.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);
      const ctx1 = createVerifyContext(testDir, gatePlan1);
      const result1 = await verifyL0(ctx1);
      expect(result1.passed).toBe(true);

      // Test invalid
      const gatePlan2 = createGatePlan([
        {
          file: 'invalid.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);
      const ctx2 = createVerifyContext(testDir, gatePlan2);
      const result2 = await verifyL0(ctx2);
      expect(result2.passed).toBe(false);
    });

    it('should validate numeric constraints (minimum, maximum)', async () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          age: {
            type: 'integer',
            minimum: 0,
            maximum: 150,
          },
        },
        required: ['age'],
      };
      await writeFile(join(testDir, 'schema.json'), JSON.stringify(schema));

      // Valid value
      const validData = { age: 25 };
      await writeFile(join(testDir, 'valid.json'), JSON.stringify(validData));

      // Invalid value (negative)
      const invalidData = { age: -5 };
      await writeFile(join(testDir, 'invalid.json'), JSON.stringify(invalidData));

      // Test valid
      const gatePlan1 = createGatePlan([
        {
          file: 'valid.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);
      const ctx1 = createVerifyContext(testDir, gatePlan1);
      const result1 = await verifyL0(ctx1);
      expect(result1.passed).toBe(true);

      // Test invalid
      const gatePlan2 = createGatePlan([
        {
          file: 'invalid.json',
          schema: 'json',
          rules: [{ type: 'json_schema', schemaPath: 'schema.json' }],
        },
      ]);
      const ctx2 = createVerifyContext(testDir, gatePlan2);
      const result2 = await verifyL0(ctx2);
      expect(result2.passed).toBe(false);
    });
  });
});
