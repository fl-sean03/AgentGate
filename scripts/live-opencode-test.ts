#!/usr/bin/env npx tsx
/**
 * Live E2E Test - OpenCode SDK Driver
 *
 * This validates the OpenCode SDK driver with a real agent execution.
 * Requires: opencode CLI installed (`npm i -g opencode-ai`)
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as dotenv from 'dotenv';

// Load .env from parent directory
const envPath = path.join(import.meta.dirname, '../.env');
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.error('Failed to load .env:', envResult.error);
}

console.log('ENV file:', envPath);

import { createFresh, deleteById } from '../src/workspace/manager.js';
import { getMinimalSeedFiles } from '../src/workspace/templates.js';
import { OpenCodeDriver, type OpenCodeResult } from '../src/agent/opencode-driver.js';
import { DEFAULT_AGENT_CONSTRAINTS, EMPTY_CONTEXT_POINTERS } from '../src/agent/defaults.js';
import type { AgentRequest } from '../src/types/index.js';

const TEST_PATH = path.join(import.meta.dirname, '../test-output/live-opencode');

async function main() {
  console.log('=== AgentGate Live E2E Test (OpenCode SDK) ===\n');

  // Check SDK availability
  const driver = new OpenCodeDriver({ debugMode: true });
  const available = await driver.isAvailable();
  if (!available) {
    console.error('OpenCode SDK not available');
    console.log('Install with: npm i -g opencode-ai');
    process.exit(1);
  }
  console.log('OpenCode SDK available\n');

  // Clean up any previous test
  try {
    await fs.rm(TEST_PATH, { recursive: true, force: true });
  } catch {
    // OK if doesn't exist
  }

  // Create fresh workspace
  console.log('Creating fresh workspace...');
  const seedFiles = getMinimalSeedFiles({
    projectName: 'Calculator',
    taskDescription: 'Create a simple calculator module with add and multiply functions',
  });

  const workspace = await createFresh(TEST_PATH, {
    seedFiles,
    commitMessage: 'Initialize calculator project',
  });

  console.log(`Workspace created: ${workspace.id}`);
  console.log(`  Path: ${workspace.rootPath}\n`);

  // Show CLAUDE.md
  const claudeMd = await fs.readFile(path.join(TEST_PATH, 'CLAUDE.md'), 'utf-8');
  console.log('--- CLAUDE.md ---');
  console.log(claudeMd);
  console.log('-----------------\n');

  // Run OpenCode SDK
  console.log('Running OpenCode SDK...');
  console.log('Task: Create calculator.ts with add and multiply functions');
  console.log('');

  // Use reasonable timeout for OpenCode execution
  const OPENCODE_TIMEOUT = 180000; // 3 minutes - OpenCode can take longer than Claude

  const request: AgentRequest = {
    workspacePath: workspace.rootPath,
    taskPrompt: `Create a file called calculator.ts with two functions:
1. add(a: number, b: number): number - returns the sum
2. multiply(a: number, b: number): number - returns the product

Export both functions. Keep it simple, no extra files needed.`,
    gatePlanSummary: '',
    constraints: {
      ...DEFAULT_AGENT_CONSTRAINTS,
      maxTurns: 10,
    },
    priorFeedback: null,
    contextPointers: EMPTY_CONTEXT_POINTERS,
    timeoutMs: OPENCODE_TIMEOUT,
    sessionId: null,
  };

  console.log(`Using timeout: ${OPENCODE_TIMEOUT}ms`);

  const startTime = Date.now();
  let result: OpenCodeResult;

  try {
    result = await driver.execute(request) as OpenCodeResult;
  } catch (error) {
    console.error('OpenCode execution error:', error);
    // Cleanup on error
    try {
      await driver.dispose();
    } catch {
      // Ignore cleanup errors
    }
    await deleteById(workspace.id, { deleteFiles: true });
    process.exit(1);
  }

  const duration = Date.now() - startTime;

  console.log(`\n=== Agent Result (OpenCode) ===`);
  console.log(`Success: ${result.success}`);
  console.log(`Exit Code: ${result.exitCode}`);
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
  if (result.openCodeSessionId) {
    console.log(`Session ID: ${result.openCodeSessionId}`);
  }
  if (result.messageCount) {
    console.log(`Message Count: ${result.messageCount}`);
  }

  // Show result summary
  if (result.stdout) {
    console.log(`\n--- Result (first 500 chars) ---`);
    console.log(result.stdout.slice(0, 500));
  }
  if (result.stderr) {
    console.log(`\n--- Errors ---`);
    console.log(result.stderr);
  }

  // Check what files were created
  console.log('\n=== Files in workspace ===');
  const files = await fs.readdir(TEST_PATH, { recursive: true });
  for (const file of files) {
    if (!file.toString().startsWith('.git')) {
      console.log(`  ${file}`);
    }
  }

  // Try to read the calculator file
  const calculatorPath = path.join(TEST_PATH, 'calculator.ts');
  try {
    const calculatorContent = await fs.readFile(calculatorPath, 'utf-8');
    console.log('\n--- calculator.ts ---');
    console.log(calculatorContent);
    console.log('---------------------');
    console.log('\nCalculator file created successfully!');
  } catch {
    console.log('\ncalculator.ts not found - checking other locations...');

    // Maybe it's in src/
    try {
      const srcCalc = await fs.readFile(path.join(TEST_PATH, 'src/calculator.ts'), 'utf-8');
      console.log('\n--- src/calculator.ts ---');
      console.log(srcCalc);
      console.log('-------------------------');
      console.log('\nCalculator file found in src/');
    } catch {
      console.log('Could not find calculator file');
    }
  }

  // Cleanup
  console.log('\nCleaning up...');
  try {
    await driver.dispose();
  } catch {
    // Ignore cleanup errors
  }
  await deleteById(workspace.id, { deleteFiles: true });
  console.log('Cleanup complete');

  console.log('\n=== OpenCode E2E Test Complete ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
