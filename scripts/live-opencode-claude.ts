#!/usr/bin/env npx tsx
/**
 * Live E2E Test - OpenCode SDK with Claude Opus 4.5
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(import.meta.dirname, '../.env') });

import { createFresh, deleteById } from '../src/workspace/manager.js';
import { getMinimalSeedFiles } from '../src/workspace/templates.js';
import { createOpencode } from '@opencode-ai/sdk';
import { createLogger } from '../src/utils/index.js';

const logger = createLogger('live-opencode-claude');
const TEST_PATH = path.join(import.meta.dirname, '../test-output/live-opencode-claude');

async function main() {
  console.log('=== OpenCode E2E Test (Claude Opus 4.5) ===\n');

  // Clean up any previous test
  try {
    await fs.rm(TEST_PATH, { recursive: true, force: true });
  } catch {
    // OK if doesn't exist
  }

  // Create fresh workspace
  const seedFiles = getMinimalSeedFiles({
    projectName: 'Calculator',
    taskDescription: 'Create a simple calculator module with add and multiply functions',
  });

  const workspace = await createFresh(TEST_PATH, {
    seedFiles,
    commitMessage: 'Initialize calculator project',
  });

  console.log(`Workspace: ${workspace.rootPath}\n`);

  // Start OpenCode server
  const { client, server } = await createOpencode({
    hostname: '127.0.0.1',
    port: 4200,
  });

  const startTime = Date.now();

  try {
    // Set up Anthropic auth
    await client.auth.set({
      path: { id: 'anthropic' },
      body: { type: 'api', key: process.env.ANTHROPIC_API_KEY || '' },
    });

    // Create session
    const session = await client.session.create({
      query: { directory: workspace.rootPath },
    });
    const sessionId = session.data?.id || '';

    // Send prompt with Claude Opus 4.5
    const model = { providerID: 'anthropic', modelID: 'claude-opus-4-5-20251101' };
    console.log(`Model: ${model.providerID}/${model.modelID}`);
    console.log('Task: Create calculator.ts with add and multiply functions\n');

    await client.session.prompt({
      path: { id: sessionId },
      query: { directory: workspace.rootPath },
      body: {
        model,
        parts: [{
          type: 'text' as const,
          text: `Create a file called calculator.ts with two functions:
1. add(a: number, b: number): number - returns the sum
2. multiply(a: number, b: number): number - returns the product

Export both functions. Keep it simple, no extra files needed.`
        }],
      },
    });

    // Poll for completion using message-based detection
    const timeout = 180000;
    const pollStartTime = Date.now();

    while (Date.now() - pollStartTime < timeout) {
      const messagesCheck = await client.session.messages({
        path: { id: sessionId },
        query: { directory: workspace.rootPath },
      });

      const messages = messagesCheck.data || [];
      const lastMessage = messages[messages.length - 1];

      const isComplete =
        lastMessage?.info?.role === 'assistant' &&
        lastMessage?.info?.time?.completed != null;

      if (isComplete) {
        break;
      }

      await new Promise(r => setTimeout(r, 500));
    }

    // Get final messages
    const messagesResponse = await client.session.messages({
      path: { id: sessionId },
      query: { directory: workspace.rootPath },
    });

    const messages = messagesResponse.data || [];
    let finalResponse = '';

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.info.role === 'assistant' && msg.parts) {
        const textParts = msg.parts
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text);
        if (textParts.length > 0) {
          finalResponse = textParts.join('\n');
          break;
        }
      }
    }

    const duration = Date.now() - startTime;

    console.log('=== Result ===');
    console.log(`Success: ${!!finalResponse}`);
    console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`Messages: ${messages.length}`);

    // Check for calculator.ts
    try {
      const calc = await fs.readFile(path.join(TEST_PATH, 'calculator.ts'), 'utf-8');
      console.log('\ncalculator.ts created ✓');
    } catch {
      try {
        await fs.readFile(path.join(TEST_PATH, 'src/calculator.ts'), 'utf-8');
        console.log('\nsrc/calculator.ts created ✓');
      } catch {
        console.log('\ncalculator.ts not found');
      }
    }

  } finally {
    server.close();
    await deleteById(workspace.id, { deleteFiles: true });
  }

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
