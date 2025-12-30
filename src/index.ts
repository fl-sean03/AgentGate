#!/usr/bin/env node

import { runCli } from './control-plane/cli.js';

/**
 * Main entry point for the AgentGate CLI.
 */
async function main(): Promise<void> {
  try {
    await runCli();
  } catch (error) {
    console.error(
      'Fatal error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  }
}

main();
