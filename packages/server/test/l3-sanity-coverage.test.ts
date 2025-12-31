/**
 * L3 Sanity Test Coverage Check Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { verifyL3 } from '../src/verifier/l3-sanity.js';
import { VerificationLevel } from '../src/types/index.js';
import type { VerifyContext } from '../src/verifier/types.js';
import type { GatePlan } from '../src/types/index.js';

describe('L3 Sanity - Test Coverage Check', () => {
  let tempDir: string;
  let ctx: VerifyContext;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'l3-coverage-test-'));

    // Create basic gate plan
    const gatePlan: GatePlan = {
      source: 'default',
      runtime: 'node',
      environment: {},
      contracts: {
        required: [],
        forbidden: [],
        schema: [],
        naming: [],
      },
      tests: [],
      blackbox: [],
      policy: {
        allowNetwork: false,
        maxDiskMb: 100,
        timeoutSeconds: 600,
        disallowedCommands: [],
      },
    };

    ctx = {
      workDir: tempDir,
      gatePlan,
      diagnostics: [],
      cleanRoom: null,
    };
  });

  afterEach(async () => {
    // Cleanup temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should pass when all source files have matching tests', async () => {
    // Create src directory with source files
    await fs.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'utils', 'helper.ts'), 'export function help() {}');
    await fs.writeFile(path.join(tempDir, 'src', 'service.ts'), 'export class Service {}');

    // Create test directory with matching test files
    await fs.mkdir(path.join(tempDir, 'test'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'test', 'utils-helper.test.ts'), 'test helper');
    await fs.writeFile(path.join(tempDir, 'test', 'service.test.ts'), 'test service');

    const result = await verifyL3(ctx);

    expect(result.level).toBe(VerificationLevel.L3);
    expect(result.passed).toBe(true);

    const coverageCheck = result.checks.find((c) => c.name === 'test-coverage');
    expect(coverageCheck).toBeDefined();
    expect(coverageCheck?.passed).toBe(true);
    expect(coverageCheck?.message).toContain('have tests');
  });

  it('should warn when source files are missing tests', async () => {
    // Create src directory with source files
    await fs.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'utils', 'helper.ts'), 'export function help() {}');
    await fs.writeFile(path.join(tempDir, 'src', 'service.ts'), 'export class Service {}');

    // Create test directory but with only one test file
    await fs.mkdir(path.join(tempDir, 'test'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'test', 'service.test.ts'), 'test service');
    // Missing: test for utils/helper.ts

    const result = await verifyL3(ctx);

    expect(result.level).toBe(VerificationLevel.L3);
    expect(result.passed).toBe(true); // Warnings don't fail L3

    const coverageCheck = result.checks.find((c) => c.name === 'test-coverage');
    expect(coverageCheck).toBeDefined();
    expect(coverageCheck?.passed).toBe(true); // Warning, not failure
    expect(coverageCheck?.message).toContain('Warning');
    expect(coverageCheck?.message).toContain('missing tests');
    expect(coverageCheck?.details).toContain('src/utils/helper.ts');

    // Check diagnostics
    const coverageDiag = ctx.diagnostics.find((d) => d.type === 'test_coverage');
    expect(coverageDiag).toBeDefined();
    expect(coverageDiag?.message).toContain('missing tests');
  });

  it('should match test patterns correctly', async () => {
    // Create nested source file
    await fs.mkdir(path.join(tempDir, 'src', 'server', 'api'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'src', 'server', 'api', 'handler.ts'),
      'export function handle() {}'
    );

    // Create test using dashed pattern (test/server-api-handler.test.ts)
    await fs.mkdir(path.join(tempDir, 'test'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'test', 'server-api-handler.test.ts'),
      'test handler'
    );

    const result = await verifyL3(ctx);

    expect(result.level).toBe(VerificationLevel.L3);
    expect(result.passed).toBe(true);

    const coverageCheck = result.checks.find((c) => c.name === 'test-coverage');
    expect(coverageCheck).toBeDefined();
    expect(coverageCheck?.passed).toBe(true);
    expect(coverageCheck?.message).toContain('have tests');
  });

  it('should match test using filename-only pattern', async () => {
    // Create nested source file
    await fs.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'utils', 'logger.ts'), 'export function log() {}');

    // Create test using just filename (test/logger.test.ts)
    await fs.mkdir(path.join(tempDir, 'test'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'test', 'logger.test.ts'), 'test logger');

    const result = await verifyL3(ctx);

    expect(result.level).toBe(VerificationLevel.L3);
    expect(result.passed).toBe(true);

    const coverageCheck = result.checks.find((c) => c.name === 'test-coverage');
    expect(coverageCheck).toBeDefined();
    expect(coverageCheck?.passed).toBe(true);
    expect(coverageCheck?.message).toContain('have tests');
  });

  it('should ignore index.ts and type files', async () => {
    // Create src directory with files that should be ignored
    await fs.mkdir(path.join(tempDir, 'src', 'types'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export * from "./service"');
    await fs.writeFile(path.join(tempDir, 'src', 'types.ts'), 'export type Foo = string');
    await fs.writeFile(path.join(tempDir, 'src', 'types', 'bar.ts'), 'export type Bar = number');
    await fs.writeFile(path.join(tempDir, 'src', 'service.d.ts'), 'declare module "service"');

    // Create one actual source file with test
    await fs.writeFile(path.join(tempDir, 'src', 'service.ts'), 'export class Service {}');
    await fs.mkdir(path.join(tempDir, 'test'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'test', 'service.test.ts'), 'test service');

    const result = await verifyL3(ctx);

    expect(result.level).toBe(VerificationLevel.L3);
    expect(result.passed).toBe(true);

    const coverageCheck = result.checks.find((c) => c.name === 'test-coverage');
    expect(coverageCheck).toBeDefined();
    expect(coverageCheck?.passed).toBe(true);
    // Should report 1 source file (service.ts), not 5
    expect(coverageCheck?.message).toContain('1 source file(s) have tests');
  });

  it('should handle directory with no source files', async () => {
    // Create empty src directory
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    const result = await verifyL3(ctx);

    expect(result.level).toBe(VerificationLevel.L3);
    expect(result.passed).toBe(true);

    const coverageCheck = result.checks.find((c) => c.name === 'test-coverage');
    expect(coverageCheck).toBeDefined();
    expect(coverageCheck?.passed).toBe(true);
    expect(coverageCheck?.message).toContain('No source files to check');
  });

  it('should match test using directory structure pattern', async () => {
    // Create nested source file
    await fs.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'utils', 'parser.ts'), 'export function parse() {}');

    // Create test preserving directory structure (test/utils/parser.test.ts)
    await fs.mkdir(path.join(tempDir, 'test', 'utils'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'test', 'utils', 'parser.test.ts'), 'test parser');

    const result = await verifyL3(ctx);

    expect(result.level).toBe(VerificationLevel.L3);
    expect(result.passed).toBe(true);

    const coverageCheck = result.checks.find((c) => c.name === 'test-coverage');
    expect(coverageCheck).toBeDefined();
    expect(coverageCheck?.passed).toBe(true);
    expect(coverageCheck?.message).toContain('have tests');
  });

  it('should list multiple missing test files in details', async () => {
    // Create multiple source files without tests
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'service-a.ts'), 'export class A {}');
    await fs.writeFile(path.join(tempDir, 'src', 'service-b.ts'), 'export class B {}');
    await fs.writeFile(path.join(tempDir, 'src', 'service-c.ts'), 'export class C {}');

    // No test files
    await fs.mkdir(path.join(tempDir, 'test'), { recursive: true });

    const result = await verifyL3(ctx);

    expect(result.level).toBe(VerificationLevel.L3);
    expect(result.passed).toBe(true);

    const coverageCheck = result.checks.find((c) => c.name === 'test-coverage');
    expect(coverageCheck).toBeDefined();
    expect(coverageCheck?.message).toContain('3 source file(s) missing tests');
    expect(coverageCheck?.details).toContain('src/service-a.ts');
    expect(coverageCheck?.details).toContain('src/service-b.ts');
    expect(coverageCheck?.details).toContain('src/service-c.ts');
  });
});
