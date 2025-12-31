#!/usr/bin/env node

/**
 * Script to execute a work order via the orchestrator.
 * Usage: node scripts/run-work-order.mjs <work-order-id>
 */

import { createOrchestrator } from '../dist/lib.js';
import { workOrderStore } from '../dist/control-plane/work-order-store.js';

const workOrderId = process.argv[2];

if (!workOrderId) {
  console.error('Usage: node scripts/run-work-order.mjs <work-order-id>');
  process.exit(1);
}

async function main() {
  console.log(`Loading work order: ${workOrderId}`);

  const workOrder = await workOrderStore.load(workOrderId);

  if (!workOrder) {
    console.error(`Work order not found: ${workOrderId}`);
    process.exit(1);
  }

  console.log(`Work order found: ${workOrder.taskPrompt.slice(0, 50)}...`);
  console.log(`Status: ${workOrder.status}`);
  console.log(`Agent: ${workOrder.agentType}`);
  console.log(`Max iterations: ${workOrder.maxIterations}`);

  if (workOrder.status !== 'queued') {
    console.error(`Work order is not queued (status: ${workOrder.status})`);
    process.exit(1);
  }

  console.log('\nStarting orchestrator...');

  const orchestrator = createOrchestrator({
    maxConcurrentRuns: 1,
    defaultTimeoutSeconds: workOrder.maxWallClockSeconds,
  });

  try {
    console.log('Executing work order...\n');
    const run = await orchestrator.execute(workOrder);

    console.log('\n=== Run Complete ===');
    console.log(`Run ID: ${run.id}`);
    console.log(`Result: ${run.result}`);
    console.log(`Iterations: ${run.iteration}`);

    if (run.gitHubPrUrl) {
      console.log(`PR URL: ${run.gitHubPrUrl}`);
    }

    if (run.result === 'passed') {
      console.log('\n✓ Work order completed successfully!');
      process.exit(0);
    } else {
      console.log('\n✗ Work order failed.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\nExecution failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
