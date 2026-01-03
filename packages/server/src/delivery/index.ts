/**
 * Delivery Module (v0.2.25)
 *
 * Handles delivery operations: git, PR, notifications, and pluggable VCS.
 *
 * @module delivery
 */

// v0.2.25: Pluggable delivery types and registry
export * from './types.js';
export { LocalDeliveryManager, type LocalDeliveryManagerOptions } from './local-manager.js';
export { getDeliveryRegistry, resetDeliveryRegistry } from './registry.js';

// Coordinator
export {
  DeliveryCoordinator,
  createDeliveryCoordinator,
  type DeliveryContext,
} from './coordinator.js';

// Git Handler
export {
  GitHandler,
  createGitHandler,
  type GitContext,
} from './git-handler.js';

// PR Handler
export {
  PRHandler,
  createPRHandler,
  type PRContext,
} from './pr-handler.js';

// Notification Handler
export {
  NotificationHandler,
  createNotificationHandler,
  type NotificationContext,
} from './notification-handler.js';
