# DevGuide v0.2.30: Overview

## Dogfooding Architecture

### The Self-Improvement Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    Dogfooding Loop                           │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Find Bug │ -> │ Create   │ -> │ Submit   │              │
│  │          │    │ Work     │    │ via API  │              │
│  └──────────┘    │ Order    │    └────┬─────┘              │
│       ▲          └──────────┘         │                     │
│       │                               ▼                     │
│       │          ┌──────────┐    ┌──────────┐              │
│       │          │ Document │ <- │ Agent    │              │
│       └──────────│ in Guide │    │ Fixes    │              │
│                  └──────────┘    │ Code     │              │
│                       ▲          └────┬─────┘              │
│                       │               │                     │
│                       │          ┌────▼─────┐              │
│                       └──────────│ Verify   │              │
│                                  │ Gates    │              │
│                                  └──────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### Component Interactions

```
┌────────────────────────────────────────────────────────────────┐
│                        Client (curl/API)                        │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  HTTP Server (Fastify)                                         │
│  └── /api/v1/work-orders                                       │
│      └── work-order-service.ts                                 │
│          └── work-order-store.ts (persistence)                 │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Orchestrator                                                   │
│  └── Loads harness profile                                     │
│      └── executionLimits.maxMemoryMb                          │
│  └── Creates sandbox config                                    │
│      └── resourceLimits.memoryMB                              │
│  └── Instantiates driver                                       │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Sandbox Provider (Docker/Subprocess)                          │
│  └── Docker: Creates container with memory limit               │
│  └── Subprocess: Spawns process in workspace                   │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Agent Driver (Claude Code Subscription)                       │
│  └── Executes task prompt                                      │
│  └── Makes code changes                                        │
│  └── Returns exit code                                         │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Verifier (L0-L3)                                              │
│  └── L0: Contracts (files, patterns)                          │
│  └── L1: Tests                                                 │
│  └── L2: Blackbox                                              │
│  └── L3: Sanity (debug artifacts, large files, etc.)          │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Run Store                                                      │
│  └── Persists iteration data                                   │
│      └── startedAt/completedAt (fixed field names)            │
│  └── Saves verification results                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Harness Profile System

### Profile Hierarchy

```
~/.agentgate/harnesses/agentgate-subprocess.yaml
                 │
                 ▼
        ┌────────────────┐
        │ loopStrategy   │ → mode, maxIterations
        │ agentDriver    │ → type, model
        │ verification   │ → skipLevels, timeoutMs
        │ executionLimits│ → maxMemoryMb, maxConcurrentAgents
        │ sandbox        │ → provider, memoryMB (optional)
        └────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │ Orchestrator   │ → Reads harness config
        │                │ → Maps executionLimits to sandbox
        │                │ → Creates SandboxConfig
        └────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │ Docker Provider│ → Uses resourceLimits.memoryMB
        │                │ → Falls back to 2048 if not set
        └────────────────┘
```

### Bug #7 Analysis: Memory Limit Not Passed

**Before Fix:**
```typescript
// orchestrator.ts - Only checked agentDriver.sandbox.memoryMB
if (harnessSandbox.memoryMB) resourceLimits.memoryMB = harnessSandbox.memoryMB;
```

**After Fix:**
```typescript
// orchestrator.ts - Also checks executionLimits.maxMemoryMb
const memoryMB = executionLimits?.maxMemoryMb ?? harnessSandbox?.memoryMB;
if (memoryMB) resourceLimits.memoryMB = memoryMB;
```

---

## Date Field Compatibility

### Bug #1 Analysis: Field Name Mismatch

**Engine saves:**
```json
{
  "startTime": "2026-01-04T16:00:00.000Z",
  "endTime": "2026-01-04T16:05:00.000Z"
}
```

**Store expected:**
```typescript
startedAt: new Date(data['startedAt']),  // undefined!
completedAt: new Date(data['completedAt'])  // undefined!
```

**Fix:**
```typescript
// Check both field naming conventions
const startTimeRaw = (data['startedAt'] as string) ?? (data['startTime'] as string);
const endTimeRaw = (data['completedAt'] as string) ?? (data['endTime'] as string);
```

---

## L3 Verification Analysis

### Large Files Check

**Problem:** Package manager caches contain large files

```
.pnpm-store/v10/files/03/9288d8...  (136.3MB)
.pnpm-store/v10/files/0a/e5a243...  (15.8MB)
.pnpm-store/v10/files/2b/d700ef...  (49.1MB)
```

**Solution:** Exclude package manager directories

```typescript
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
```

---

## Testing Strategy

### Unit Tests vs Dogfooding

| Aspect | Unit Tests | Dogfooding |
|--------|------------|------------|
| Coverage | Individual functions | End-to-end flows |
| Speed | Fast (seconds) | Slow (minutes) |
| Isolation | Mocked dependencies | Real dependencies |
| Discovery | Known edge cases | Unknown edge cases |
| Confidence | Code works | System works |

### Dogfooding Advantages

1. **Real Integration** - Tests actual API, not mocks
2. **Config Validation** - Harness profiles actually work
3. **Error Discovery** - Finds errors unit tests miss
4. **Documentation** - Creates real usage examples
5. **Confidence** - If it works for us, it works for users

---

## Remaining Issues

### Issue #4: Orphan Runs

**Problem:** If server crashes during run initialization, run stays in "building" state forever.

**Solution Options:**
1. WAL-based recovery on startup
2. Timeout-based cleanup
3. Health check that detects orphans

### Issue #5: CLI Process Lifecycle

**Problem:** `agentgate serve` starts server but process exits immediately.

**Analysis:** The CLI command returns after starting the server but doesn't keep the process alive.

**Solution Options:**
1. Add explicit keep-alive loop
2. Use proper server.listen callback pattern
3. Handle SIGINT/SIGTERM for graceful shutdown

### Issue #6: Workspace Path Validation

**Problem:** API accepts invalid workspace paths without validation.

**Solution:**
1. Add path existence check in work-order-service.ts
2. Return 400 BAD_REQUEST for invalid paths
3. Provide clear error message

---

## Next Version Planning

### v0.2.31 Candidates

1. **Orphan run recovery** - Most impactful for reliability
2. **CLI lifecycle fix** - Needed for production CLI usage
3. **Path validation** - Quick win for API quality
4. **GitHub source testing** - Validates full workflow
5. **Rate limiting** - Production readiness

### Success Metrics

- [ ] All 7 identified bugs fixed
- [ ] 100% of API endpoints tested via dogfooding
- [ ] Both sandbox providers working
- [ ] GitHub workflow tested
- [ ] Automated dogfooding test suite created
