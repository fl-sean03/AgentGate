/**
 * Extensibility Module
 *
 * Provides hooks, events, and plugin system for extending AgentGate.
 * (v0.2.27 - Phase 3: Extensibility Framework)
 */

// Hooks
export {
  HookRegistry,
  HookManager,
  getHookManager,
  registerHook,
  WORK_ORDER_HOOKS,
  SANDBOX_HOOKS,
  AGENT_HOOKS,
  type HookTiming,
  type HookPriority,
  type HookHandler,
  type HookResult,
} from './hooks.js';

// Events
export {
  EventEmitter,
  getEventBus,
  resetEventBus,
  type EventHandler,
  type EventSubscription,
  type EventMeta,
  type BaseEvent,
  type WorkOrderEvents,
  type SandboxEvents,
  type AgentEvents,
  type SystemEvents,
  type AllEvents,
} from './events.js';

// Plugins
export {
  PluginManager,
  getPluginManager,
  createPlugin,
  type Plugin,
  type PluginMetadata,
  type PluginContext,
} from './plugins.js';
