# 06: Configuration & Dashboard

## Thrust 7: Configuration & Dashboard Integration

### 7.1 Objective

Add sandbox configuration to the config system and integrate sandbox visibility into the dashboard.

### 7.2 Background

Operators need to:
- Configure sandbox behavior via environment variables
- See which provider is active
- Monitor container status for running agents
- Debug sandbox issues

### 7.3 Subtasks

#### 7.3.1 Update Configuration Schema

Modify `packages/server/src/config/index.ts`:

**Add sandbox configuration fields:**

```typescript
// Sandbox configuration
sandboxProvider: z.enum(['auto', 'docker', 'subprocess']).default('auto'),
sandboxImage: z.string().default('agentgate/agent:latest'),
sandboxNetworkMode: z.enum(['none', 'bridge', 'host']).default('none'),
sandboxCpuLimit: z.coerce.number().min(0.5).max(16).default(2),
sandboxMemoryMB: z.coerce.number().min(256).max(32768).default(4096),
sandboxTimeoutSeconds: z.coerce.number().min(60).max(86400).default(3600),
sandboxAutoCleanupMinutes: z.coerce.number().min(1).max(60).default(5),
```

**Add environment variable mapping:**
- `AGENTGATE_SANDBOX_PROVIDER`
- `AGENTGATE_SANDBOX_IMAGE`
- `AGENTGATE_SANDBOX_NETWORK`
- `AGENTGATE_SANDBOX_CPU_LIMIT`
- `AGENTGATE_SANDBOX_MEMORY_MB`
- `AGENTGATE_SANDBOX_TIMEOUT`
- `AGENTGATE_SANDBOX_AUTO_CLEANUP_MINUTES`

#### 7.3.2 Update .env.example

Add sandbox configuration examples:

```bash
# =============================================================================
# Sandbox Configuration
# =============================================================================

# Sandbox provider: 'auto', 'docker', or 'subprocess'
# 'auto' uses Docker if available, falls back to subprocess
AGENTGATE_SANDBOX_PROVIDER=auto

# Docker image for agent containers
AGENTGATE_SANDBOX_IMAGE=agentgate/agent:latest

# Container network mode: 'none', 'bridge', or 'host'
# 'none' provides maximum isolation (no network access)
AGENTGATE_SANDBOX_NETWORK=none

# Resource limits per container
AGENTGATE_SANDBOX_CPU_LIMIT=2
AGENTGATE_SANDBOX_MEMORY_MB=4096
AGENTGATE_SANDBOX_TIMEOUT=3600

# Cleanup orphaned containers every N minutes
AGENTGATE_SANDBOX_AUTO_CLEANUP_MINUTES=5
```

#### 7.3.3 Add Sandbox Status to Health Endpoint

Modify `packages/server/src/server/routes/health.ts`:

**Add sandbox status to health response:**

```typescript
{
  status: 'healthy',
  components: {
    // Existing components...
    sandbox: {
      status: 'healthy',
      provider: 'docker',
      dockerAvailable: true,
      activeSandboxes: 3,
      lastCleanup: '2025-12-31T12:00:00Z'
    }
  }
}
```

**Implementation:**
- Import sandbox manager
- Get status from manager
- Include in health response
- Handle errors gracefully

#### 7.3.4 Add Sandbox Info to Run API

Modify run-related API responses to include sandbox info:

**Run detail response:**
```typescript
{
  id: 'run-123',
  // ... existing fields ...
  sandbox: {
    provider: 'docker',
    containerId: 'abc123def456',
    status: 'running',
    resourceUsage: {
      cpuPercent: 45.2,
      memoryMB: 1234
    },
    createdAt: '2025-12-31T12:00:00Z'
  }
}
```

#### 7.3.5 Update Dashboard - RunDetail Component

Modify `packages/dashboard/src/components/RunDetail.tsx`:

**Add sandbox information section:**
- Show provider type (Docker/Subprocess)
- Show container ID (if Docker)
- Show resource usage
- Show container status

**Visual indicators:**
- Container icon for Docker
- Terminal icon for subprocess
- Resource usage bars
- Status badge

#### 7.3.6 Update Dashboard - System Status

Add sandbox status to system overview:

**Show in dashboard header or sidebar:**
- Active sandboxes count
- Provider in use
- Docker availability

### 7.4 Verification Steps

1. Set environment variables for sandbox config
2. Start server, verify config loaded correctly
3. Check `/health` endpoint includes sandbox status
4. Create work order with auto-execute
5. Verify run detail API includes sandbox info
6. Open dashboard, verify sandbox info displayed
7. Verify resource usage updates during execution

### 7.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/config/index.ts` | Modified |
| `.env.example` | Modified |
| `packages/server/src/server/routes/health.ts` | Modified |
| `packages/server/src/server/routes/runs.ts` | Modified |
| `packages/dashboard/src/components/RunDetail.tsx` | Modified |
| `packages/dashboard/src/components/SystemStatus.tsx` | Created (optional) |

---

## Configuration Reference

### Provider Selection Logic

```
AGENTGATE_SANDBOX_PROVIDER
         │
         ▼
┌─────────────────────────────────────────┐
│ 'docker'  → Use Docker, fail if unavailable
│ 'subprocess' → Use subprocess, no isolation
│ 'auto' (default) → Logic below
└─────────────────────────────────────────┘
         │
         ▼ (auto mode)
┌─────────────────────────────────────────┐
│ 1. Check Docker daemon reachable         │
│ 2. If yes → Use Docker                   │
│ 3. If no  → Fall back to subprocess      │
│ 4. Log which provider selected           │
└─────────────────────────────────────────┘
```

### Network Mode Implications

| Mode | Access | Use Case |
|------|--------|----------|
| `none` | No network | Maximum security, most tasks |
| `bridge` | Isolated network | Tasks needing web access |
| `host` | Full network | Development, debugging |

**Warning:** `host` mode should only be used in trusted environments.

### Resource Limit Guidelines

| Workload | CPU | Memory | Timeout |
|----------|-----|--------|---------|
| Simple tasks | 1 | 1024MB | 300s |
| Standard | 2 | 4096MB | 3600s |
| Heavy builds | 4 | 8192MB | 7200s |
| ML/Data | 8 | 16384MB | 14400s |

---

## Dashboard UI Mockup

### Run Detail - Sandbox Section

```
┌─────────────────────────────────────────────────────────────┐
│ Sandbox                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Provider: 🐳 Docker                                        │
│  Container: abc123def456                                    │
│  Status: ● Running                                          │
│                                                             │
│  Resource Usage                                             │
│  CPU:    ████████░░░░░░░░  45%                             │
│  Memory: ██████░░░░░░░░░░  1.2 GB / 4 GB                   │
│                                                             │
│  Network: 🔒 Isolated (none)                                │
│  Started: 2 minutes ago                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### System Status Widget

```
┌─────────────────────────────────────┐
│ Sandbox Status                      │
├─────────────────────────────────────┤
│ Provider: Docker ✓                  │
│ Active:   3 containers              │
│ Image:    agentgate/agent:latest    │
└─────────────────────────────────────┘
```
