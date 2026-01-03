// Route registration functions
export { registerHealthRoutes } from './health.js';
export { registerWorkOrderRoutes } from './work-orders.js';
export { registerRunRoutes } from './runs.js';
export { registerQueueRoutes } from './queue.js';
export {
  registerQueueRolloutRoutes,
  setQueueFacade,
  getRegisteredFacade,
  clearQueueFacade,
  type RolloutStatusResponse,
  type RolloutComparisonResponse,
  type RolloutConfigUpdateResponse,
  type SystemMetrics,
} from './queue-rollout.js';
