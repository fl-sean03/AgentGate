# 00: Index - Per-Agent Container Sandboxing

## DevGuide v0.2.13

**Title:** Per-Agent Container Sandboxing
**Status:** Not Started
**Prerequisites:** v0.2.10 (Recursive Agent Spawning), v0.2.6 (Subscription Driver)

---

## Executive Summary

Implement robust, efficient, and extensible per-agent container isolation. Each agent execution spawns in its own isolated Docker container with filesystem, network, and process isolation. This eliminates the current "honor system" where agents run as subprocesses with full host access.

---

## Problem Statement

Currently, when an agent executes:
1. The agent subprocess runs with the same permissions as the AgentGate server
2. The agent has full access to the host filesystem, including secrets and SSH keys
3. No network isolation prevents data exfiltration
4. No resource limits prevent runaway processes
5. Security relies entirely on the agent "behaving" (honor system)

**Current State:**
```
AgentGate Server
       │
       └─→ spawn('claude', args, { cwd: workspacePath })
                   │
                   └─→ Full host access (files, network, processes)
```

**Target State:**
```
AgentGate Server
       │
       └─→ Docker Container (per-agent)
              ├── Filesystem: Only workspace mounted
              ├── Network: Isolated/controlled
              ├── Resources: CPU/memory limits
              └── Process: No host visibility
```

---

## Success Criteria

- [ ] Each agent run executes in its own ephemeral Docker container
- [ ] Container only has access to mounted workspace directory
- [ ] Network isolation with configurable egress rules
- [ ] Resource limits (CPU, memory) enforced per container
- [ ] Container destroyed after run completion
- [ ] Support for multiple isolation backends (Docker, gVisor, Firecracker future)
- [ ] Fallback to subprocess mode when Docker unavailable
- [ ] < 500ms container startup overhead
- [ ] All existing tests continue to pass
- [ ] Dashboard shows container status

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AgentGate Server                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Sandbox Manager                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │    │
│  │  │   Docker    │  │  Subprocess │  │      Future:            │  │    │
│  │  │  Provider   │  │  Provider   │  │  gVisor / Firecracker   │  │    │
│  │  │  (default)  │  │ (fallback)  │  │      Providers          │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘  │    │
│  └─────────┼────────────────┼───────────────────────────────────────┘    │
│            │                │                                            │
└────────────┼────────────────┼────────────────────────────────────────────┘
             │                │
             ▼                ▼
┌────────────────────┐  ┌────────────────────┐
│  Docker Container  │  │  Subprocess        │
│  ┌──────────────┐  │  │  (no isolation)    │
│  │  /workspace  │  │  │                    │
│  │  (mounted)   │  │  │                    │
│  └──────────────┘  │  │                    │
│  • Network: none   │  │                    │
│  • User: agentgate │  │                    │
│  • CPU: 2 cores    │  │                    │
│  • Memory: 4GB     │  │                    │
└────────────────────┘  └────────────────────┘
```

---

## Isolation Levels

| Level | Provider | Isolation | Performance | Use Case |
|-------|----------|-----------|-------------|----------|
| 0 | Subprocess | None | Fastest | Development, trusted agents |
| 1 | Docker | Namespace | Fast (~300ms) | Production default |
| 2 | gVisor | User-space kernel | Medium | High security |
| 3 | Firecracker | microVM | Slower (~500ms) | Maximum isolation |

This DevGuide implements Levels 0 and 1. Future DevGuides can add Levels 2-3.

---

## Thrust Overview

| # | Name | Description | Files |
|---|------|-------------|-------|
| 1 | Sandbox Provider Interface | Abstract interface for isolation backends | 3 |
| 2 | Subprocess Provider | Fallback provider (current behavior) | 2 |
| 3 | Docker Provider | Docker container-based isolation | 4 |
| 4 | Sandbox Manager | Provider selection and lifecycle | 3 |
| 5 | Driver Integration | Update drivers to use sandbox | 3 |
| 6 | Container Image | Base image for agent execution | 3 |
| 7 | Configuration & Dashboard | Settings and visibility | 4 |
| 8 | Testing & Validation | Comprehensive test coverage | 4 |

---

## File Map

### New Files

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/server/src/sandbox/types.ts` | 1 | Sandbox interfaces and types |
| `packages/server/src/sandbox/provider.ts` | 1 | Provider base class |
| `packages/server/src/sandbox/subprocess-provider.ts` | 2 | Subprocess (no isolation) provider |
| `packages/server/src/sandbox/docker-provider.ts` | 3 | Docker container provider |
| `packages/server/src/sandbox/docker-client.ts` | 3 | Docker API client |
| `packages/server/src/sandbox/manager.ts` | 4 | Sandbox manager |
| `packages/server/src/sandbox/index.ts` | 4 | Module exports |
| `docker/Dockerfile.agent` | 6 | Agent execution container image |
| `docker/agent-entrypoint.sh` | 6 | Container entrypoint script |
| `packages/server/test/sandbox/docker-provider.test.ts` | 8 | Docker provider tests |
| `packages/server/test/sandbox/manager.test.ts` | 8 | Manager tests |
| `packages/server/test/sandbox/integration.test.ts` | 8 | E2E sandbox tests |

### Modified Files

| File | Thrust | Changes |
|------|--------|---------|
| `packages/server/src/agent/claude-code-driver.ts` | 5 | Use sandbox for execution |
| `packages/server/src/agent/claude-code-subscription-driver.ts` | 5 | Use sandbox for execution |
| `packages/server/src/config/index.ts` | 7 | Add sandbox configuration |
| `packages/server/src/types/index.ts` | 1 | Export sandbox types |
| `docker-compose.yml` | 6 | Mount Docker socket option |
| `packages/dashboard/src/components/RunDetail.tsx` | 7 | Show container info |

---

## Quick Reference

### Key Types

```
SandboxProvider {
  name: string
  isAvailable(): Promise<boolean>
  createSandbox(config: SandboxConfig): Promise<Sandbox>
}

Sandbox {
  id: string
  status: 'creating' | 'running' | 'stopped' | 'destroyed'
  execute(command: string, args: string[], options: ExecOptions): Promise<ExecResult>
  writeFile(path: string, content: string): Promise<void>
  readFile(path: string): Promise<string>
  destroy(): Promise<void>
}

SandboxConfig {
  workspacePath: string
  workspaceMount: string
  image: string
  resourceLimits: ResourceLimits
  networkMode: 'none' | 'bridge' | 'host'
  env: Record<string, string>
}

ResourceLimits {
  cpuCount: number
  memoryMB: number
  diskMB: number
  timeoutSeconds: number
}
```

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AGENTGATE_SANDBOX_PROVIDER` | string | 'auto' | 'docker', 'subprocess', or 'auto' |
| `AGENTGATE_SANDBOX_IMAGE` | string | 'agentgate/agent:latest' | Docker image for agents |
| `AGENTGATE_SANDBOX_NETWORK` | string | 'none' | Container network mode |
| `AGENTGATE_SANDBOX_CPU_LIMIT` | number | 2 | CPU cores per container |
| `AGENTGATE_SANDBOX_MEMORY_MB` | number | 4096 | Memory limit per container |
| `AGENTGATE_SANDBOX_TIMEOUT` | number | 3600 | Container timeout in seconds |

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Current state, target architecture, design decisions |
| [02-provider-interface.md](./02-provider-interface.md) | Thrusts 1-2: Provider interface and subprocess fallback |
| [03-docker-provider.md](./03-docker-provider.md) | Thrust 3: Docker container implementation |
| [04-integration.md](./04-integration.md) | Thrusts 4-5: Manager and driver integration |
| [05-container-image.md](./05-container-image.md) | Thrust 6: Agent container image |
| [06-config-dashboard.md](./06-config-dashboard.md) | Thrust 7: Configuration and dashboard |
| [07-testing.md](./07-testing.md) | Thrust 8: Testing strategy |
| [08-appendices.md](./08-appendices.md) | Checklists, troubleshooting, references |

---

## Dependencies

- Docker Engine 20.10+ (for container provider)
- Docker SDK for Node.js (`dockerode` package)
- Existing subprocess infrastructure (for fallback)

---

## Security Considerations

1. **Docker Socket Access**: AgentGate server needs Docker socket access
2. **Privileged Mode**: NOT required - use unprivileged containers
3. **User Namespace**: Run containers as non-root user
4. **Seccomp Profile**: Use default Docker seccomp profile
5. **Capability Dropping**: Drop all unnecessary capabilities
6. **Read-only Filesystem**: Workspace is the only writable location
