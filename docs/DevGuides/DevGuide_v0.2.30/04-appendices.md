# DevGuide v0.2.30: Appendices

## Appendix A: File Map

### Files Modified

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `src/orchestrator/run-store.ts` | 109-121 | Date field backward compatibility |
| `src/control-plane/work-order-service.ts` | ~50-80 | harnessProfile in submit() |
| `src/control-plane/work-order-store.ts` | ~30-60 | Serialize/deserialize harnessProfile |
| `src/verifier/l3-sanity.ts` | 118-128 | Package manager cache exclusions |
| `src/orchestrator/orchestrator.ts` | 377-395 | executionLimits.maxMemoryMb passthrough |

### Key File Relationships

```
work-order-service.ts
        │
        ├──► work-order-store.ts (persistence)
        │
        └──► orchestrator.ts (execution)
                    │
                    ├──► harness-loader.ts (config)
                    │
                    ├──► sandbox-provider.ts (Docker/Subprocess)
                    │
                    └──► run-store.ts (iteration data)
                              │
                              └──► verifier (L0-L3)
                                        │
                                        └──► l3-sanity.ts
```

### Harness Profile Locations

```
~/.agentgate/
└── harnesses/
    ├── default.yaml           # Default harness
    ├── agentgate-subprocess.yaml  # Subprocess, 8GB
    └── agentgate-dev.yaml     # Docker, 4GB
```

---

## Appendix B: Configuration Reference

### Harness Profile Schema

```yaml
# ~/.agentgate/harnesses/agentgate-subprocess.yaml
loopStrategy:
  mode: simple
  maxIterations: 3

agentDriver:
  type: claude-code-subscription
  model: claude-sonnet-4-20250514
  # Optional sandbox override
  sandbox:
    provider: subprocess
    memoryMB: 8192

verification:
  skipLevels: []
  timeoutMs: 300000

executionLimits:
  maxMemoryMb: 8192        # Primary memory limit
  maxConcurrentAgents: 1
```

### Memory Limit Resolution Order

1. `executionLimits.maxMemoryMb` (preferred)
2. `agentDriver.sandbox.memoryMB` (legacy)
3. Default: 2048 MB

### Work Order API Schema

```typescript
interface WorkOrderRequest {
  taskPrompt: string;              // Required
  workspaceSource: {
    type: 'local' | 'github';
    path?: string;                 // For local
    repo?: string;                 // For github
    branch?: string;               // For github
  };
  harness?: {
    profile?: string;              // Profile name
  };
  maxIterations?: number;          // Default: 3
  gate?: GatePlan;                 // Optional gate config
}
```

---

## Appendix C: Command Reference

### API Commands

```bash
# Health check
curl http://localhost:3001/health

# Submit work order
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -d @work-order.json

# Get work order
curl http://localhost:3001/api/v1/work-orders/{id}

# Create run
curl -X POST http://localhost:3001/api/v1/work-orders/{id}/runs

# Get run
curl http://localhost:3001/api/v1/runs/{runId}

# List runs
curl http://localhost:3001/api/v1/runs
```

### Server Commands

```bash
# Start server (direct import - working)
node -e "import('./dist/server/index.js').then(async (m) => {
  const app = m.createApp();
  await app.listen({ port: 3001, host: '0.0.0.0' });
})"

# Start server (CLI - broken, exits immediately)
npx agentgate serve --port 3001
```

### Build Commands

```bash
# Build TypeScript
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

---

## Appendix D: Error Codes

### Exit Codes

| Code | Meaning | Common Cause |
|------|---------|--------------|
| 0 | Success | Normal completion |
| 1 | General error | Agent error, verification failed |
| 137 | SIGKILL | OOM killed (Docker) |
| 143 | SIGTERM | Graceful shutdown |

### Run States

| State | Description | Terminal? |
|-------|-------------|-----------|
| QUEUED | Waiting to start | No |
| LEASED | Claimed by worker | No |
| BUILDING | Setting up workspace | No |
| SNAPSHOTTING | Creating checkpoint | No |
| VERIFYING | Running verification | No |
| FEEDBACK | Processing verification | No |
| SUCCEEDED | Completed successfully | Yes |
| FAILED | Completed with errors | Yes |
| CANCELED | Manually canceled | Yes |
| INTERRUPTED | Saved during shutdown | No |

---

## Appendix E: Troubleshooting

### Server Won't Start

**Symptom:** CLI `serve` exits immediately

**Solution:** Use direct import method:
```javascript
node -e "import('./dist/server/index.js').then(..."
```

### Run Stuck in Building

**Symptom:** Run stays in "building" state

**Solution:** Manually update run state or restart server
```sql
-- If using SQLite
UPDATE runs SET status = 'failed' WHERE status = 'building';
```

### Docker OOM

**Symptom:** Exit code 137

**Check:**
1. Verify harness has `executionLimits.maxMemoryMb`
2. Check Docker daemon memory limit
3. Increase memory in harness profile

### L3 False Positive

**Symptom:** L3 warns about large files in cache directories

**Solution:** Files should now be excluded. If not, check ignore patterns in `l3-sanity.ts`

### harnessProfile Not Saved

**Symptom:** GET work order missing `harnessProfile`

**Check:** Ensure using v0.2.30+ with fix for Bug #2

---

## Appendix F: Verification Checklist

### Pre-Commit

- [ ] `pnpm test` passes
- [ ] `pnpm lint` clean
- [ ] `pnpm typecheck` clean
- [ ] `pnpm build` succeeds
- [ ] Dist files updated

### Pre-Release

- [ ] All bugs documented
- [ ] DevGuide completed
- [ ] API endpoints tested
- [ ] Both sandbox providers tested
- [ ] Harness profiles validated
- [ ] Memory limits verified

### Dogfooding Session

- [ ] Server started successfully
- [ ] Work order submitted
- [ ] Run created
- [ ] Run completed
- [ ] Verification passed
- [ ] Results documented

---

## Appendix G: Quick Reference

### Key Paths

```
packages/server/src/           # Source code
packages/server/dist/          # Compiled JS
packages/server/test/          # Tests
~/.agentgate/harnesses/        # Harness profiles
~/.agentgate/data/            # Run data
```

### Important Functions

```typescript
// Submit work order
workOrderService.submit(data)

// Create run
workOrderService.createRun(workOrderId)

// Start execution
orchestrator.processWorkOrder(workOrder)

// Run verification
verifier.verify(ctx)
```

### Log Locations

```
~/.agentgate/logs/            # Application logs
Docker container logs          # docker logs <container>
```

---

## Appendix H: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.2.30-alpha | 2026-01-04 | Dogfooding | Initial session |
| 0.2.30-beta | TBD | | GitHub source testing |
| 0.2.30 | TBD | | Release candidate |
