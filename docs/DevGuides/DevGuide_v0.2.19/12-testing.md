# 12: Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for v0.2.19, covering unit tests, integration tests, and end-to-end validation for all new observability and reliability features.

---

## Test Structure

```
packages/server/test/
├── unit/
│   ├── result-persister.test.ts       # Thrust 1-2
│   ├── iteration-data.test.ts          # Thrust 3
│   ├── error-builder.test.ts           # Thrust 4
│   ├── retry-executor.test.ts          # Thrust 5
│   ├── github-handler.test.ts          # Thrust 6
│   ├── work-order-queue.test.ts        # Thrust 7
│   ├── workspace-manager.test.ts       # Thrust 8
│   ├── loop-strategies.test.ts         # Thrust 9
│   └── orchestrator-events.test.ts     # Thrust 10
├── integration/
│   ├── observability-flow.test.ts      # Full observability chain
│   ├── retry-behavior.test.ts          # Retry across components
│   ├── queue-flow.test.ts              # Queue to execution flow
│   └── event-subscribers.test.ts       # Event emission and handling
└── e2e/
    ├── dogfooding.test.ts              # Use AgentGate to test AgentGate
    └── full-run-diagnostics.test.ts    # Complete run with all diagnostics
```

---

## Phase 1: Observability Tests

### Unit Tests

#### ResultPersister Tests

```typescript
// packages/server/test/unit/result-persister.test.ts

describe('ResultPersister', () => {
  describe('saveAgentResult', () => {
    it('should save full agent result to disk', async () => {
      // Verify all fields are saved
    });

    it('should truncate large stdout with warning', async () => {
      // Verify truncation at maxStdoutBytes
    });

    it('should handle missing optional fields gracefully', async () => {
      // Test with minimal AgentResult
    });

    it('should create run directory if not exists', async () => {
      // Verify directory creation
    });
  });

  describe('saveVerificationReport', () => {
    it('should save full verification report', async () => {
      // Verify all level results saved
    });

    it('should record skipped levels from config', async () => {
      // Verify skipLevels captured
    });

    it('should preserve check output', async () => {
      // Verify error messages preserved
    });
  });

  describe('loadAgentResult', () => {
    it('should load saved result correctly', async () => {
      // Round-trip test
    });

    it('should return null for missing file', async () => {
      // Handle ENOENT gracefully
    });
  });
});
```

#### IterationData Tests

```typescript
// packages/server/test/unit/iteration-data.test.ts

describe('IterationData', () => {
  describe('createIterationData', () => {
    it('should create with all default fields', () => {
      const data = createIterationData(1);
      expect(data.agentSessionId).toBeNull();
      expect(data.verificationFile).toBeNull();
      expect(data.errorType).toBe(IterationErrorType.NONE);
    });
  });

  describe('updateWithAgentResult', () => {
    it('should populate all agent fields', () => {
      // Verify sessionId, model, tokens, cost
    });
  });

  describe('updateWithError', () => {
    it('should set error type and complete iteration', () => {
      // Verify errorType, message, completedAt
    });
  });
});
```

#### ErrorBuilder Tests

```typescript
// packages/server/test/unit/error-builder.test.ts

describe('ErrorBuilder', () => {
  describe('fromAgentResult', () => {
    it('should classify timeout (exit 137) as AGENT_TIMEOUT', () => {});
    it('should classify crash (exit != 0, no output) as AGENT_CRASH', () => {});
    it('should include context from result', () => {});
    it('should truncate long output with tail', () => {});
  });

  describe('fromVerificationReport', () => {
    it('should classify typecheck failure', () => {});
    it('should classify test failure', () => {});
    it('should extract error counts from output', () => {});
  });
});
```

### Integration Tests

```typescript
// packages/server/test/integration/observability-flow.test.ts

describe('Observability Flow', () => {
  it('should persist all diagnostic files for a run', async () => {
    // Execute a run (mocked agent)
    // Verify: agent-1.json, verification-1.json, iteration-1.json exist
    // Verify: contents are complete and parseable
  });

  it('should include file references in errors', async () => {
    // Execute failing run
    // Verify: error message includes file paths
    // Verify: files contain diagnostic data
  });

  it('should handle persistence failures gracefully', async () => {
    // Make disk writes fail
    // Verify: run continues, doesn't crash
    // Verify: error logged
  });
});
```

---

## Phase 2: Reliability Tests

### Unit Tests

#### RetryExecutor Tests

```typescript
// packages/server/test/unit/retry-executor.test.ts

describe('RetryExecutor', () => {
  describe('execute', () => {
    it('should succeed on first attempt without retry', async () => {});
    it('should retry on retryable error', async () => {});
    it('should respect maxAttempts', async () => {});
    it('should calculate exponential backoff', async () => {});
    it('should add jitter when enabled', async () => {});
    it('should not retry non-retryable errors', async () => {});
    it('should call onAttempt callback for each attempt', async () => {});
  });

  describe('isRetryable', () => {
    it('should check configured error types', () => {});
    it('should handle timeout separately', () => {});
  });
});
```

#### GitHubHandler Tests

```typescript
// packages/server/test/unit/github-handler.test.ts

describe('GitHubOperationHandler', () => {
  describe('DISABLED mode', () => {
    it('should skip all operations', async () => {});
    it('should mark operations as skipped in summary', async () => {});
  });

  describe('FAIL_FAST mode', () => {
    it('should return failure on error', async () => {});
    it('should mark shouldFailRun as true', async () => {});
  });

  describe('BEST_EFFORT mode', () => {
    it('should return success even on error', async () => {});
    it('should record failure in summary', async () => {});
    it('should not fail run', async () => {});
  });
});
```

#### WorkOrderQueue Tests

```typescript
// packages/server/test/unit/work-order-queue.test.ts

describe('WorkOrderQueue', () => {
  describe('enqueue', () => {
    it('should return position immediately', () => {});
    it('should respect priority ordering', () => {});
    it('should reject when full', () => {});
  });

  describe('position tracking', () => {
    it('should update positions when items complete', () => {});
    it('should estimate wait times', () => {});
  });

  describe('ready event', () => {
    it('should emit when capacity available', () => {});
  });
});
```

### Integration Tests

```typescript
// packages/server/test/integration/retry-behavior.test.ts

describe('Retry Behavior', () => {
  it('should retry agent execution on timeout', async () => {
    // Configure short timeout
    // Mock agent to timeout first, succeed second
    // Verify retry happened
  });

  it('should retry GitHub operations on rate limit', async () => {
    // Mock GitHub to return 429 then succeed
    // Verify retry with backoff
  });

  it('should fail fast on code errors', async () => {
    // Mock typecheck failure
    // Verify no retry attempted
  });
});

// packages/server/test/integration/queue-flow.test.ts

describe('Queue Flow', () => {
  it('should queue work orders at capacity', async () => {
    // Submit maxConcurrent + 1 work orders
    // Verify first two running, third queued
    // Complete one, verify third starts
  });

  it('should notify position changes', async () => {
    // Subscribe to position changes
    // Verify callbacks as queue moves
  });
});
```

---

## Phase 3: Architecture Tests

### Unit Tests

```typescript
// packages/server/test/unit/workspace-manager.test.ts

describe('WorkspaceManager', () => {
  it('should delegate to underlying implementations', async () => {});
  it('should track active workspaces', () => {});
  it('should emit events for operations', async () => {});
  it('should cleanup on prepareForRun failure', async () => {});
});

// packages/server/test/unit/loop-strategies.test.ts

describe('LoopStrategies', () => {
  describe('FixedStrategy', () => {
    it('should continue until max iterations', async () => {});
    it('should stop early on success', async () => {});
  });

  describe('HybridStrategy', () => {
    it('should use bonus iterations when progressing', async () => {});
    it('should stop when no progress', async () => {});
  });

  describe('RalphStrategy', () => {
    it('should detect convergence', async () => {});
    it('should respect min/max bounds', async () => {});
  });
});

// packages/server/test/unit/orchestrator-events.test.ts

describe('Orchestrator Events', () => {
  it('should emit events at key points', async () => {});
  it('should support multiple subscribers', () => {});
  it('should provide type-safe event handling', () => {});
});
```

### Integration Tests

```typescript
// packages/server/test/integration/event-subscribers.test.ts

describe('Event Subscribers', () => {
  it('should broadcast to SSE clients on events', async () => {});
  it('should record metrics on agent complete', async () => {});
  it('should write audit entries on run complete', async () => {});
});
```

---

## E2E Tests

### Dogfooding Test

```typescript
// packages/server/test/e2e/dogfooding.test.ts

describe('Dogfooding', () => {
  it('should complete a work order with full diagnostics', async () => {
    // Submit work order to add a simple feature
    // Wait for completion
    // Verify:
    //   - agent-*.json files exist
    //   - verification-*.json files exist
    //   - iteration-*.json files exist
    //   - Error (if any) includes file references
    //   - SSE events were broadcast
  }, 300000);  // 5 minute timeout

  it('should handle agent failure with complete diagnostics', async () => {
    // Submit work order that will fail
    // Verify diagnostic files still created
    // Verify error classification correct
  });
});
```

### Full Run Diagnostics Test

```typescript
// packages/server/test/e2e/full-run-diagnostics.test.ts

describe('Full Run Diagnostics', () => {
  it('should capture all diagnostic data for successful run', async () => {
    // Execute full run
    // Load and verify each file type
    // Verify relationships between files
  });

  it('should capture all diagnostic data for failed run', async () => {
    // Execute failing run
    // Verify error chain
    // Verify all files readable and useful
  });
});
```

---

## Test Coverage Requirements

### Minimum Coverage by Component

| Component | Line Coverage | Branch Coverage |
|-----------|---------------|-----------------|
| ResultPersister | 90% | 85% |
| ErrorBuilder | 95% | 90% |
| RetryExecutor | 90% | 85% |
| GitHubHandler | 90% | 85% |
| WorkOrderQueue | 90% | 85% |
| WorkspaceManager | 80% | 75% |
| LoopStrategies | 95% | 90% |
| OrchestratorEvents | 85% | 80% |

### Running Tests

```bash
# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:integration

# E2E tests (requires running server)
pnpm test:e2e

# Coverage report
pnpm test:coverage

# Watch mode during development
pnpm test:watch
```

---

## Test Data Fixtures

### Sample AgentResult

```typescript
// packages/server/test/fixtures/agent-results.ts

export const successfulAgentResult: AgentResult = {
  success: true,
  exitCode: 0,
  stdout: 'Created 3 files successfully',
  stderr: '',
  sessionId: 'test-session-123',
  model: 'claude-3-opus-20240229',
  durationMs: 45000,
  tokensUsed: { input: 15000, output: 8000, total: 23000 },
  totalCostUsd: 0.58,
  structuredOutput: null,
  toolCalls: [
    { tool: 'Write', input: { path: 'file.ts' }, output: 'ok', durationMs: 100 }
  ],
};

export const failedAgentResult: AgentResult = {
  success: false,
  exitCode: 1,
  stdout: 'Attempting to fix...',
  stderr: 'Error: TypeScript compilation failed',
  sessionId: 'test-session-456',
  model: 'claude-3-opus-20240229',
  durationMs: 30000,
  tokensUsed: { input: 10000, output: 5000, total: 15000 },
  structuredOutput: null,
};

export const timeoutAgentResult: AgentResult = {
  success: false,
  exitCode: 137,  // SIGKILL
  stdout: 'Processing...',
  stderr: 'Killed',
  sessionId: null,
  model: null,
  durationMs: 300000,
  tokensUsed: null,
  structuredOutput: null,
};
```

### Sample VerificationReport

```typescript
// packages/server/test/fixtures/verification-reports.ts

export const passingVerificationReport: VerificationReport = {
  runId: 'test-run-1',
  iteration: 1,
  overall: { passed: true, summary: 'All checks passed' },
  levels: {
    L0: {
      level: 'L0',
      passed: true,
      checks: [
        { name: 'typecheck', passed: true, output: '', duration: 5000 },
        { name: 'lint', passed: true, output: '', duration: 2000 },
      ],
      duration: 7000,
    },
    L1: {
      level: 'L1',
      passed: true,
      checks: [
        { name: 'test', passed: true, output: '42 passed', duration: 30000 },
      ],
      duration: 30000,
    },
  },
  duration: 37000,
  completedAt: new Date(),
};

export const failingVerificationReport: VerificationReport = {
  runId: 'test-run-1',
  iteration: 1,
  overall: { passed: false, summary: 'L0 failed: TypeScript errors' },
  levels: {
    L0: {
      level: 'L0',
      passed: false,
      checks: [
        {
          name: 'typecheck',
          passed: false,
          output: "src/foo.ts(10,5): error TS2304: Cannot find name 'bar'",
          duration: 5000,
        },
      ],
      duration: 5000,
    },
  },
  duration: 5000,
  completedAt: new Date(),
};
```

---

## Verification Checklist

- [ ] All unit tests written for Phase 1 components
- [ ] All unit tests written for Phase 2 components
- [ ] All unit tests written for Phase 3 components
- [ ] Integration tests cover cross-component flows
- [ ] E2E tests verify dogfooding scenarios
- [ ] Test fixtures provide consistent test data
- [ ] Coverage meets minimum requirements
- [ ] Tests run in CI pipeline
- [ ] Watch mode works for development
- [ ] All tests pass before merge
