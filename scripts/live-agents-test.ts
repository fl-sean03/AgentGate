#!/usr/bin/env npx tsx
/**
 * Live E2E Test - OpenAI Agents SDK Driver
 *
 * This validates the Agents SDK driver with a real agent execution.
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

// Debug: check API key
console.log('ENV file:', envPath);
console.log('OpenAI API key loaded:', process.env.OPENAI_API_KEY ? 'yes (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'no');

import { createFresh, deleteById } from '../src/workspace/manager.js';
import { getMinimalSeedFiles } from '../src/workspace/templates.js';
import { OpenAIAgentsDriver, type AgentsSDKResult } from '../src/agent/openai-agents-driver.js';
import { DEFAULT_AGENT_CONSTRAINTS, EMPTY_CONTEXT_POINTERS } from '../src/agent/defaults.js';
import type { AgentRequest } from '../src/types/index.js';

const TEST_PATH = path.join(import.meta.dirname, '../test-output/live-agents');

async function main() {
  console.log('=== AgentGate Live E2E Test (Agents SDK) ===\n');

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not set, cannot run Agents SDK test');
    process.exit(1);
  }
  console.log('OPENAI_API_KEY found');

  // Check SDK availability
  const driver = new OpenAIAgentsDriver({ debugMode: true });
  const available = await driver.isAvailable();
  if (!available) {
    console.error('OpenAI Agents SDK not available');
    process.exit(1);
  }
  console.log('OpenAI Agents SDK available\n');

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

  // Run Agents SDK
  console.log('Running OpenAI Agents SDK...');
  console.log('Task: Create calculator.ts with add and multiply functions');
  console.log('');

  const request: AgentRequest = {
    workspacePath: workspace.rootPath,
    taskPrompt: `Create a file called calculator.ts with two functions:
1. add(a: number, b: number): number - returns the sum
2. multiply(a: number, b: number): number - returns the product

Export both functions. Keep it simple, no extra files needed.

Use the write_file tool to create the file.`,
    gatePlanSummary: '',
    constraints: {
      ...DEFAULT_AGENT_CONSTRAINTS,
      maxTurns: 10,
    },
    priorFeedback: null,
    contextPointers: EMPTY_CONTEXT_POINTERS,
    timeoutMs: 180000, // 3 minute timeout
    sessionId: null,
  };

  const startTime = Date.now();
  const result = await driver.execute(request) as AgentsSDKResult;
  const duration = Date.now() - startTime;

  console.log(`\n=== Agent Result (Agents SDK) ===`);
  console.log(`Success: ${result.success}`);
  console.log(`Exit Code: ${result.exitCode}`);
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);

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
  await deleteById(workspace.id, { deleteFiles: true });
  console.log('Cleanup complete');

  console.log('\n=== Agents SDK E2E Test Complete ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
