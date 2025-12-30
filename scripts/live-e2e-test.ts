#!/usr/bin/env npx tsx
/**
 * Live E2E Test - Runs actual Claude Agent SDK
 *
 * This validates the full pipeline with a real agent execution using the SDK.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as dotenv from 'dotenv';

// Load .env from parent directory
const envPath = path.join(import.meta.dirname, '../../.env');
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.error('Failed to load .env:', envResult.error);
}

// Debug: check API key
console.log('ENV file:', envPath);
console.log('API key loaded:', process.env.ANTHROPIC_API_KEY ? 'yes (length: ' + process.env.ANTHROPIC_API_KEY.length + ')' : 'no');

import { createFresh, deleteById } from '../src/workspace/manager.js';
import { getMinimalSeedFiles } from '../src/workspace/templates.js';
import { ClaudeAgentSDKDriver, type SDKAgentResult } from '../src/agent/claude-agent-sdk-driver.js';
import { DEFAULT_AGENT_CONSTRAINTS, EMPTY_CONTEXT_POINTERS } from '../src/agent/defaults.js';
import type { AgentRequest } from '../src/types/index.js';

const TEST_PATH = path.join(import.meta.dirname, '../test-output/live-e2e');

async function main() {
  console.log('=== AgentGate Live E2E Test (SDK) ===\n');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  ANTHROPIC_API_KEY not set, will use OAuth session');
  } else {
    console.log('✓ ANTHROPIC_API_KEY found');
  }

  // Check SDK availability
  const driver = new ClaudeAgentSDKDriver({ debugMessages: true });
  const available = await driver.isAvailable();
  if (!available) {
    console.error('✗ Claude Agent SDK not available');
    process.exit(1);
  }
  console.log('✓ Claude Agent SDK available\n');

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

  console.log(`✓ Workspace created: ${workspace.id}`);
  console.log(`  Path: ${workspace.rootPath}\n`);

  // Show CLAUDE.md
  const claudeMd = await fs.readFile(path.join(TEST_PATH, 'CLAUDE.md'), 'utf-8');
  console.log('--- CLAUDE.md ---');
  console.log(claudeMd);
  console.log('-----------------\n');

  // Run Claude Agent SDK
  console.log('Running Claude Agent SDK...');
  console.log('Task: Create calculator.ts with add and multiply functions');
  console.log('API key in env:', process.env.ANTHROPIC_API_KEY ? 'yes' : 'no');
  console.log('');

  const request: AgentRequest = {
    workspacePath: workspace.rootPath,
    taskPrompt: `Create a file called calculator.ts with two functions:
1. add(a: number, b: number): number - returns the sum
2. multiply(a: number, b: number): number - returns the product

Export both functions. Keep it simple, no extra files needed.`,
    gatePlanSummary: '',
    constraints: {
      ...DEFAULT_AGENT_CONSTRAINTS,
      maxTurns: 5, // Limit turns for quick test
    },
    priorFeedback: null,
    contextPointers: EMPTY_CONTEXT_POINTERS,
    timeoutMs: 120000, // 2 minute timeout
    sessionId: null,
  };

  const startTime = Date.now();
  const result = await driver.execute(request) as SDKAgentResult;
  const duration = Date.now() - startTime;

  console.log(`\n=== Agent Result (SDK) ===`);
  console.log(`Success: ${result.success}`);
  console.log(`Exit Code: ${result.exitCode}`);
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`Session ID: ${result.sessionId}`);
  console.log(`Model: ${result.model}`);
  console.log(`Turns: ${result.numTurns}`);
  console.log(`Cost: $${result.totalCostUsd?.toFixed(4)}`);

  // Show tool calls
  if (result.toolCalls && result.toolCalls.length > 0) {
    console.log(`\n--- Tool Calls (${result.toolCalls.length}) ---`);
    for (const call of result.toolCalls) {
      console.log(`  ${call.toolName}: ${JSON.stringify(call.input).slice(0, 100)}...`);
    }
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

  if (result.tokensUsed) {
    console.log(`\nTokens: ${result.tokensUsed.input} in / ${result.tokensUsed.output} out`);
  }

  if (!result.success) {
    console.log(`\nError: ${result.stderr}`);
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
    console.log('\n✓ Calculator file created successfully!');
  } catch {
    console.log('\n⚠️  calculator.ts not found - checking other locations...');

    // Maybe it's in src/
    try {
      const srcCalc = await fs.readFile(path.join(TEST_PATH, 'src/calculator.ts'), 'utf-8');
      console.log('\n--- src/calculator.ts ---');
      console.log(srcCalc);
      console.log('-------------------------');
      console.log('\n✓ Calculator file found in src/');
    } catch {
      console.log('✗ Could not find calculator file');
    }
  }

  // Cleanup
  console.log('\nCleaning up...');
  await deleteById(workspace.id, { deleteFiles: true });
  console.log('✓ Cleanup complete');

  console.log('\n=== E2E Test Complete ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
