/**
 * @agentgate/client - TypeScript Client SDK for AgentGate API
 *
 * @packageDocumentation
 */

// Main client
export { AgentGateClient } from './client.js';

// Types
export type {
  AgentGateClientConfig,
  WorkspaceSource,
  WorkOrderSummary,
  WorkOrderDetail,
  CreateWorkOrderOptions,
  RunSummary,
  RunDetail,
  IterationSummary,
  ProfileSummary,
  ProfileDetail,
  CreateProfileOptions,
  AuditRecord,
  ConfigSnapshot,
  ConfigChange,
  StreamEvent,
  PaginatedResponse,
  ListOptions,
} from './types.js';

// Errors
export {
  AgentGateError,
  NetworkError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  ConflictError,
  RateLimitError,
  ServerError,
} from './errors.js';

// Stream utilities
export { RunStream, streamEvents } from './stream.js';
export type { StreamOptions } from './stream.js';

// Resource types
export type {
  WorkOrdersListOptions,
  WorkOrderCancelResponse,
  WorkOrderAuditResponse,
} from './resources/work-orders.js';
export type {
  RunsListOptions,
  RunConfigResponse,
  RunStrategyStateResponse,
} from './resources/runs.js';
export type {
  ProfilesListResponse,
  ProfileUpdateResponse,
  ProfileDeleteResponse,
  ProfileValidationResult,
} from './resources/profiles.js';
export type { AuditSnapshotsResponse, AuditChangesResponse } from './resources/audit.js';
