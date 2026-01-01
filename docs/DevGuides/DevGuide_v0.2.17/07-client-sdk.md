# 07: Client SDK

This document covers Thrust 6: implementing a TypeScript client SDK for the AgentGate API.

---

## Thrust 6: API Client SDK

### 6.1 Objective

Create a type-safe TypeScript client library (`@agentgate/client`) that provides convenient access to all API endpoints, with support for SSE streaming and automatic error handling.

### 6.2 Background

Direct HTTP API usage requires boilerplate for authentication, error handling, and response parsing. A client SDK simplifies integration and provides type safety. The SDK will be published as an npm package.

### 6.3 Subtasks

#### 6.3.1 Create Package Structure

Create `packages/client/` directory:

```
packages/client/
├── src/
│   ├── index.ts           # Public exports
│   ├── client.ts          # Main AgentGateClient class
│   ├── types.ts           # Type definitions
│   ├── errors.ts          # Custom error classes
│   ├── stream.ts          # SSE stream utilities
│   └── resources/
│       ├── work-orders.ts # Work order methods
│       ├── runs.ts        # Run methods
│       ├── profiles.ts    # Profile methods
│       └── audit.ts       # Audit methods
├── package.json
├── tsconfig.json
└── README.md
```

#### 6.3.2 Create Package Configuration

Create `packages/client/package.json`:

```json
{
  "name": "@agentgate/client",
  "version": "0.2.17",
  "description": "TypeScript client for AgentGate API",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "prepublishOnly": "pnpm run build"
  },
  "dependencies": {
    "eventsource": "^2.x"
  },
  "devDependencies": {
    "@types/eventsource": "^1.x",
    "typescript": "^5.x"
  },
  "peerDependencies": {},
  "keywords": [
    "agentgate",
    "ai",
    "agent",
    "automation",
    "api",
    "client"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/agentgate/agentgate.git",
    "directory": "packages/client"
  }
}
```

Create `packages/client/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 6.3.3 Define Client Types

Create `packages/client/src/types.ts`:

```typescript
// Client configuration
export interface AgentGateClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  fetch?: typeof fetch;
}

// Workspace source types
export type WorkspaceSource =
  | { type: 'local'; path: string }
  | { type: 'github'; repo: string; branch?: string }
  | { type: 'github-new'; repo: string; template?: string };

// Work order types
export interface WorkOrderSummary {
  id: string;
  taskPrompt: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  workspaceSource: WorkspaceSource;
  agentType: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
}

export interface WorkOrderDetail extends WorkOrderSummary {
  maxIterations: number;
  maxTime: number;
  runs: RunSummary[];
  harness?: {
    profile: string | null;
    loopStrategy: { mode: string; maxIterations: number };
    verification: { waitForCI: boolean; skipLevels: string[] };
  };
}

export interface CreateWorkOrderOptions {
  taskPrompt: string;
  workspaceSource: WorkspaceSource;
  agentType?: string;
  harness?: {
    profile?: string;
    loopStrategy?: {
      mode?: 'fixed' | 'hybrid' | 'ralph' | 'custom';
      maxIterations?: number;
      completionCriteria?: string[];
      requireCI?: boolean;
    };
    verification?: {
      waitForCI?: boolean;
      skipLevels?: ('L0' | 'L1' | 'L2' | 'L3')[];
    };
    gitOps?: {
      mode?: 'local' | 'push-only' | 'github-pr';
      draftPR?: boolean;
    };
    limits?: {
      maxWallClockSeconds?: number;
      networkAllowed?: boolean;
    };
  };
}

// Run types
export interface RunSummary {
  id: string;
  status: 'queued' | 'building' | 'running' | 'succeeded' | 'failed' | 'canceled';
  startedAt: string;
  completedAt?: string;
  iterationCount: number;
}

export interface RunDetail extends RunSummary {
  workOrderId: string;
  iterations: IterationSummary[];
  branchName?: string;
  prUrl?: string;
}

export interface IterationSummary {
  number: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  verification?: {
    l0Passed: boolean;
    l1Passed: boolean;
    overallPassed: boolean;
  };
}

// Profile types
export interface ProfileSummary {
  name: string;
  description: string | null;
  extends: string | null;
  isBuiltIn: boolean;
}

export interface ProfileDetail extends ProfileSummary {
  loopStrategy?: {
    mode: string;
    maxIterations: number;
    completionCriteria?: string[];
    requireCI?: boolean;
  };
  verification?: {
    waitForCI?: boolean;
    skipLevels?: string[];
  };
  gitOps?: {
    mode?: string;
    draftPR?: boolean;
  };
  limits?: {
    maxWallClockSeconds?: number;
    networkAllowed?: boolean;
  };
  resolved?: {
    inheritanceChain: string[];
    configHash: string;
  };
}

export interface CreateProfileOptions {
  name: string;
  description?: string;
  extends?: string;
  loopStrategy?: Partial<ProfileDetail['loopStrategy']>;
  verification?: Partial<ProfileDetail['verification']>;
  gitOps?: Partial<ProfileDetail['gitOps']>;
  limits?: Partial<ProfileDetail['limits']>;
}

// Audit types
export interface AuditRecord {
  runId: string;
  workOrderId: string;
  startedAt: string;
  completedAt: string | null;
  initialConfig: ConfigSnapshot;
  finalConfig: ConfigSnapshot | null;
  snapshotCount: number;
  changeCount: number;
  configHashChanged: boolean;
}

export interface ConfigSnapshot {
  id: string;
  runId: string;
  iteration: number;
  snapshotAt: string;
  configHash: string;
  config: Record<string, unknown>;
}

export interface ConfigChange {
  iteration: number;
  path: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  initiator: 'user' | 'strategy' | 'system';
  changedAt: string;
}

// Stream event types
export interface StreamEvent {
  type: string;
  runId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
}
```

#### 6.3.4 Create Error Classes

Create `packages/client/src/errors.ts`:

```typescript
export class AgentGateError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AgentGateError';
  }
}

export class NetworkError extends AgentGateError {
  constructor(message: string, cause?: Error) {
    super(message, 'NETWORK_ERROR', 0);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export class NotFoundError extends AgentGateError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AgentGateError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AgentGateError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'AuthenticationError';
  }
}

export class ConflictError extends AgentGateError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}
```

#### 6.3.5 Create Stream Utilities

Create `packages/client/src/stream.ts`:

```typescript
import EventSource from 'eventsource';
import type { StreamEvent } from './types.js';

export interface StreamOptions {
  onEvent: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export class RunStream {
  private eventSource: EventSource | null = null;
  private closed = false;

  constructor(
    private url: string,
    private options: StreamOptions
  ) {}

  /**
   * Start streaming events
   */
  connect(): void {
    if (this.eventSource || this.closed) return;

    this.eventSource = new EventSource(this.url);

    this.eventSource.onopen = () => {
      this.options.onOpen?.();
    };

    this.eventSource.onerror = (error) => {
      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this.close();
      } else {
        this.options.onError?.(new Error('Stream error'));
      }
    };

    // Listen for all event types
    const eventTypes = [
      'connected',
      'run-start',
      'iteration-start',
      'agent-output',
      'verification-start',
      'verification-complete',
      'ci-start',
      'ci-complete',
      'iteration-complete',
      'run-complete',
      'error',
      'heartbeat',
    ];

    for (const type of eventTypes) {
      this.eventSource.addEventListener(type, (e) => {
        try {
          const event = JSON.parse(e.data) as StreamEvent;
          this.options.onEvent(event);

          // Auto-close on run complete
          if (type === 'run-complete') {
            this.close();
          }
        } catch (err) {
          this.options.onError?.(err as Error);
        }
      });
    }
  }

  /**
   * Close the stream
   */
  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.closed = true;
    this.options.onClose?.();
  }

  /**
   * Check if stream is connected
   */
  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

/**
 * Create async iterator for stream events
 */
export async function* streamEvents(url: string): AsyncGenerator<StreamEvent> {
  const events: StreamEvent[] = [];
  let resolve: (() => void) | null = null;
  let error: Error | null = null;
  let done = false;

  const stream = new RunStream(url, {
    onEvent: (event) => {
      events.push(event);
      resolve?.();
    },
    onError: (err) => {
      error = err;
      resolve?.();
    },
    onClose: () => {
      done = true;
      resolve?.();
    },
  });

  stream.connect();

  try {
    while (!done) {
      if (events.length > 0) {
        yield events.shift()!;
      } else if (error) {
        throw error;
      } else {
        await new Promise<void>((r) => {
          resolve = r;
        });
        resolve = null;
      }
    }

    // Yield remaining events
    while (events.length > 0) {
      yield events.shift()!;
    }
  } finally {
    stream.close();
  }
}
```

#### 6.3.6 Create Main Client Class

Create `packages/client/src/client.ts`:

```typescript
import type {
  AgentGateClientConfig,
  WorkOrderSummary,
  WorkOrderDetail,
  CreateWorkOrderOptions,
  RunSummary,
  RunDetail,
  ProfileSummary,
  ProfileDetail,
  CreateProfileOptions,
  AuditRecord,
  ConfigSnapshot,
  ConfigChange,
  PaginatedResponse,
  ListOptions,
} from './types.js';
import {
  AgentGateError,
  NetworkError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  ConflictError,
} from './errors.js';
import { RunStream, streamEvents, type StreamOptions } from './stream.js';

export class AgentGateClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private fetchFn: typeof fetch;

  constructor(config: AgentGateClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.fetchFn = config.fetch ?? fetch;
  }

  // ==================== HTTP Helpers ====================

  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; params?: Record<string, string> } = {}
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(url.toString(), {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.handleError(response.status, data.error);
      }

      return data.data as T;
    } catch (error) {
      if (error instanceof AgentGateError) throw error;
      throw new NetworkError('Request failed', error as Error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private handleError(status: number, error: { code: string; message: string; details?: unknown }): never {
    switch (status) {
      case 400:
        throw new ValidationError(error.message, error.details);
      case 401:
        throw new AuthenticationError(error.message);
      case 404:
        throw new NotFoundError('Resource', error.message);
      case 409:
        throw new ConflictError(error.message);
      default:
        throw new AgentGateError(error.message, error.code, status, error.details);
    }
  }

  // ==================== Work Orders ====================

  async listWorkOrders(
    options: ListOptions & { status?: string } = {}
  ): Promise<PaginatedResponse<WorkOrderSummary>> {
    const params: Record<string, string> = {};
    if (options.limit) params.limit = String(options.limit);
    if (options.offset) params.offset = String(options.offset);
    if (options.status) params.status = options.status;

    return this.request('GET', '/api/v1/work-orders', { params });
  }

  async getWorkOrder(id: string): Promise<WorkOrderDetail> {
    return this.request('GET', `/api/v1/work-orders/${id}`);
  }

  async createWorkOrder(options: CreateWorkOrderOptions): Promise<WorkOrderSummary> {
    return this.request('POST', '/api/v1/work-orders', {
      body: {
        taskPrompt: options.taskPrompt,
        workspaceSource: options.workspaceSource,
        agentType: options.agentType ?? 'claude-code-subscription',
        harness: options.harness,
      },
    });
  }

  async cancelWorkOrder(id: string): Promise<{ id: string; status: string; message: string }> {
    return this.request('DELETE', `/api/v1/work-orders/${id}`);
  }

  async getWorkOrderAudit(id: string): Promise<{ workOrderId: string; runs: unknown[] }> {
    return this.request('GET', `/api/v1/work-orders/${id}/audit`);
  }

  // ==================== Runs ====================

  async listRuns(
    options: ListOptions & { workOrderId?: string; status?: string } = {}
  ): Promise<PaginatedResponse<RunSummary>> {
    const params: Record<string, string> = {};
    if (options.limit) params.limit = String(options.limit);
    if (options.offset) params.offset = String(options.offset);
    if (options.workOrderId) params.workOrderId = options.workOrderId;
    if (options.status) params.status = options.status;

    return this.request('GET', '/api/v1/runs', { params });
  }

  async getRun(id: string): Promise<RunDetail> {
    return this.request('GET', `/api/v1/runs/${id}`);
  }

  async getRunConfig(id: string): Promise<{ runId: string; config: unknown }> {
    return this.request('GET', `/api/v1/runs/${id}/config`);
  }

  async getRunStrategyState(id: string): Promise<{ runId: string; state: unknown }> {
    return this.request('GET', `/api/v1/runs/${id}/strategy-state`);
  }

  streamRun(id: string, options: Omit<StreamOptions, 'onEvent'> & { onEvent: StreamOptions['onEvent'] }): RunStream {
    const stream = new RunStream(`${this.baseUrl}/api/v1/runs/${id}/stream`, options);
    stream.connect();
    return stream;
  }

  async *streamRunEvents(id: string) {
    yield* streamEvents(`${this.baseUrl}/api/v1/runs/${id}/stream`);
  }

  // ==================== Profiles ====================

  async listProfiles(): Promise<{ items: ProfileSummary[]; total: number }> {
    return this.request('GET', '/api/v1/profiles');
  }

  async getProfile(name: string, resolve = false): Promise<ProfileDetail> {
    const params: Record<string, string> = {};
    if (resolve) params.resolve = 'true';
    return this.request('GET', `/api/v1/profiles/${name}`, { params });
  }

  async createProfile(options: CreateProfileOptions): Promise<ProfileSummary> {
    return this.request('POST', '/api/v1/profiles', { body: options });
  }

  async updateProfile(
    name: string,
    options: Partial<Omit<CreateProfileOptions, 'name'>>
  ): Promise<{ name: string; message: string }> {
    return this.request('PUT', `/api/v1/profiles/${name}`, { body: options });
  }

  async deleteProfile(name: string): Promise<{ name: string; message: string }> {
    return this.request('DELETE', `/api/v1/profiles/${name}`);
  }

  async validateProfile(name: string): Promise<{
    valid: boolean;
    errors: { path: string; message: string }[];
    warnings: { path: string; message: string }[];
    resolved?: ProfileDetail;
  }> {
    return this.request('POST', `/api/v1/profiles/${name}/validate`);
  }

  // ==================== Audit ====================

  async getAuditRecord(runId: string): Promise<AuditRecord> {
    return this.request('GET', `/api/v1/audit/runs/${runId}`);
  }

  async getAuditSnapshots(
    runId: string,
    iteration?: number
  ): Promise<{ items: ConfigSnapshot[]; total: number }> {
    const params: Record<string, string> = {};
    if (iteration !== undefined) params.iteration = String(iteration);
    return this.request('GET', `/api/v1/audit/runs/${runId}/snapshots`, { params });
  }

  async getAuditChanges(runId: string): Promise<{
    items: ConfigChange[];
    total: number;
    summary: {
      totalChanges: number;
      byInitiator: { user: number; strategy: number; system: number };
    };
  }> {
    return this.request('GET', `/api/v1/audit/runs/${runId}/changes`);
  }
}
```

#### 6.3.7 Create Public Exports

Create `packages/client/src/index.ts`:

```typescript
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
} from './errors.js';

// Stream utilities
export { RunStream, streamEvents } from './stream.js';
export type { StreamOptions } from './stream.js';
```

#### 6.3.8 Create README

Create `packages/client/README.md`:

```markdown
# @agentgate/client

TypeScript client SDK for the AgentGate API.

## Installation

\`\`\`bash
npm install @agentgate/client
\`\`\`

## Quick Start

\`\`\`typescript
import { AgentGateClient } from '@agentgate/client';

const client = new AgentGateClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
});

// Create a work order
const workOrder = await client.createWorkOrder({
  taskPrompt: 'Implement feature X',
  workspaceSource: { type: 'github', repo: 'owner/repo' },
  harness: {
    profile: 'ci-focused',
    loopStrategy: { maxIterations: 5 },
  },
});

// Stream run events
const stream = client.streamRun(workOrder.runs[0].id, {
  onEvent: (event) => {
    console.log(`${event.type}:`, event.data);
  },
  onClose: () => {
    console.log('Stream closed');
  },
});
\`\`\`

## API Reference

### Work Orders

- `listWorkOrders(options?)` - List work orders
- `getWorkOrder(id)` - Get work order details
- `createWorkOrder(options)` - Submit new work order
- `cancelWorkOrder(id)` - Cancel work order

### Runs

- `listRuns(options?)` - List runs
- `getRun(id)` - Get run details
- `getRunConfig(id)` - Get resolved harness config
- `streamRun(id, options)` - Stream run events
- `streamRunEvents(id)` - Async iterator for events

### Profiles

- `listProfiles()` - List all profiles
- `getProfile(name, resolve?)` - Get profile details
- `createProfile(options)` - Create new profile
- `updateProfile(name, options)` - Update profile
- `deleteProfile(name)` - Delete profile
- `validateProfile(name)` - Validate profile

### Audit

- `getAuditRecord(runId)` - Get audit record
- `getAuditSnapshots(runId, iteration?)` - Get snapshots
- `getAuditChanges(runId)` - Get config changes

## Error Handling

\`\`\`typescript
import { NotFoundError, ValidationError } from '@agentgate/client';

try {
  await client.getWorkOrder('invalid-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Work order not found');
  } else if (error instanceof ValidationError) {
    console.log('Validation failed:', error.details);
  }
}
\`\`\`
\`\`\`
```

### 6.4 Verification Steps

1. Build package successfully
2. Test all client methods with mock server
3. Test SSE streaming
4. Test error handling for all error types
5. Verify types match API responses
6. Test async iterator pattern
7. Generate and test package distribution

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/client/package.json` | Created |
| `packages/client/tsconfig.json` | Created |
| `packages/client/README.md` | Created |
| `packages/client/src/index.ts` | Created |
| `packages/client/src/client.ts` | Created |
| `packages/client/src/types.ts` | Created |
| `packages/client/src/errors.ts` | Created |
| `packages/client/src/stream.ts` | Created |
| `pnpm-workspace.yaml` | Modified - add client package |

---

## Usage Examples

### Basic Usage

```typescript
import { AgentGateClient } from '@agentgate/client';

const client = new AgentGateClient({
  baseUrl: 'http://localhost:3000',
  apiKey: process.env.AGENTGATE_API_KEY,
});

// Submit work order with harness profile
const wo = await client.createWorkOrder({
  taskPrompt: 'Add dark mode toggle to settings page',
  workspaceSource: { type: 'github', repo: 'myorg/myapp' },
  harness: {
    profile: 'ci-focused',
    loopStrategy: { maxIterations: 8 },
  },
});

console.log(`Created work order: ${wo.id}`);
```

### Streaming Events

```typescript
// Callback-based streaming
const stream = client.streamRun(runId, {
  onEvent: (event) => {
    switch (event.type) {
      case 'iteration-start':
        console.log(`Starting iteration ${event.data.iteration}`);
        break;
      case 'verification-complete':
        console.log(`Verification ${event.data.level}: ${event.data.passed ? 'PASS' : 'FAIL'}`);
        break;
      case 'run-complete':
        console.log(`Run completed: ${event.data.status}`);
        break;
    }
  },
  onError: (err) => console.error('Stream error:', err),
});

// Async iterator pattern
for await (const event of client.streamRunEvents(runId)) {
  console.log(event.type, event.data);
  if (event.type === 'run-complete') break;
}
```

### Profile Management

```typescript
// Create a custom profile
await client.createProfile({
  name: 'my-ci-profile',
  extends: 'default',
  description: 'Custom CI profile',
  loopStrategy: {
    mode: 'hybrid',
    maxIterations: 10,
    requireCI: true,
  },
  verification: {
    waitForCI: true,
  },
});

// Validate profile
const validation = await client.validateProfile('my-ci-profile');
if (!validation.valid) {
  console.error('Profile errors:', validation.errors);
}
```

### Audit Trail Queries

```typescript
// Get audit record for a run
const audit = await client.getAuditRecord(runId);
console.log(`Config changed: ${audit.configHashChanged}`);
console.log(`Total changes: ${audit.changeCount}`);

// Get specific changes
const { items: changes } = await client.getAuditChanges(runId);
for (const change of changes) {
  console.log(`${change.path}: ${change.previousValue} -> ${change.newValue}`);
  console.log(`  Reason: ${change.reason} (by ${change.initiator})`);
}
```
