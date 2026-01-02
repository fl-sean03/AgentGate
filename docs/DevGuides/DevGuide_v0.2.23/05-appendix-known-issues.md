# 05 - Appendix: Known Issues & Mitigations

## Overview

This appendix documents known issues discovered during development and testing, along with their mitigations.

---

## Issue 1: Sandbox Cleanup Race Condition (FIXED)

**Status**: Fixed
**Severity**: CRITICAL
**Discovered**: 2026-01-02

### Problem

Periodic cleanup (every 5 minutes) was destroying active sandboxes mid-execution, causing all running Claude Code processes to terminate with `exitCode: -1` (SIGKILL).

### Root Cause

The `cleanup()` method in `provider.ts` destroyed ALL sandboxes regardless of whether they were actively executing commands.

```typescript
// Before fix: destroys everything
async cleanup(): Promise<void> {
  for (const sandbox of this.activeSandboxes.values()) {
    await sandbox.destroy();  // Kills active processes!
  }
}
```

### Fix Applied

Added `isExecuting` flag to track active sandboxes. Cleanup now skips sandboxes that are executing.

**Files Modified:**
- `packages/server/src/sandbox/types.ts` - Added `isExecuting?: boolean` to Sandbox interface
- `packages/server/src/sandbox/subprocess-provider.ts` - Track `_isExecuting` state during execute()
- `packages/server/src/sandbox/provider.ts` - Skip executing sandboxes in cleanup()

```typescript
// After fix: skips executing sandboxes
async cleanup(): Promise<void> {
  for (const sandbox of this.activeSandboxes.values()) {
    if (sandbox.isExecuting) {
      this.logger.debug({ sandboxId: sandbox.id }, 'Skipping executing sandbox');
      continue;
    }
    await sandbox.destroy();
  }
}
```

### Verification

- [x] Work orders no longer fail with exitCode: -1 after 5 minutes
- [x] Cleanup still removes idle sandboxes
- [x] Executing sandboxes are preserved

---

## Issue 2: OOM Crash from Concurrent Work Orders

**Status**: Mitigated (requires configuration)
**Severity**: CRITICAL
**Discovered**: 2026-01-02

### Problem

Submitting and triggering 8 work orders simultaneously caused WSL to crash due to Out of Memory (OOM) killer activation.

### Root Cause

Each Claude Code instance uses approximately 1GB RAM. With 8 instances running simultaneously plus git clone operations and server overhead, the system exceeded 15GB RAM + 4GB swap.

**Evidence from dmesg:**
```
Free swap = 0kB
Total swap = 4194304kB
oom-kill:constraint=CONSTRAINT_NONE
Out of memory: Killed process [pid] (claude)
```

### Mitigation Applied

1. **Reduced `maxConcurrentRuns`** from 5 to 2:
   ```bash
   # In .env
   AGENTGATE_MAX_CONCURRENT_RUNS=2
   ```

2. **Staggered work order triggers** - Wait 60 seconds between triggering each work order to allow memory to stabilize.

3. **Memory requirements documented**:

| Concurrent Runs | Minimum RAM | Recommended RAM |
|-----------------|-------------|-----------------|
| 1 | 4GB | 6GB |
| 2 | 8GB | 10GB |
| 3 | 12GB | 14GB |
| 5 | 20GB | 24GB |
| 8 | 32GB | 40GB |

### Permanent Fix (Planned in v0.2.23 Wave 2.1)

Auto-queue processing will include:
- Memory-aware scheduling (check available RAM before starting)
- Configurable delay between work order starts
- Health check before starting new work orders
- Backpressure when memory is low

---

## Issue 3: Sandbox Provider Not Respecting Config

**Status**: Fixed
**Severity**: HIGH
**Discovered**: 2026-01-02

### Problem

Setting `AGENTGATE_SANDBOX_PROVIDER=subprocess` in `.env` was ignored. The server continued using Docker provider.

### Root Cause

`getSandboxManager()` was being called without config, so the singleton was initialized with defaults before the actual config was loaded.

```typescript
// Problem: called without config
const manager = getSandboxManager();  // Uses default (docker)

// Later, config is loaded but ignored
const config = buildSandboxManagerConfig();  // Too late!
```

### Fix Applied

Initialize sandbox manager with config at server startup:

**File: `packages/server/src/control-plane/commands/serve.ts`**

```typescript
// Fix: initialize with config
const sandboxConfig = buildSandboxManagerConfig();
const sandboxManager = getSandboxManager(sandboxConfig);
await sandboxManager.initialize();
```

### Verification

- [x] Set `AGENTGATE_SANDBOX_PROVIDER=subprocess` in .env
- [x] Health endpoint shows `provider: subprocess`
- [x] Work orders execute without Docker

---

## Issue 4: Type Errors in Test Files

**Status**: Fixed
**Severity**: LOW
**Discovered**: 2026-01-02

### Problem

Several type errors existed in test files and some source files.

### Files Fixed

1. **`simplified-strategy-factory.ts`**: Changed exhaustive check pattern
   ```typescript
   // Before
   const _exhaustive: never = strategy;

   // After
   throw new Error(`Unknown strategy: ${strategy as string}`);
   ```

2. **`workspace-facade.ts`**: Added null coalescing for optional boolean
   ```typescript
   // Before
   if (config.someOptionalBool) ...

   // After
   if (config.someOptionalBool ?? false) ...
   ```

3. **Contract/E2E test helpers**: Fixed workspace source type handling

---

## Issue 5: Work Order Status "building" vs "running"

**Status**: Documented (behavior is correct)
**Severity**: LOW

### Observation

Work orders show "building" status briefly before "running".

### Explanation

This is expected behavior:
- `building`: Sandbox is being created (container starting, git clone, etc.)
- `running`: Agent is actively executing

The `building` state typically lasts 10-30 seconds depending on:
- Repository size
- Network speed
- Container startup time

### No Fix Needed

This is informative status, not a bug.

---

## Issue 6: API Key Exposure in Logs

**Status**: Mitigated
**Severity**: MEDIUM

### Problem

GitHub token was potentially visible in log output during workspace acquisition.

### Mitigation

1. Token is now masked in logs: `ghp_xxx...xxx`
2. Debug-level logging reduced for sensitive operations

### Best Practices

- Never commit `.env` files
- Use environment variables for production
- Rotate tokens periodically
- Limit token permissions to minimum required

---

## Monitoring Recommendations

### Memory Monitoring

```bash
# Watch memory during work order execution
watch -n 5 'free -h'

# Or use the health endpoint
curl http://localhost:3001/api/v1/queue/health
```

### Process Monitoring

```bash
# Watch Claude Code processes
watch -n 5 'ps aux | grep claude | head -20'

# Count running agents
pgrep -c claude
```

### Log Monitoring

```bash
# Follow server logs
tail -f ~/.agentgate/logs/server.log | grep -E '(ERROR|WARN|work-order)'
```

---

## Emergency Procedures

### OOM Prevention

If system is running low on memory:

```bash
# 1. Check current state
curl http://localhost:3001/api/v1/queue/health

# 2. Stop accepting new work
# (No endpoint yet, restart with --no-auto-process)

# 3. Wait for running work orders to complete
# Or force kill if needed:
curl -X POST http://localhost:3001/api/v1/work-orders/<id>/kill?force=true
```

### Server Recovery

If server crashes:

```bash
# 1. Check for corrupted files
ls ~/.agentgate/work-orders/.quarantine/

# 2. Check for orphaned processes
pgrep -a claude

# 3. Kill any orphaned processes
pkill -9 claude

# 4. Restart server
agentgate serve --api-key $API_KEY --max-concurrent 2
```

### Work Order Recovery

If work orders are stuck:

```bash
# 1. Check status
curl http://localhost:3001/api/v1/work-orders | jq '.[] | select(.status == "running")'

# 2. Check for stale (running but no process)
# Compare running work orders to actual processes

# 3. Force fail stuck work orders
curl -X POST http://localhost:3001/api/v1/work-orders/<id>/kill?force=true
```
