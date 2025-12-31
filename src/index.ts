#!/usr/bin/env node

import dotenv from 'dotenv';

// Load environment variables from .env file before anything else
dotenv.config();

import { runCli } from './control-plane/cli.js';

/**
 * Main entry point for the AgentGate CLI.
 */
async function main(): Promise<void> {
  try {
    await runCli();
  } catch (error) {
    // eslint-disable-next-line no-console -- CLI error output
    console.error(
      'Fatal error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  }
}

void main();
