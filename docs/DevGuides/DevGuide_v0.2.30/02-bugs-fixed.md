# DevGuide v0.2.30: Bugs Fixed

## Bug #1: Date Field Mismatch in Iteration Data

### Severity: Critical (blocking execution)
### Status: Fixed
### Location: `src/orchestrator/run-store.ts:109-121`

### Problem

The execution engine was saving iteration data with field names `startTime` and `endTime`, but the run store was expecting `startedAt` and `completedAt`. This caused iterations to have `Invalid Date` values when persisted.

### Root Cause

The engine and store were developed independently with different naming conventions:
- Engine: camelCase time fields (`startTime`, `endTime`)
- Store: `*At` convention (`startedAt`, `completedAt`)

### Symptoms

```json
{
  "iteration": 1,
  "startedAt": "Invalid Date",
  "completedAt": "Invalid Date"
}
```

### Fix

Added backward compatibility in `run-store.ts` to check both field naming conventions:

```typescript
// Check both field naming conventions
const startTimeRaw = (data['startedAt'] as string) ?? (data['startTime'] as string);
const endTimeRaw = (data['completedAt'] as string) ?? (data['endTime'] as string);

return {
  number: data['number'] as number,
  status: data['status'] as string,
  startedAt: startTimeRaw ? new Date(startTimeRaw) : new Date(),
  completedAt: endTimeRaw ? new Date(endTimeRaw) : undefined,
  // ...
};
```

### Verification

- Submitted work order via API
- Checked iteration data in response
- Confirmed valid timestamps

---

## Bug #2: harnessProfile Not Persisted via API

### Severity: Critical (blocking execution)
### Status: Fixed
### Locations:
- `src/control-plane/work-order-service.ts`
- `src/control-plane/work-order-store.ts`

### Problem

When submitting a work order via the API with a `harness.profile` field, the profile name was not being saved or loaded correctly. The orchestrator would default to `default.yaml` instead of the specified profile.

### Root Cause

1. `work-order-service.ts` wasn't extracting `harnessProfile` from request body
2. `work-order-store.ts` wasn't serializing/deserializing the `harnessProfile` field

### Symptoms

- Submitted work order with `harness.profile: "agentgate-subprocess"`
- GET work order returned without `harnessProfile` field
- Run used default harness instead of specified one

### Fix

**work-order-service.ts:**
```typescript
async submit(data: {
  taskPrompt: string;
  workspaceSource: WorkspaceSource;
  maxIterations?: number;
  gate?: GatePlan;
  harness?: {
    profile?: string;
  };
}): Promise<WorkOrder> {
  const workOrder: WorkOrder = {
    id: generateId(),
    // ...
    harnessProfile: data.harness?.profile,
  };
  // ...
}
```

**work-order-store.ts:**
```typescript
private serialize(workOrder: WorkOrder): Record<string, unknown> {
  return {
    // ...
    harnessProfile: workOrder.harnessProfile,
  };
}

private deserialize(data: Record<string, unknown>): WorkOrder {
  return {
    // ...
    harnessProfile: data['harnessProfile'] as string | undefined,
  };
}
```

### Verification

```bash
# Submit work order
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -d '{"harness": {"profile": "agentgate-subprocess"}, ...}'

# Verify saved
curl http://localhost:3001/api/v1/work-orders/{id}
# Response includes: "harnessProfile": "agentgate-subprocess"
```

---

## Bug #3: L3 Large-Files False Positive on .pnpm-store

### Severity: High (causes verification failure)
### Status: Fixed
### Location: `src/verifier/l3-sanity.ts:118-128`

### Problem

The L3 sanity check was flagging files in `.pnpm-store` as unexpectedly large files, causing verification to warn or fail on projects using pnpm.

### Root Cause

The `checkLargeFiles` function only excluded `node_modules`, `.git`, `dist`, and `build` directories. Package manager caches like `.pnpm-store` can contain very large tar/tgz files (100MB+).

### Symptoms

```
L3 verification: Warning - Found 5 large file(s)
- .pnpm-store/v10/files/03/9288d8... (136.3MB)
- .pnpm-store/v10/files/0a/e5a243... (15.8MB)
```

### Fix

Added package manager cache directories to the ignore list:

```typescript
const files = await fg('**/*', {
  cwd: workDir,
  dot: true,
  onlyFiles: true,
  ignore: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    // Package manager caches (v0.2.30)
    '**/.pnpm-store/**',
    '**/.yarn/**',
    '**/.cache/**',
    '**/coverage/**',
  ],
});
```

### Verification

- Ran work order on AgentGate repository (uses pnpm)
- L3 verification passed: "No unexpectedly large files found"

---

## Bug #7: executionLimits.maxMemoryMb Not Passed to Docker

### Severity: Critical (causes OOM kills)
### Status: Fixed
### Location: `src/orchestrator/orchestrator.ts:377-395`

### Problem

When using Docker sandbox with a harness profile that specifies `executionLimits.maxMemoryMb`, the memory limit was not being passed to the Docker container. This caused OOM kills (exit code 137) when agents needed more than the default 2GB.

### Root Cause

The orchestrator only checked `agentDriver.sandbox.memoryMB` but most harness profiles use `executionLimits.maxMemoryMb` instead.

### Symptoms

```
Run failed with exit code 137
Docker logs: "Container killed by OOM"
```

Harness config:
```yaml
executionLimits:
  maxMemoryMb: 4096  # This was being ignored!
```

### Fix

Added fallback to check `executionLimits.maxMemoryMb`:

```typescript
// Build resource limits from both agentDriver.sandbox and executionLimits (v0.2.30)
const resourceLimits: import('../sandbox/index.js').ResourceLimits = {};
if (harnessSandbox?.cpuCount) resourceLimits.cpuCount = harnessSandbox.cpuCount;

// v0.2.30: Use executionLimits.maxMemoryMb as fallback/override for sandbox memory
const memoryMB = executionLimits?.maxMemoryMb ?? harnessSandbox?.memoryMB;
if (memoryMB) resourceLimits.memoryMB = memoryMB;

if (harnessSandbox?.timeoutSeconds) resourceLimits.timeoutSeconds = harnessSandbox.timeoutSeconds;
if (Object.keys(resourceLimits).length > 0) {
  sandboxConfig.resourceLimits = resourceLimits;
}
```

### Verification

- Submitted work order with `agentgate-dev.yaml` profile (Docker, 4GB)
- Run completed successfully (exit code 0)
- Docker container had correct memory limit

---

## Identified But Not Fixed

### Bug #4: Run Stuck in "building" State on Crash

**Problem:** If server crashes during run initialization, the run remains in "building" state forever.

**Impact:** Medium - requires manual cleanup

**Solution Options:**
1. WAL-based recovery on startup
2. Timeout-based cleanup (mark as failed after X minutes)
3. Health check endpoint that detects orphans

### Bug #5: CLI `serve` Command Exits Immediately

**Problem:** Running `agentgate serve` starts the server but the process exits immediately.

**Impact:** Medium - can't use CLI for long-running server

**Workaround:** Use direct import:
```javascript
node -e "import('./dist/server/index.js').then(async (m) => {
  const app = m.createApp();
  await app.listen({ port: 3001 });
  console.log('Server running');
})"
```

**Solution Options:**
1. Add explicit keep-alive loop
2. Use proper server.listen callback pattern
3. Handle SIGINT/SIGTERM for graceful shutdown

### Bug #6: No Workspace Path Validation at Submit

**Problem:** The API accepts work orders with nonexistent workspace paths.

**Impact:** Low - run fails at execution time with clear error

**Solution:**
1. Add path existence check in `work-order-service.ts`
2. Return 400 BAD_REQUEST for invalid paths
3. Provide clear error message

---

## Bug Discovery Timeline

| Time | Bug | How Discovered |
|------|-----|----------------|
| Session start | #1 Date fields | Iteration data showed "Invalid Date" |
| First run | #2 harnessProfile | GET work order missing profile |
| Subprocess run | #3 L3 large-files | Verification warned about .pnpm-store |
| Docker run | #7 Memory limits | Exit code 137 (OOM killed) |
| Server restart | #5 CLI lifecycle | Process exited immediately |
| Manual check | #4 Orphan runs | Found stuck "building" run |
| API testing | #6 Path validation | Submitted nonexistent path |

---

## Lessons Learned

1. **Consistent naming conventions** prevent integration bugs
2. **Config mapping is error-prone** - document the flow explicitly
3. **Package managers need special handling** in file checks
4. **Test with real sandbox providers** not just mocks
5. **CLI process lifecycle** requires explicit handling in Node.js
