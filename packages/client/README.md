# @agentgate/client

TypeScript client SDK for the AgentGate API.

## Installation

```bash
npm install @agentgate/client
```

## Quick Start

```typescript
import { AgentGateClient } from '@agentgate/client';

const client = new AgentGateClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
});

// Create a work order
const workOrder = await client.workOrders.create({
  taskPrompt: 'Implement feature X',
  workspaceSource: { type: 'github', repo: 'owner/repo' },
  harness: {
    profile: 'ci-focused',
    loopStrategy: { maxIterations: 5 },
  },
});

// Stream run events
const stream = client.runs.stream(workOrder.runs[0].id, {
  onEvent: (event) => {
    console.log(`${event.type}:`, event.data);
  },
  onClose: () => {
    console.log('Stream closed');
  },
});
```

## API Reference

### Work Orders

- `client.workOrders.list(options?)` - List work orders
- `client.workOrders.get(id)` - Get work order details
- `client.workOrders.create(options)` - Submit new work order
- `client.workOrders.cancel(id)` - Cancel work order
- `client.workOrders.getAudit(id)` - Get work order audit summary

### Runs

- `client.runs.list(options?)` - List runs
- `client.runs.get(id)` - Get run details
- `client.runs.getConfig(id)` - Get resolved harness config
- `client.runs.getStrategyState(id)` - Get strategy state
- `client.runs.stream(id, options)` - Stream run events (callback-based)
- `client.runs.streamEvents(id)` - Async iterator for events

### Profiles

- `client.profiles.list()` - List all profiles
- `client.profiles.get(name, resolve?)` - Get profile details
- `client.profiles.create(options)` - Create new profile
- `client.profiles.update(name, options)` - Update profile
- `client.profiles.delete(name)` - Delete profile
- `client.profiles.validate(name)` - Validate profile

### Audit

- `client.audit.getRecord(runId)` - Get audit record
- `client.audit.getSnapshots(runId, iteration?)` - Get snapshots
- `client.audit.getChanges(runId)` - Get config changes

## Configuration

```typescript
interface AgentGateClientConfig {
  baseUrl: string;        // API base URL (required)
  apiKey?: string;        // API key for authentication
  timeout?: number;       // Request timeout in ms (default: 30000)
  fetch?: typeof fetch;   // Custom fetch implementation
}
```

## Streaming Events

### Callback-based streaming

```typescript
const stream = client.runs.stream(runId, {
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
  onOpen: () => console.log('Connected'),
  onClose: () => console.log('Disconnected'),
});

// Close stream manually if needed
stream.close();
```

### Async iterator pattern

```typescript
for await (const event of client.runs.streamEvents(runId)) {
  console.log(event.type, event.data);
  if (event.type === 'run-complete') break;
}
```

## Error Handling

```typescript
import {
  NotFoundError,
  ValidationError,
  AuthenticationError,
  NetworkError
} from '@agentgate/client';

try {
  await client.workOrders.get('invalid-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Work order not found');
  } else if (error instanceof ValidationError) {
    console.log('Validation failed:', error.details);
  } else if (error instanceof AuthenticationError) {
    console.log('Authentication required');
  } else if (error instanceof NetworkError) {
    console.log('Network error:', error.message);
  }
}
```

### Error Types

| Error Class | Status | Description |
|------------|--------|-------------|
| `AgentGateError` | - | Base error class |
| `NetworkError` | 0 | Network-level failures |
| `ValidationError` | 400 | Invalid request data |
| `AuthenticationError` | 401 | Missing/invalid auth |
| `NotFoundError` | 404 | Resource not found |
| `ConflictError` | 409 | Resource conflict |
| `RateLimitError` | 429 | Rate limit exceeded |
| `ServerError` | 5xx | Server-side errors |

## Profile Management

```typescript
// Create a custom profile
await client.profiles.create({
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
const validation = await client.profiles.validate('my-ci-profile');
if (!validation.valid) {
  console.error('Profile errors:', validation.errors);
}

// Get resolved profile with full inheritance
const resolved = await client.profiles.get('my-ci-profile', true);
console.log('Inheritance chain:', resolved.resolved?.inheritanceChain);
```

## Audit Trail Queries

```typescript
// Get audit record for a run
const audit = await client.audit.getRecord(runId);
console.log(`Config changed: ${audit.configHashChanged}`);
console.log(`Total changes: ${audit.changeCount}`);

// Get specific changes
const { items: changes } = await client.audit.getChanges(runId);
for (const change of changes) {
  console.log(`${change.path}: ${change.previousValue} -> ${change.newValue}`);
  console.log(`  Reason: ${change.reason} (by ${change.initiator})`);
}

// Get config snapshots
const { items: snapshots } = await client.audit.getSnapshots(runId);
for (const snapshot of snapshots) {
  console.log(`Iteration ${snapshot.iteration}: ${snapshot.configHash}`);
}
```

## License

MIT
