/**
 * Log Parser Tests
 *
 * Tests for GitHub Actions log parsing.
 */

import { describe, it, expect } from 'vitest';
import { LogParser } from '../src/github/log-parser.js';
import { stripAnsiCodes } from '../src/github/log-downloader.js';

describe('LogParser', () => {
  const parser = new LogParser();

  describe('parse', () => {
    it('should parse empty log', () => {
      const result = parser.parse('');

      expect(result.steps).toEqual([]);
      expect(result.totalLines).toBe(1);
    });

    it('should parse log with steps', () => {
      const log = `##[group]Checkout
Checking out repository...
Done.
##[endgroup]
##[group]Build
Building project...
Build completed.
##[endgroup]`;

      const result = parser.parse(log);

      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]?.name).toBe('Checkout');
      expect(result.steps[1]?.name).toBe('Build');
    });

    it('should detect step status from exit code', () => {
      const log = `##[group]Test
Running tests...
Process completed with exit code 1.
##[endgroup]`;

      const result = parser.parse(log);

      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]?.status).toBe('failure');
      expect(result.steps[0]?.exitCode).toBe(1);
    });

    it('should detect step success from exit code 0', () => {
      const log = `##[group]Build
Building...
Process completed with exit code 0.
##[endgroup]`;

      const result = parser.parse(log);

      expect(result.steps[0]?.status).toBe('success');
      expect(result.steps[0]?.exitCode).toBe(0);
    });

    it('should detect failure from error markers', () => {
      const log = `##[group]Test
##[error]Test failed
##[endgroup]`;

      const result = parser.parse(log);

      expect(result.steps[0]?.status).toBe('failure');
    });

    it('should calculate duration from timestamps', () => {
      const log = `2024-01-01T00:00:00.0000000Z Starting
2024-01-01T00:00:30.0000000Z Ending`;

      const result = parser.parse(log);

      expect(result.duration).toBe(30000); // 30 seconds in ms
    });

    it('should handle unclosed steps', () => {
      const log = `##[group]Incomplete Step
Some content
More content`;

      const result = parser.parse(log);

      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]?.name).toBe('Incomplete Step');
    });

    it('should capture step content', () => {
      const log = `##[group]My Step
Line 1
Line 2
Line 3
##[endgroup]`;

      const result = parser.parse(log);

      expect(result.steps[0]?.content).toContain('Line 1');
      expect(result.steps[0]?.content).toContain('Line 2');
      expect(result.steps[0]?.content).toContain('Line 3');
    });

    it('should track line numbers', () => {
      const log = `##[group]Step 1
Content
##[endgroup]
##[group]Step 2
More content
##[endgroup]`;

      const result = parser.parse(log);

      expect(result.steps[0]?.startLine).toBe(1);
      expect(result.steps[0]?.endLine).toBe(3);
      expect(result.steps[1]?.startLine).toBe(4);
      expect(result.steps[1]?.endLine).toBe(6);
    });
  });

  describe('findFailures', () => {
    it('should find failed steps', () => {
      const log = `##[group]Test
Running tests...
FAIL test/file.test.ts
Process completed with exit code 1.
##[endgroup]`;

      const parsedLog = parser.parse(log);
      const failures = parser.findFailures(parsedLog);

      expect(failures).toHaveLength(1);
      expect(failures[0]?.step.name).toBe('Test');
    });

    it('should extract vitest errors', () => {
      const log = `##[group]Test
 FAIL  test/config.test.ts > Configuration > should validate port
AssertionError: expected 3000 to be 3001

- Expected   "3001"
+ Received   "3000"

 ❯ test/config.test.ts:45:19
Process completed with exit code 1.
##[endgroup]`;

      const parsedLog = parser.parse(log);
      const failures = parser.findFailures(parsedLog);

      expect(failures).toHaveLength(1);
      expect(failures[0]?.errors.length).toBeGreaterThan(0);

      const testError = failures[0]?.errors.find((e) => e.category === 'test');
      expect(testError).toBeDefined();
      expect(testError?.file).toContain('test/config.test.ts');
    });

    it('should extract TypeScript errors (paren format)', () => {
      const log = `##[group]Typecheck
src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
Process completed with exit code 1.
##[endgroup]`;

      const parsedLog = parser.parse(log);
      const failures = parser.findFailures(parsedLog);

      expect(failures).toHaveLength(1);
      const tsError = failures[0]?.errors.find((e) => e.category === 'typecheck');
      expect(tsError).toBeDefined();
      expect(tsError?.file).toBe('src/index.ts');
      expect(tsError?.line).toBe(10);
      expect(tsError?.column).toBe(5);
      expect(tsError?.code).toBe('TS2322');
      expect(tsError?.message).toContain('Type');
    });

    it('should extract TypeScript errors (colon format)', () => {
      const log = `##[group]Typecheck
src/index.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.
Process completed with exit code 1.
##[endgroup]`;

      const parsedLog = parser.parse(log);
      const failures = parser.findFailures(parsedLog);

      const tsError = failures[0]?.errors.find((e) => e.category === 'typecheck');
      expect(tsError).toBeDefined();
      expect(tsError?.file).toBe('src/index.ts');
      expect(tsError?.line).toBe(10);
    });

    it('should extract ESLint errors', () => {
      const log = `##[group]Lint
/home/runner/work/repo/src/index.ts
  15:7  error  'unused' is defined but never used  @typescript-eslint/no-unused-vars
  23:1  error  Expected indentation of 2 spaces    indent
Process completed with exit code 1.
##[endgroup]`;

      const parsedLog = parser.parse(log);
      const failures = parser.findFailures(parsedLog);

      const lintErrors = failures[0]?.errors.filter((e) => e.category === 'lint');
      expect(lintErrors?.length).toBe(2);
      expect(lintErrors?.[0]?.file).toContain('src/index.ts');
      expect(lintErrors?.[0]?.line).toBe(15);
      expect(lintErrors?.[0]?.code).toBe('@typescript-eslint/no-unused-vars');
    });

    it('should extract build errors', () => {
      const log = `##[group]Build
error during build:
Failed to compile.
Process completed with exit code 1.
##[endgroup]`;

      const parsedLog = parser.parse(log);
      const failures = parser.findFailures(parsedLog);

      const buildError = failures[0]?.errors.find((e) => e.category === 'build');
      expect(buildError).toBeDefined();
    });

    it('should extract GitHub error markers', () => {
      const log = `##[group]Test
##[error]Test suite failed
Process completed with exit code 1.
##[endgroup]`;

      const parsedLog = parser.parse(log);
      const failures = parser.findFailures(parsedLog);

      expect(failures[0]?.errors.length).toBeGreaterThan(0);
    });

    it('should handle multiple error types in one step', () => {
      const log = `##[group]CI
src/index.ts(10,5): error TS2322: Type error
/home/runner/src/file.ts
  5:1  error  Lint error  some-rule
##[error]Step failed
Process completed with exit code 1.
##[endgroup]`;

      const parsedLog = parser.parse(log);
      const failures = parser.findFailures(parsedLog);

      const categories = new Set(failures[0]?.errors.map((e) => e.category));
      expect(categories.size).toBeGreaterThan(1);
    });
  });

  describe('extractErrorContext', () => {
    it('should extract context around error line', () => {
      const log = `Line 1
Line 2
Line 3
ERROR: Something went wrong
Line 5
Line 6
Line 7`;

      const context = parser.extractErrorContext(log, 4, 2);

      expect(context).toContain('Line 2');
      expect(context).toContain('Line 3');
      expect(context).toContain('ERROR: Something went wrong');
      expect(context).toContain('Line 5');
      expect(context).toContain('Line 6');
    });

    it('should handle context at start of file', () => {
      const log = `Line 1
Line 2
Line 3`;

      const context = parser.extractErrorContext(log, 1, 2);

      expect(context).toContain('Line 1');
      expect(context).toContain('Line 2');
      expect(context).toContain('Line 3');
    });

    it('should handle context at end of file', () => {
      const log = `Line 1
Line 2
Line 3`;

      const context = parser.extractErrorContext(log, 3, 2);

      expect(context).toContain('Line 1');
      expect(context).toContain('Line 2');
      expect(context).toContain('Line 3');
    });
  });
});

describe('stripAnsiCodes', () => {
  it('should strip color codes', () => {
    const input = '\x1b[31mRed text\x1b[39m';
    const result = stripAnsiCodes(input);
    expect(result).toBe('Red text');
  });

  it('should strip multiple codes', () => {
    const input = '\x1b[1m\x1b[31mBold red\x1b[39m\x1b[22m';
    const result = stripAnsiCodes(input);
    expect(result).toBe('Bold red');
  });

  it('should handle no codes', () => {
    const input = 'Plain text';
    const result = stripAnsiCodes(input);
    expect(result).toBe('Plain text');
  });

  it('should strip character set selection codes', () => {
    const input = '\x1b(BText';
    const result = stripAnsiCodes(input);
    expect(result).toBe('Text');
  });

  it('should handle complex escape sequences', () => {
    const input = '\x1b[38;5;196mExtended color\x1b[0m';
    const result = stripAnsiCodes(input);
    expect(result).toBe('Extended color');
  });
});

describe('Real-world log samples', () => {
  const parser = new LogParser();

  it('should parse vitest failure output', () => {
    const log = `##[group]Run tests
 FAIL  test/git-ops.test.ts > Git Operations > merge operations > should merge branches
Error: pathspec 'main' did not match any file(s) known to git
    at Object.<anonymous> (test/git-ops.test.ts:123:5)
 ❯ test/git-ops.test.ts:125:19

 Test Files  1 failed | 45 passed (46)
      Tests  1 failed | 234 passed (235)

Process completed with exit code 1.
##[endgroup]`;

    const parsedLog = parser.parse(log);
    const failures = parser.findFailures(parsedLog);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.errors.some((e) => e.category === 'test')).toBe(true);
  });

  it('should parse multiple TypeScript errors', () => {
    const log = `##[group]Run typecheck
src/github/client.ts(23,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/github/client.ts(45,10): error TS2339: Property 'foo' does not exist on type 'Bar'.
src/utils/helper.ts(12,3): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.

Found 3 errors.
Process completed with exit code 1.
##[endgroup]`;

    const parsedLog = parser.parse(log);
    const failures = parser.findFailures(parsedLog);

    const tsErrors = failures[0]?.errors.filter((e) => e.category === 'typecheck');
    expect(tsErrors?.length).toBe(3);
  });

  it('should handle malformed logs gracefully', () => {
    const log = `Some random content
##[group]Partial step
content without end
##[error]Something bad
more content`;

    const parsedLog = parser.parse(log);

    // Should not throw and should extract what it can
    expect(parsedLog.steps.length).toBeGreaterThan(0);
    expect(parsedLog.totalLines).toBeGreaterThan(0);
  });

  it('should handle empty steps', () => {
    const log = `##[group]Empty Step
##[endgroup]
##[group]Another Step
Content here
##[endgroup]`;

    const parsedLog = parser.parse(log);

    expect(parsedLog.steps).toHaveLength(2);
    expect(parsedLog.steps[0]?.content.trim()).toBe('');
    expect(parsedLog.steps[1]?.content).toContain('Content here');
  });
});
