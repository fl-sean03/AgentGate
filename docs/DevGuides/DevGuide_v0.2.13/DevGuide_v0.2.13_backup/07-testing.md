# 07: Testing Strategy

## Thrust 8: Comprehensive Testing

### 8.1 Objective

Ensure sandbox implementation is robust through comprehensive unit, integration, and E2E testing.

### 8.2 Background

The sandbox system is security-critical and must be thoroughly tested:
- Unit tests for each component
- Integration tests for provider interactions
- E2E tests for full execution flow
- Security tests for isolation verification

### 8.3 Subtasks

#### 8.3.1 Unit Tests - Types and Interfaces

Create `packages/server/test/sandbox/types.test.ts`:

**Test cases:**
- SandboxConfig validation
- ResourceLimits defaults
- SandboxStatus transitions
- ExecResult structure

#### 8.3.2 Unit Tests - SubprocessProvider

Create `packages/server/test/sandbox/subprocess-provider.test.ts`:

**Test cases:**
1. `isAvailable()` returns true
2. `createSandbox()` returns valid sandbox
3. Simple command execution
4. Command with arguments
5. Environment variable passing
6. Working directory setting
7. Stdout capture
8. Stderr capture
9. Exit code capture
10. Timeout handling
11. File write operation
12. File read operation
13. Path traversal blocked
14. Sandbox destruction
15. Process cleanup on destroy

#### 8.3.3 Unit Tests - DockerProvider

Create `packages/server/test/sandbox/docker-provider.test.ts`:

**Test cases (mock Docker):**
1. `isAvailable()` when Docker running
2. `isAvailable()` when Docker not running
3. `createSandbox()` creates container
4. Container has correct mounts
5. Container has correct limits
6. Container has correct network mode
7. Exec runs command in container
8. Stdout/stderr captured
9. Timeout kills container
10. Destroy removes container
11. Orphan cleanup works

**Integration tests (real Docker):**
- Marked with `describe.runIf(dockerAvailable)`
- Skip if Docker not running
- Real container creation/destruction

#### 8.3.4 Unit Tests - SandboxManager

Create `packages/server/test/sandbox/manager.test.ts`:

**Test cases:**
1. Auto-selects Docker when available
2. Falls back to subprocess when Docker unavailable
3. Respects explicit provider config
4. Tracks active sandboxes
5. Cleanup destroys all sandboxes
6. Periodic cleanup removes orphans
7. Status reporting accurate

#### 8.3.5 Integration Tests - Driver Integration

Create `packages/server/test/sandbox/driver-integration.test.ts`:

**Test cases:**
1. ClaudeCodeDriver uses sandbox
2. ClaudeCodeSubscriptionDriver uses sandbox
3. Sandbox info in AgentResult
4. Fallback to subprocess works
5. Environment variables passed correctly

#### 8.3.6 E2E Tests - Full Execution

Create `packages/server/test/sandbox/e2e.test.ts`:

**Test cases:**
1. Full agent execution in Docker container
2. File modifications persist in workspace
3. Network isolation verified (can't reach internet)
4. Resource limits enforced
5. Container removed after execution
6. Multiple concurrent sandboxes
7. Session resume across sandboxes

#### 8.3.7 Security Tests

Create `packages/server/test/sandbox/security.test.ts`:

**Test cases:**
1. Cannot read files outside workspace
2. Cannot write files outside workspace
3. Cannot see host processes (Docker only)
4. Cannot access host network (when mode=none)
5. OOM killer triggers on memory excess
6. Process limit prevents fork bombs

### 8.4 Test Utilities

#### Mock Docker Client

Create test utility for mocking Docker:

```typescript
function createMockDockerClient() {
  return {
    ping: vi.fn().mockResolvedValue({}),
    createContainer: vi.fn().mockResolvedValue({ id: 'mock-container' }),
    // ... other methods
  };
}
```

#### Docker Availability Check

```typescript
const dockerAvailable = await checkDockerAvailable();

describe.runIf(dockerAvailable)('Docker integration tests', () => {
  // Real Docker tests
});
```

#### Test Sandbox Factory

```typescript
function createTestSandboxConfig(overrides = {}): SandboxConfig {
  return {
    workspacePath: '/tmp/test-workspace',
    workspaceMount: '/workspace',
    image: 'agentgate/agent:test',
    resourceLimits: {
      cpuCount: 1,
      memoryMB: 512,
      timeoutSeconds: 30,
    },
    networkMode: 'none',
    env: {},
    ...overrides,
  };
}
```

### 8.5 Verification Steps

1. Run `pnpm test` - all tests pass
2. Run with Docker - integration tests run
3. Run without Docker - integration tests skip gracefully
4. Code coverage > 80% for sandbox module
5. No security tests failing
6. E2E tests complete successfully

### 8.6 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/test/sandbox/types.test.ts` | Created |
| `packages/server/test/sandbox/subprocess-provider.test.ts` | Created |
| `packages/server/test/sandbox/docker-provider.test.ts` | Created |
| `packages/server/test/sandbox/manager.test.ts` | Created |
| `packages/server/test/sandbox/driver-integration.test.ts` | Created |
| `packages/server/test/sandbox/e2e.test.ts` | Created |
| `packages/server/test/sandbox/security.test.ts` | Created |
| `packages/server/test/sandbox/test-utils.ts` | Created |

---

## Test Matrix

### Unit Test Coverage

| Component | Tests | Coverage Target |
|-----------|-------|-----------------|
| types.ts | 5 | 100% |
| subprocess-provider.ts | 15 | 90% |
| docker-provider.ts | 20 | 85% |
| docker-client.ts | 10 | 85% |
| manager.ts | 10 | 90% |

### Integration Test Matrix

| Scenario | Docker | Subprocess |
|----------|--------|------------|
| Simple exec | ✓ | ✓ |
| File operations | ✓ | ✓ |
| Env variables | ✓ | ✓ |
| Timeout | ✓ | ✓ |
| Resource limits | ✓ | N/A |
| Network isolation | ✓ | N/A |
| Cleanup | ✓ | ✓ |

### Security Test Matrix

| Test | Docker | Subprocess | Expected |
|------|--------|------------|----------|
| Read /etc/passwd | ✓ | Skip | Blocked |
| Write to /tmp (host) | ✓ | Skip | Blocked |
| Network egress | ✓ | Skip | Blocked |
| Fork bomb | ✓ | Skip | Limited |
| Memory exhaustion | ✓ | Skip | OOM Kill |

---

## CI Integration

### Test Workflow Updates

Add Docker to CI for integration tests:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      docker:
        image: docker:dind
        options: --privileged
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: pnpm test
        env:
          DOCKER_HOST: tcp://docker:2375
```

### Test Tags

Use tags to categorize tests:

```typescript
describe('DockerProvider', () => {
  describe.runIf(dockerAvailable)('integration', () => {
    // Real Docker tests
  });

  describe('unit', () => {
    // Mock-based tests
  });
});
```
