/**
 * Tests for useGitHubCI feature in verify.yaml
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolveGatePlanWithWarnings } from '../src/gate/resolver.js';
import { GatePlanSource } from '../src/types/index.js';

const TEST_WORKSPACE = join(import.meta.dirname, '../test-fixtures/test-workspace-ci');

describe('useGitHubCI feature', () => {
  beforeEach(async () => {
    // Create test workspace
    await mkdir(TEST_WORKSPACE, { recursive: true });
    await mkdir(join(TEST_WORKSPACE, '.github', 'workflows'), { recursive: true });
  });

  afterEach(async () => {
    // Clean up test workspace
    await rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it('should use CI workflow commands when useGitHubCI is true', async () => {
    // Create a GitHub Actions workflow
    const ciWorkflow = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v6
        with:
          node-version: '20'
      - run: npm install
      - run: npm run lint
      - run: npm test
      - run: npm run build
`;

    await writeFile(join(TEST_WORKSPACE, '.github', 'workflows', 'ci.yml'), ciWorkflow);

    // Create verify.yaml with useGitHubCI: true
    const verifyProfile = `
version: "1"
name: Test with GitHub CI
useGitHubCI: true
environment:
  runtime: node
  version: "20"
  setup:
    - npm install
contracts:
  forbidden_patterns:
    - "**/.env"
tests:
  - name: manual-test
    command: echo "This should be replaced"
policy:
  network: false
  max_runtime: 600
`;

    await writeFile(join(TEST_WORKSPACE, 'verify.yaml'), verifyProfile);

    // Resolve the gate plan
    const result = await resolveGatePlanWithWarnings(TEST_WORKSPACE, GatePlanSource.VERIFY_PROFILE);

    // Verify that CI commands are used instead of verify.yaml tests
    expect(result.plan.tests.length).toBeGreaterThan(0);

    // Should have CI commands (lint, test, build)
    const testNames = result.plan.tests.map(t => t.name);
    expect(testNames.some(name => name.startsWith('lint-'))).toBe(true);
    expect(testNames.some(name => name.startsWith('test-'))).toBe(true);
    expect(testNames.some(name => name.startsWith('build-'))).toBe(true);

    // Should NOT have the manual test from verify.yaml
    expect(testNames.some(name => name === 'manual-test')).toBe(false);

    // Should have a warning about using GitHub CI
    expect(result.warnings.some(w => w.includes('GitHub CI workflow'))).toBe(true);

    // Other settings should be preserved from verify.yaml
    expect(result.plan.contracts.forbiddenPatterns).toContain('**/.env');
    expect(result.plan.policy.networkAllowed).toBe(false);
    expect(result.plan.policy.maxRuntimeSeconds).toBe(600);
  });

  it('should use verify.yaml tests when useGitHubCI is false', async () => {
    // Create verify.yaml with useGitHubCI: false (or omitted, defaults to false)
    const verifyProfile = `
version: "1"
name: Test without GitHub CI
useGitHubCI: false
environment:
  runtime: node
  version: "20"
contracts:
  forbidden_patterns:
    - "**/.env"
tests:
  - name: manual-test
    command: echo "Manual test"
    timeout: 120
    expected_exit: 0
policy:
  network: false
`;

    await writeFile(join(TEST_WORKSPACE, 'verify.yaml'), verifyProfile);

    // Resolve the gate plan
    const result = await resolveGatePlanWithWarnings(TEST_WORKSPACE, GatePlanSource.VERIFY_PROFILE);

    // Should use verify.yaml tests
    expect(result.plan.tests.length).toBe(1);
    expect(result.plan.tests[0].name).toBe('manual-test');
    expect(result.plan.tests[0].command).toBe('echo "Manual test"');

    // Should NOT have warnings about GitHub CI
    expect(result.warnings.some(w => w.includes('GitHub CI workflow'))).toBe(false);
  });

  it('should use verify.yaml tests when useGitHubCI is omitted (default)', async () => {
    // Create verify.yaml without useGitHubCI field
    const verifyProfile = `
version: "1"
name: Test default behavior
environment:
  runtime: node
tests:
  - name: default-test
    command: npm test
policy:
  network: false
`;

    await writeFile(join(TEST_WORKSPACE, 'verify.yaml'), verifyProfile);

    // Resolve the gate plan
    const result = await resolveGatePlanWithWarnings(TEST_WORKSPACE, GatePlanSource.VERIFY_PROFILE);

    // Should use verify.yaml tests (default behavior)
    expect(result.plan.tests.length).toBe(1);
    expect(result.plan.tests[0].name).toBe('default-test');
  });

  it('should fallback to verify.yaml tests when useGitHubCI is true but no CI workflow exists', async () => {
    // Create verify.yaml with useGitHubCI: true but no CI workflow
    const verifyProfile = `
version: "1"
name: Test CI fallback
useGitHubCI: true
environment:
  runtime: node
tests:
  - name: fallback-test
    command: npm test
policy:
  network: false
`;

    await writeFile(join(TEST_WORKSPACE, 'verify.yaml'), verifyProfile);

    // Resolve the gate plan
    const result = await resolveGatePlanWithWarnings(TEST_WORKSPACE, GatePlanSource.VERIFY_PROFILE);

    // Should fallback to verify.yaml tests
    expect(result.plan.tests.length).toBe(1);
    expect(result.plan.tests[0].name).toBe('fallback-test');

    // Should have a warning about no CI workflows found
    expect(result.warnings.some(w => w.includes('no usable CI workflows found'))).toBe(true);
  });

  it('should preserve contracts and policy from verify.yaml when using CI commands', async () => {
    // Create a GitHub Actions workflow
    const ciWorkflow = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm test
`;

    await writeFile(join(TEST_WORKSPACE, '.github', 'workflows', 'ci.yml'), ciWorkflow);

    // Create verify.yaml with useGitHubCI: true and specific contracts/policy
    const verifyProfile = `
version: "1"
name: Test preservation of settings
useGitHubCI: true
environment:
  runtime: node
  version: "18"
  setup:
    - npm ci
contracts:
  required_files:
    - package.json
    - README.md
  forbidden_patterns:
    - "**/.env"
    - "**/secrets/**"
  naming_conventions:
    - pattern: "src/**/*.ts"
      rule: kebab-case
tests:
  - name: ignored-test
    command: echo "ignored"
policy:
  network: true
  max_runtime: 300
  disallowed_commands:
    - rm -rf /
`;

    await writeFile(join(TEST_WORKSPACE, 'verify.yaml'), verifyProfile);

    // Resolve the gate plan
    const result = await resolveGatePlanWithWarnings(TEST_WORKSPACE, GatePlanSource.VERIFY_PROFILE);

    // Verify contracts are preserved
    expect(result.plan.contracts.requiredFiles).toContain('package.json');
    expect(result.plan.contracts.requiredFiles).toContain('README.md');
    expect(result.plan.contracts.forbiddenPatterns).toContain('**/.env');
    expect(result.plan.contracts.forbiddenPatterns).toContain('**/secrets/**');
    expect(result.plan.contracts.namingConventions).toHaveLength(1);
    expect(result.plan.contracts.namingConventions[0].pattern).toBe('src/**/*.ts');
    expect(result.plan.contracts.namingConventions[0].rule).toBe('kebab-case');

    // Verify policy is preserved
    expect(result.plan.policy.networkAllowed).toBe(true);
    expect(result.plan.policy.maxRuntimeSeconds).toBe(300);
    expect(result.plan.policy.disallowedCommands).toContain('rm -rf /');

    // Verify environment is preserved
    expect(result.plan.environment.runtime).toBe('node');
    expect(result.plan.environment.runtimeVersion).toBe('18');
    expect(result.plan.environment.setupCommands).toHaveLength(1);
    expect(result.plan.environment.setupCommands[0].command).toBe('npm ci');

    // But tests should be from CI
    const testNames = result.plan.tests.map(t => t.name);
    expect(testNames.some(name => name === 'ignored-test')).toBe(false);
    expect(testNames.some(name => name.startsWith('test-'))).toBe(true);
  });

  it('should handle CI workflow parsing errors gracefully', async () => {
    // Create an invalid/unparseable GitHub Actions workflow
    const ciWorkflow = `
name: CI
on: [push]
jobs:
  - this is not valid yaml syntax
    steps: {{{ invalid
`;

    await writeFile(join(TEST_WORKSPACE, '.github', 'workflows', 'ci.yml'), ciWorkflow);

    // Create verify.yaml with useGitHubCI: true
    const verifyProfile = `
version: "1"
name: Test error handling
useGitHubCI: true
tests:
  - name: fallback-test
    command: npm test
policy:
  network: false
`;

    await writeFile(join(TEST_WORKSPACE, 'verify.yaml'), verifyProfile);

    // Resolve the gate plan - should not throw
    const result = await resolveGatePlanWithWarnings(TEST_WORKSPACE, GatePlanSource.VERIFY_PROFILE);

    // Should fallback to verify.yaml tests
    expect(result.plan.tests.length).toBe(1);
    expect(result.plan.tests[0].name).toBe('fallback-test');

    // Should have a warning about CI parsing failure
    expect(result.warnings.some(w => w.includes('CI workflow parsing failed'))).toBe(true);
  });

  it('should work with AUTO mode when verify.yaml has useGitHubCI', async () => {
    // Create a GitHub Actions workflow
    const ciWorkflow = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm test
`;

    await writeFile(join(TEST_WORKSPACE, '.github', 'workflows', 'ci.yml'), ciWorkflow);

    // Create verify.yaml with useGitHubCI: true
    const verifyProfile = `
version: "1"
name: Test AUTO mode
useGitHubCI: true
tests:
  - name: should-be-replaced
    command: echo "replaced"
policy:
  network: false
`;

    await writeFile(join(TEST_WORKSPACE, 'verify.yaml'), verifyProfile);

    // Resolve with AUTO mode
    const result = await resolveGatePlanWithWarnings(TEST_WORKSPACE, GatePlanSource.AUTO);

    // Should use CI commands
    const testNames = result.plan.tests.map(t => t.name);
    expect(testNames.some(name => name.startsWith('lint-'))).toBe(true);
    expect(testNames.some(name => name.startsWith('test-'))).toBe(true);
    expect(testNames.some(name => name === 'should-be-replaced')).toBe(false);

    // Should have warning about using GitHub CI
    expect(result.warnings.some(w => w.includes('GitHub CI workflow'))).toBe(true);
  });
});
