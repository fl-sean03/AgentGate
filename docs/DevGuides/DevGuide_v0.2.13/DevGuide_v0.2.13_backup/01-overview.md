# 01: Overview - Per-Agent Container Sandboxing

## Current State Analysis

### How Agents Execute Today

The current implementation spawns agents as direct subprocesses:

**claude-code-subscription-driver.ts (lines 234-239):**
```
spawn(this.config.binaryPath, args, {
  cwd: request.workspacePath,
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

This approach has fundamental security limitations:

| Risk | Impact | Current Mitigation |
|------|--------|-------------------|
| Filesystem access | Agent can read ~/.ssh, ~/.env, etc. | None (honor system) |
| Network access | Agent can exfiltrate data | None |
| Process visibility | Agent can see other processes | None |
| Resource exhaustion | Runaway process can crash system | Timeout only |
| Secrets exposure | Agent can read ANTHROPIC_API_KEY from memory | Partial (env filtering) |

### What Docker Provides

Docker containers offer namespace-based isolation:

| Namespace | Isolation |
|-----------|-----------|
| `mnt` | Filesystem - only see mounted volumes |
| `net` | Network - isolated network stack |
| `pid` | Process - only see container processes |
| `user` | User - map container root to unprivileged host user |
| `uts` | Hostname - isolated hostname |
| `ipc` | IPC - isolated shared memory |

Plus resource limits via cgroups:
- CPU shares/quota
- Memory limits
- Disk I/O throttling
- Process count limits

---

## Target Architecture

### Provider Pattern

The sandbox system uses a provider pattern for flexibility:

```
                    ┌─────────────────────┐
                    │   SandboxManager    │
                    │                     │
                    │ • selectProvider()  │
                    │ • createSandbox()   │
                    │ • cleanup()         │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ DockerProvider  │ │SubprocessProvider│ │ Future:        │
│                 │ │                 │ │ gVisor/FC      │
│ • Docker API    │ │ • spawn()       │ │                │
│ • Container     │ │ • No isolation  │ │                │
│   lifecycle     │ │                 │ │                │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Container Lifecycle

```
1. AGENT REQUEST RECEIVED
       │
       ▼
2. SandboxManager.createSandbox(config)
       │
       ├─→ Check provider availability
       ├─→ Pull image if needed
       ├─→ Create container
       ├─→ Start container
       └─→ Return Sandbox handle
       │
       ▼
3. Driver executes via Sandbox
       │
       ├─→ sandbox.execute('claude', args)
       ├─→ Stream stdout/stderr
       └─→ Collect exit code
       │
       ▼
4. sandbox.destroy()
       │
       ├─→ Stop container
       ├─→ Remove container
       └─→ Cleanup volumes
```

---

## Design Decisions

### Decision 1: Docker as Default Provider

**Options Considered:**
1. Docker containers (namespace isolation)
2. gVisor (user-space kernel)
3. Firecracker microVMs
4. nsjail (lightweight sandboxing)

**Decision:** Docker containers as default, with subprocess fallback.

**Rationale:**
- Docker is ubiquitous and well-understood
- ~300ms startup is acceptable for agent runs (typically minutes-long)
- Provides sufficient isolation for most use cases
- gVisor/Firecracker can be added later for high-security environments
- Subprocess fallback ensures functionality without Docker

### Decision 2: One Container Per Run

**Options Considered:**
1. Persistent container pool
2. Container per work order
3. Container per run (iteration)

**Decision:** One container per run.

**Rationale:**
- Clean slate for each iteration
- No state leakage between runs
- Simpler lifecycle management
- Memory limits reset between runs
- Workspace mounted fresh each time

### Decision 3: Network Mode "none" by Default

**Options Considered:**
1. `none` - No network access
2. `bridge` - Isolated network with egress
3. `host` - Full network access

**Decision:** `none` by default, configurable.

**Rationale:**
- Maximum security: no exfiltration possible
- Claude Code can work offline for most tasks
- Web search/fetch disabled without network
- Can be relaxed per-workspace if needed

### Decision 4: Non-root Container User

**Options Considered:**
1. Run as root inside container
2. Run as dedicated user (agentgate)
3. Use user namespaces

**Decision:** Run as dedicated `agentgate` user (UID 1000).

**Rationale:**
- Defense in depth
- Matches typical host user permissions
- Workspace files have correct ownership
- No privileged operations possible

### Decision 5: Workspace as Bind Mount

**Options Considered:**
1. Copy workspace into container
2. Bind mount workspace
3. Named volume with sync

**Decision:** Bind mount the workspace directory.

**Rationale:**
- Zero-copy, immediate availability
- Changes visible in real-time
- No cleanup of copied data
- Existing workspace management unchanged

---

## Performance Considerations

### Container Startup Overhead

| Operation | Time |
|-----------|------|
| Image pull (first time) | 10-60s |
| Image pull (cached) | 0s |
| Container create | ~50ms |
| Container start | ~200ms |
| Network setup (none) | ~10ms |
| Mount workspace | ~20ms |
| **Total (cached image)** | **~300ms** |

### Mitigation Strategies

1. **Pre-pull images** on server startup
2. **Lazy container destruction** with short grace period
3. **Container reuse** within same work order (future optimization)
4. **Image layer caching** via Docker build cache

---

## Security Model

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Malicious agent reads secrets | Filesystem isolation - only workspace mounted |
| Agent exfiltrates code | Network mode "none" - no egress |
| Agent escapes to host | User namespaces, seccomp, capabilities dropped |
| Resource exhaustion | cgroups limits on CPU/memory |
| Container escape | Docker security defaults, unprivileged container |

### What Sandbox Does NOT Protect Against

1. **Malicious code in workspace** - Agent can execute anything in workspace
2. **Mounted secrets** - If workspace contains secrets, agent can read them
3. **Network-dependent tasks** - Some agent tasks require network access
4. **Docker daemon compromise** - Full host access if Docker is compromised

---

## Integration Points

### With Existing Drivers

Drivers will be updated to use the sandbox:

**Before (subprocess):**
```
spawn('claude', args, { cwd: workspace, env })
```

**After (sandbox):**
```
const sandbox = await manager.createSandbox({ workspacePath });
const result = await sandbox.execute('claude', args, { env });
await sandbox.destroy();
```

### With CI Feedback Loop (v0.2.12)

The sandbox integrates with CI feedback:
- Each CI remediation iteration gets a fresh container
- Previous iteration's side effects are discarded
- Clean environment prevents accumulated issues

### With Recursive Spawning (v0.2.10)

Child agents spawn in their own containers:
- Parent container cannot access child container
- Resource limits enforced per-child
- Complete isolation between siblings

---

## Extensibility

### Adding New Providers

The provider interface allows adding new backends:

```
interface SandboxProvider {
  name: string
  isAvailable(): Promise<boolean>
  createSandbox(config: SandboxConfig): Promise<Sandbox>
}
```

Future providers might include:
- **gVisor** - User-space kernel for syscall filtering
- **Firecracker** - microVM for hardware-level isolation
- **E2B** - Cloud sandbox service integration
- **Modal** - Serverless container execution
- **Fly Machines** - Global edge execution

### Plugin Architecture

The manager can load providers dynamically:

```
manager.registerProvider(new GVisorProvider());
manager.registerProvider(new FirecrackerProvider());
```

---

## References

- [Docker Sandboxes - Docker Docs](https://docs.docker.com/ai/sandboxes)
- [Claude Code Sandboxing - Claude Docs](https://code.claude.com/docs/en/sandboxing)
- [Making Containers More Isolated - Unit42](https://unit42.paloaltonetworks.com/making-containers-more-isolated-an-overview-of-sandboxed-container-technologies/)
- [E2B Sandbox Architecture](https://github.com/e2b-dev/E2B)
