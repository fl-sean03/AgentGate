import { createOrchestrator } from './dist/orchestrator/index.js';
import { workOrderService } from './dist/control-plane/work-order-service.js';

const workOrderId = process.argv[2];
if (!workOrderId) {
  console.error('Usage: node run-wo.mjs <work-order-id>');
  process.exit(1);
}

async function main() {
  console.log('Loading work order ' + workOrderId + '...');
  const order = await workOrderService.get(workOrderId);

  if (!order) {
    console.error('Work order not found: ' + workOrderId);
    process.exit(1);
  }

  const taskPreview = order.taskPrompt.substring(0, 50);
  console.log('Executing work order: ' + taskPreview + '...');
  const orchestrator = createOrchestrator();

  try {
    const run = await orchestrator.execute(order);
    console.log('Run completed: ' + run.id);
    console.log('Result: ' + run.result);
    console.log('Iterations: ' + run.iteration);
    if (run.gitHubPrUrl) {
      console.log('PR: ' + run.gitHubPrUrl);
    }
  } catch (error) {
    console.error('Execution failed:', error.message);
    process.exit(1);
  }
}

main();
