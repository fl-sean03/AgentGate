# 04: Manager & Driver Integration

## Thrust 4: Sandbox Manager

### 4.1 Objective

Create a sandbox manager that handles provider selection, lifecycle management, and resource cleanup.

### 4.2 Background

The SandboxManager is the main entry point for the sandbox system. It:
- Selects the appropriate provider based on configuration and availability
- Manages sandbox lifecycle across all providers
- Handles cleanup of orphaned resources
- Provides observability into sandbox state

### 4.3 Subtasks

#### 4.3.1 Create SandboxManager Class

Create `packages/server/src/sandbox/manager.ts`:

**Constructor:**
- Accept optional provider override
- Initialize registered providers
- Configure default settings

**Provider Registration:**
- Register DockerProvider
- Register SubprocessProvider
- Allow external provider registration

**Provider Selection (auto mode):**
1. Check if DockerProvider is available
2. If available, use Docker
3. If not, fall back to SubprocessProvider
4. Log which provider is selected

#### 4.3.2 Implement Sandbox Creation

**createSandbox(config: SandboxConfig): Promise<Sandbox>**

1. Select provider based on config or auto-detection
2. Merge config with defaults
3. Validate configuration
4. Call provider.createSandbox()
5. Track sandbox in active map
6. Return sandbox handle

**Default Configuration:**
- workspaceMount: '/workspace'
- image: from AGENTGATE_SANDBOX_IMAGE
- resourceLimits:
  - cpuCount: from AGENTGATE_SANDBOX_CPU_LIMIT
  - memoryMB: from AGENTGATE_SANDBOX_MEMORY_MB
  - timeoutSeconds: from AGENTGATE_SANDBOX_TIMEOUT
- networkMode: from AGENTGATE_SANDBOX_NETWORK
- user: 'agentgate'

#### 4.3.3 Implement Lifecycle Management

**Track Active Sandboxes:**
- Map of sandbox ID to Sandbox instance
- Map of sandbox ID to creation time
- Map of sandbox ID to run ID (for correlation)

**destroySandbox(id: string): Promise<void>**
- Find sandbox in active map
- Call sandbox.destroy()
- Remove from active map
- Log destruction

**cleanup(): Promise<void>**
- Called on server shutdown
- Destroy all active sandboxes
- Call cleanup on all providers
- Remove orphaned containers (label-based)

#### 4.3.4 Implement Health Monitoring

**getStatus(): SandboxSystemStatus**
- Available providers
- Active sandbox count
- Resource usage summary
- Last error (if any)

**periodicCleanup():**
- Run every 5 minutes
- Find sandboxes older than timeout
- Destroy orphaned sandboxes
- Log cleanup actions

#### 4.3.5 Singleton Pattern

Export singleton manager instance:
- Create on first access
- Share across all drivers
- Clean up on process exit

### 4.4 Verification Steps

1. Create SandboxManager
2. Verify auto-selects Docker when available
3. Verify falls back to subprocess when Docker unavailable
4. Create sandbox via manager
5. Verify tracked in active map
6. Destroy sandbox
7. Verify removed from map
8. Run cleanup
9. Verify orphaned containers removed

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/sandbox/manager.ts` | Created |
| `packages/server/src/sandbox/index.ts` | Modified - export manager |

---

## Thrust 5: Driver Integration

### 5.1 Objective

Update agent drivers to use the sandbox system for execution instead of direct subprocess spawning.

### 5.2 Background

The current drivers use `spawn()` directly:

```typescript
const proc = spawn(this.config.binaryPath, args, {
  cwd: request.workspacePath,
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

This needs to change to:

```typescript
const sandbox = await sandboxManager.createSandbox({
  workspacePath: request.workspacePath,
});
const result = await sandbox.execute(this.config.binaryPath, args, { env });
await sandbox.destroy();
```

### 5.3 Subtasks

#### 5.3.1 Update ClaudeCodeDriver

Modify `packages/server/src/agent/claude-code-driver.ts`:

**Import sandbox manager:**
```typescript
import { getSandboxManager } from '../sandbox/index.js';
```

**Update execute method:**

1. Get sandbox manager instance
2. Create sandbox with workspace config
3. Execute claude binary in sandbox
4. Collect output from sandbox result
5. Destroy sandbox after completion
6. Parse output as before

**Handle sandbox unavailability:**
- If sandbox creation fails, log warning
- Fall back to direct spawn (existing behavior)
- This maintains backward compatibility

#### 5.3.2 Update ClaudeCodeSubscriptionDriver

Modify `packages/server/src/agent/claude-code-subscription-driver.ts`:

Same changes as ClaudeCodeDriver, but:
- Ensure environment filtering still works
- ANTHROPIC_API_KEY must not be in sandbox env
- Subscription credentials passed correctly

#### 5.3.3 Create Driver Configuration

Add sandbox-related driver config options:

```typescript
interface DriverConfig {
  // Existing options...

  // Sandbox options
  useSandbox?: boolean;  // Default: true
  sandboxProvider?: 'auto' | 'docker' | 'subprocess';
  sandboxResourceLimits?: Partial<ResourceLimits>;
}
```

#### 5.3.4 Update OpenAI Drivers (Optional)

For completeness, update other drivers:
- `openai-codex-driver.ts` - May not need sandbox (uses SDK)
- `opencode-driver.ts` - May not need sandbox (uses SDK)

These drivers use SDKs rather than spawning processes, so sandbox may not apply directly. Document which drivers use sandbox.

#### 5.3.5 Add Sandbox to AgentResult

Extend AgentResult with sandbox info:

```typescript
interface AgentResult {
  // Existing fields...

  // Sandbox info
  sandboxInfo?: {
    provider: string;
    containerId?: string;
    resourceUsage?: {
      cpuPercent: number;
      memoryMB: number;
    };
    durationMs: number;
  };
}
```

### 5.4 Verification Steps

1. Run agent with Docker available
2. Verify container created
3. Verify agent executes in container
4. Verify container destroyed after
5. Run agent without Docker
6. Verify falls back to subprocess
7. Check AgentResult includes sandbox info
8. All existing tests still pass

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/claude-code-driver.ts` | Modified |
| `packages/server/src/agent/claude-code-subscription-driver.ts` | Modified |
| `packages/server/src/types/agent.ts` | Modified - add sandboxInfo |

---

## Integration Flow

### Full Execution Flow with Sandbox

```
1. Driver.execute(request)
       │
       ▼
2. Get SandboxManager instance
       │
       ▼
3. SandboxManager.createSandbox({
     workspacePath: request.workspacePath,
     resourceLimits: { cpuCount: 2, memoryMB: 4096 },
     networkMode: 'none'
   })
       │
       ▼
4. DockerProvider.createSandbox()
       │
       ├─→ Pull image (if needed)
       ├─→ Create container
       └─→ Start container
       │
       ▼
5. sandbox.execute('claude', args, { env })
       │
       ├─→ Create exec in container
       ├─→ Stream stdout/stderr
       └─→ Wait for completion
       │
       ▼
6. Parse output, extract session ID, etc.
       │
       ▼
7. sandbox.destroy()
       │
       ├─→ Stop container
       └─→ Remove container
       │
       ▼
8. Return AgentResult with sandboxInfo
```

### Error Recovery

If sandbox fails at any point:

1. **Container creation fails:**
   - Log error with details
   - Fall back to subprocess
   - Continue execution

2. **Execution fails:**
   - Capture error in ExecResult
   - Still destroy sandbox
   - Return error in AgentResult

3. **Destroy fails:**
   - Log error
   - Manager will cleanup later
   - Don't block result return
