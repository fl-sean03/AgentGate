# 03: Robustness & Recovery Thrusts

These thrusts focus on error handling, external service integration, and recovery mechanisms. They can be parallelized after Phase 1 is complete.

---

## Thrust 6: Error Propagation Framework

### 6.1 Objective

Create a structured error system that ensures all errors are properly typed, contextual, and actionable throughout the codebase.

### 6.2 Background

Current error handling is inconsistent:

- Some errors are swallowed silently
- Error messages lack context
- No error codes for programmatic handling
- Stack traces sometimes lost
- No distinction between recoverable and fatal errors

### 6.3 Subtasks

#### 6.3.1 Create Error Type Hierarchy

Create `src/errors/index.ts` with base error classes:

- `AgentGateError` - Base class for all errors
  - `code`: String error code (e.g., "SANDBOX_TIMEOUT")
  - `context`: Object with additional details
  - `recoverable`: Boolean indicating if retry might help
  - `cause`: Original error if wrapping

- `ConfigurationError` - Invalid configuration
- `ExecutionError` - Runtime execution failures
- `TimeoutError` - Operation timed out
- `ResourceError` - Resource not found/unavailable
- `ExternalServiceError` - GitHub, Docker, etc. failures
- `ValidationError` - Input validation failures

#### 6.3.2 Create Error Codes Registry

Create `src/errors/codes.ts`:

- Enumerate all error codes with categories
- Categories: CONFIG, EXEC, TIMEOUT, RESOURCE, EXTERNAL, VALIDATION
- Each code has: name, default message, recoverable flag
- Export type-safe error code type

Example codes:
- `EXEC_TIMEOUT` - Execution exceeded time limit
- `SANDBOX_CREATION_FAILED` - Failed to create sandbox
- `GITHUB_RATE_LIMITED` - GitHub API rate limit exceeded
- `GIT_CONFLICT` - Git merge conflict detected

#### 6.3.3 Create Error Factory

Create `src/errors/factory.ts`:

- `createError(code, context?, cause?)` - Create typed error
- `wrapError(code, originalError, context?)` - Wrap existing error
- `isRecoverable(error)` - Check if error is recoverable
- `toJSON(error)` - Serialize error for logging/API

#### 6.3.4 Migrate Existing Error Handling

Audit and update error handling in critical paths:

- `src/orchestrator/orchestrator.ts` - Use typed errors
- `src/queue/execution-manager.ts` - Replace generic errors
- `src/sandbox/*.ts` - Add context to sandbox errors
- `src/delivery/*.ts` - Replace empty catch blocks

Each migration should:
- Replace `new Error(message)` with `createError(code, context)`
- Replace empty catch with `catch (error) { throw wrapError(code, error, context); }`
- Add `context` with relevant variables

#### 6.3.5 Add Error Logging Integration

Modify `src/utils/logger.ts`:

- `logger.errorWithCode(error: AgentGateError)` - Logs with code and context
- Automatically extracts error chain
- Redacts sensitive context fields
- Includes stack trace in debug mode

#### 6.3.6 Add Error API Response Formatting

Modify `src/server/middleware/error-handler.ts`:

- Map error codes to HTTP status codes
- Include error code in response body
- Include context (redacted) in development mode
- Preserve error chain for debugging

### 6.4 Verification Steps

1. Trigger each error type and verify structured error logged
2. Verify API returns appropriate HTTP status and error code
3. Verify error context includes relevant information
4. Verify stack trace is preserved through wrapping
5. Verify sensitive fields are redacted in logs
6. Run `pnpm test` - all tests pass
7. Run `pnpm lint` - no new warnings

### 6.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/errors/index.ts` | Created | Error base classes |
| `src/errors/codes.ts` | Created | Error code registry |
| `src/errors/factory.ts` | Created | Error creation utilities |
| `src/errors/errors.test.ts` | Created | Error system tests |
| `src/utils/logger.ts` | Modified | Add error-aware logging |
| `src/server/middleware/error-handler.ts` | Modified | Structured error responses |
| `src/orchestrator/orchestrator.ts` | Modified | Use typed errors |
| `src/queue/execution-manager.ts` | Modified | Use typed errors |
| `src/sandbox/*.ts` | Modified | Add error context |
| `src/delivery/*.ts` | Modified | Replace empty catches |

---

## Thrust 7: GitHub Rate Limit Handling

### 7.1 Objective

Implement intelligent rate limit detection and backoff for all GitHub API operations.

### 7.2 Background

GitHub API has rate limits:

- 5,000 requests/hour for authenticated requests
- Lower limits for some endpoints
- Abuse detection for rapid requests

Currently, rate limits cause immediate failures with no retry.

### 7.3 Subtasks

#### 7.3.1 Create Rate Limit Tracker

Create `src/github/rate-limiter.ts`:

- Track remaining requests from response headers
- Track reset timestamp
- `canMakeRequest()` - Check if request is allowed
- `waitForReset()` - Wait until limit resets
- `recordRequest(response)` - Update tracking from response

#### 7.3.2 Implement Retry with Backoff

Create `src/github/retry.ts`:

- `withRetry(fn, options)` - Wrap function with retry logic
- Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 5 attempts)
- Jitter to prevent thundering herd
- Respect `Retry-After` header when present
- Stop retry on non-recoverable errors (401, 404)

#### 7.3.3 Create GitHub Client Wrapper

Create `src/github/client.ts`:

- Wrapper around Octokit that integrates rate limiting
- All API calls go through this wrapper
- Automatic retry on rate limit
- Logging of rate limit status

#### 7.3.4 Integrate with Existing GitHub Operations

Migrate all GitHub API usage to new client:

- `src/workspace/github.ts` - Repository operations
- `src/delivery/pr-handler.ts` - PR creation
- `src/github/workflow-monitor.ts` - CI status polling

Each migration should:
- Replace direct Octokit calls with wrapped client
- Remove any existing retry logic
- Add appropriate error handling for rate limits

#### 7.3.5 Add Rate Limit Metrics

Track rate limit metrics:

- Current remaining requests
- Time until reset
- Number of retries per operation
- Total rate limit hits

Expose via health endpoint and logs.

#### 7.3.6 Add Configuration

Add rate limit configuration:

- `github.rateLimit.enabled` - Enable rate limit handling (default: true)
- `github.rateLimit.reservePercent` - Reserve buffer (default: 10%)
- `github.rateLimit.maxRetries` - Maximum retry attempts (default: 5)
- `github.rateLimit.baseDelayMs` - Base backoff delay (default: 1000)

### 7.4 Verification Steps

1. Configure a test with very low rate limit reserve
2. Make rapid API calls until rate limit approached
3. Verify operations queue and wait for reset
4. Verify no requests fail due to rate limit
5. Check rate limit metrics in health endpoint
6. Run `pnpm test` - all tests pass

### 7.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/github/rate-limiter.ts` | Created | Rate limit tracking |
| `src/github/retry.ts` | Created | Retry with backoff |
| `src/github/client.ts` | Created | Wrapped GitHub client |
| `src/github/rate-limiter.test.ts` | Created | Rate limiter tests |
| `src/workspace/github.ts` | Modified | Use wrapped client |
| `src/delivery/pr-handler.ts` | Modified | Use wrapped client |
| `src/github/workflow-monitor.ts` | Modified | Use wrapped client |
| `src/config/index.ts` | Modified | Add rate limit config |

---

## Thrust 8: Process Tracking Persistence

### 8.1 Objective

Persist process tracking across server restarts to enable recovery of orphaned agent processes.

### 8.2 Background

Currently, `agent-process-manager.ts` tracks processes in memory:

- Server restart loses all tracking
- Orphaned processes can't be recovered
- No visibility into what processes should exist

### 8.3 Subtasks

#### 8.3.1 Create Process Registry

Create `src/control-plane/process-registry.ts`:

- Persistent tracking of managed processes
- Schema: processId, pid, runId, startedAt, lastHeartbeat, status
- Storage: `~/.agentgate/process-registry.json`
- `register(process)` - Add new process
- `updateHeartbeat(processId)` - Update last-seen time
- `markTerminated(processId, exitCode)` - Mark as terminated
- `getActive()` - Get processes that should be running

#### 8.3.2 Integrate with Agent Process Manager

Modify `src/control-plane/agent-process-manager.ts`:

- Register process when spawned
- Update heartbeat periodically (every 30s)
- Mark terminated when process exits
- Query registry on startup for orphans

#### 8.3.3 Implement Orphan Recovery

Add orphan detection on startup:

- Query registry for active processes
- Check if each process is actually running (via pid)
- For running processes, attempt graceful termination
- For missing processes, mark as terminated and update run state

#### 8.3.4 Add Process Health Checks

Implement periodic health checks:

- Every 60 seconds, verify tracked processes are still running
- Update registry if process died unexpectedly
- Log unexpected deaths for investigation

#### 8.3.5 Add Process List Command

Add CLI command `agentgate processes`:

- List all tracked processes
- Show status (running, terminated, orphaned)
- `--kill <processId>` - Force terminate specific process
- `--cleanup` - Terminate all orphaned processes

### 8.4 Verification Steps

1. Start a work order with long-running agent
2. Kill the server with SIGKILL
3. Verify agent process is still running (`ps aux`)
4. Restart server
5. Verify orphan is detected and terminated
6. Verify run state is updated appropriately
7. Run `agentgate processes` - shows clean state
8. Run `pnpm test` - all tests pass

### 8.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/control-plane/process-registry.ts` | Created | Persistent process tracking |
| `src/control-plane/process-registry.test.ts` | Created | Registry tests |
| `src/control-plane/agent-process-manager.ts` | Modified | Integrate registry |
| `src/control-plane/commands/processes.ts` | Created | Process list command |

---

## Thrust 9: Deadlock Detection for Spawning

### 9.1 Objective

Detect and prevent deadlocks when work orders spawn child work orders.

### 9.2 Background

Work orders can spawn children (recursive agents). Potential deadlocks:

- Parent waits for child, child waits for parent's resource
- Circular spawn dependencies
- Resource exhaustion from deep spawn trees
- Workspace lock contention

### 9.3 Subtasks

#### 9.3.1 Create Spawn Tree Tracker

Create `src/orchestrator/spawn-tracker.ts`:

- Track parent-child relationships
- Detect cycles in spawn graph
- Calculate tree depth for each work order
- `registerSpawn(parentId, childId)` - Record spawn relationship
- `getDepth(workOrderId)` - Get depth in spawn tree
- `detectCycle(parentId, proposedChildId)` - Check if spawn would create cycle

#### 9.3.2 Add Spawn Validation

Before allowing a spawn:

- Check current depth against max depth limit
- Check total descendants against limit
- Check for cycle in spawn graph
- Check if parent has capacity for more children

Reject spawn with descriptive error if any check fails.

#### 9.3.3 Implement Resource Allocation

Create resource allocation for spawned work orders:

- Parent allocates portion of its resources to children
- Track resource usage across spawn tree
- Prevent resource over-commitment
- Release resources when child completes

#### 9.3.4 Add Workspace Lock Ordering

Prevent workspace lock deadlocks:

- Assign global order to workspaces
- Always acquire locks in consistent order
- Detect potential deadlock and abort one party
- Log deadlock detection for debugging

#### 9.3.5 Add Spawn Limits to Harness Config

Extend harness profile:

- `spawning.maxDepth` - Maximum spawn tree depth (default: 3)
- `spawning.maxChildren` - Maximum children per parent (default: 5)
- `spawning.maxTotal` - Maximum total descendants (default: 20)
- `spawning.timeoutMultiplier` - Timeout adjustment per depth level

#### 9.3.6 Add Spawn Visualization

Add spawn tree to work order status:

- Tree structure showing parent-child relationships
- Depth and resource allocation per node
- Status of each node in tree
- Total resource usage

### 9.4 Verification Steps

1. Submit work order that spawns 3 children
2. Verify spawn tree is tracked correctly
3. Attempt spawn that would exceed depth limit
4. Verify spawn is rejected with clear error
5. Attempt spawn that would create cycle
6. Verify cycle is detected and prevented
7. Verify resources are released when children complete
8. Run `pnpm test` - all tests pass

### 9.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/orchestrator/spawn-tracker.ts` | Created | Spawn relationship tracking |
| `src/orchestrator/spawn-tracker.test.ts` | Created | Spawn tracker tests |
| `src/orchestrator/resource-allocator.ts` | Created | Resource allocation |
| `src/orchestrator/orchestrator.ts` | Modified | Integrate spawn validation |
| `src/types/harness-config.ts` | Modified | Add spawn limits |
| `src/workspace/lock-manager.ts` | Modified | Add lock ordering |

---

## Thrust 10: Resource Limit Enforcement

### 10.1 Objective

Enforce resource limits (memory, CPU, disk, file handles) to prevent runaway processes from affecting system stability.

### 10.2 Background

Current resource limits are partially implemented:

- Docker has memory/CPU limits but not consistently applied
- Subprocess has no resource limits
- No file handle limits
- No disk usage limits
- No enforcement feedback to agent

### 10.3 Subtasks

#### 10.3.1 Create Resource Monitor

Create `src/sandbox/resource-monitor.ts`:

- Monitor resource usage per sandbox
- Track: memory, CPU time, disk writes, file handles
- `getUsage(sandboxId)` - Get current usage
- `isWithinLimits(sandboxId)` - Check if within limits
- `getViolations(sandboxId)` - Get limit violations

#### 10.3.2 Enhance Docker Provider Limits

Modify `src/sandbox/docker-provider.ts`:

- Apply memory limit to container (from config)
- Apply CPU limit to container (from config)
- Apply disk quota (if supported by Docker storage driver)
- Report limit violations in execution result

#### 10.3.3 Add Subprocess Provider Limits

Modify `src/sandbox/subprocess-provider.ts`:

- Use `ulimit` or cgroups for memory limits
- Use `nice` for CPU priority
- Monitor disk writes via inotify
- Terminate process on limit violation

#### 10.3.4 Add File Handle Limits

Implement file handle management:

- Track open file handles per workspace
- Pool file handles for high-volume operations
- Close handles promptly after use
- Log warning when approaching limits

#### 10.3.5 Create Resource Limit Feedback

When limits are hit:

- Include in verification/execution feedback
- Specify which limit was exceeded
- Provide current usage vs limit
- Suggest resolution (request more resources, optimize)

#### 10.3.6 Add Resource Configuration

Extend configuration:

- `resources.memory.limit` - Memory limit per sandbox (default: 4GB)
- `resources.memory.warning` - Warning threshold (default: 80%)
- `resources.cpu.limit` - CPU cores limit (default: 2)
- `resources.disk.limit` - Disk write limit (default: 10GB)
- `resources.files.limit` - Open file handle limit (default: 1000)

### 10.4 Verification Steps

1. Configure low memory limit (256MB)
2. Run task that uses excessive memory
3. Verify task is terminated with memory limit error
4. Verify feedback includes memory usage details
5. Configure low file handle limit
6. Run task that opens many files
7. Verify warning logged at threshold
8. Run `pnpm test` - all tests pass

### 10.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `src/sandbox/resource-monitor.ts` | Created | Resource monitoring |
| `src/sandbox/resource-monitor.test.ts` | Created | Monitor tests |
| `src/sandbox/docker-provider.ts` | Modified | Enforce limits |
| `src/sandbox/subprocess-provider.ts` | Modified | Add limits |
| `src/feedback/resource-formatter.ts` | Created | Resource limit feedback |
| `src/config/index.ts` | Modified | Add resource config |
| `src/types/config.ts` | Modified | Add resource types |

---

## Phase 2 Completion Checklist

- [ ] Thrust 6: Error framework in place, all critical paths migrated
- [ ] Thrust 7: GitHub rate limiting working, no rate limit failures
- [ ] Thrust 8: Process tracking persists across restarts
- [ ] Thrust 9: Spawn deadlocks detected and prevented
- [ ] Thrust 10: Resource limits enforced and reported
- [ ] All existing tests still pass
- [ ] No new lint warnings
- [ ] Integration test for error scenarios

---

**Next**: [04-extensibility.md](./04-extensibility.md) - Extensibility Framework Thrusts
