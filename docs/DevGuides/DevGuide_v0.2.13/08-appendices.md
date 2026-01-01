# 08: Appendices

## Master Checklist

### Thrust 1: Sandbox Provider Interface
- [ ] Create `packages/server/src/sandbox/types.ts`
- [ ] Define SandboxConfig interface
- [ ] Define ResourceLimits interface
- [ ] Define SandboxStatus type
- [ ] Define ExecOptions interface
- [ ] Define ExecResult interface
- [ ] Define Sandbox interface
- [ ] Define SandboxProvider interface
- [ ] Create `packages/server/src/sandbox/provider.ts`
- [ ] Create `packages/server/src/sandbox/index.ts`
- [ ] Export types from `packages/server/src/types/index.ts`
- [ ] Verify compilation passes

### Thrust 2: Subprocess Provider
- [ ] Create `packages/server/src/sandbox/subprocess-provider.ts`
- [ ] Implement SubprocessProvider class
- [ ] Implement SubprocessSandbox class
- [ ] Implement execute() method
- [ ] Implement writeFile() method
- [ ] Implement readFile() method
- [ ] Implement destroy() method
- [ ] Add path validation
- [ ] Add process tracking
- [ ] Export from index

### Thrust 3: Docker Provider
- [ ] Add dockerode to package.json
- [ ] Create `packages/server/src/sandbox/docker-client.ts`
- [ ] Implement Docker connection handling
- [ ] Create `packages/server/src/sandbox/docker-provider.ts`
- [ ] Implement DockerProvider class
- [ ] Implement DockerSandbox class
- [ ] Implement container creation
- [ ] Implement container exec
- [ ] Implement stream handling
- [ ] Implement cleanup
- [ ] Export from index

### Thrust 4: Sandbox Manager
- [ ] Create `packages/server/src/sandbox/manager.ts`
- [ ] Implement provider registration
- [ ] Implement auto-detection
- [ ] Implement sandbox tracking
- [ ] Implement cleanup
- [ ] Implement status reporting
- [ ] Create singleton export
- [ ] Add shutdown hook

### Thrust 5: Driver Integration
- [ ] Update ClaudeCodeDriver
- [ ] Update ClaudeCodeSubscriptionDriver
- [ ] Add sandbox fallback logic
- [ ] Add sandboxInfo to AgentResult
- [ ] Update type definitions
- [ ] Maintain backward compatibility

### Thrust 6: Container Image
- [ ] Create `docker/Dockerfile.agent`
- [ ] Create `docker/agent-entrypoint.sh`
- [ ] Configure Node.js and Claude CLI
- [ ] Create agentgate user
- [ ] Add health check
- [ ] Update .dockerignore
- [ ] Test build on amd64
- [ ] Test build on arm64

### Thrust 7: Configuration & Dashboard
- [ ] Add config schema fields
- [ ] Add environment variable mapping
- [ ] Update .env.example
- [ ] Add sandbox to health endpoint
- [ ] Add sandbox to run API
- [ ] Update RunDetail component
- [ ] Add SystemStatus component (optional)

### Thrust 8: Testing
- [ ] Create type tests
- [ ] Create subprocess provider tests
- [ ] Create docker provider tests
- [ ] Create manager tests
- [ ] Create driver integration tests
- [ ] Create E2E tests
- [ ] Create security tests
- [ ] Verify CI configuration

---

## Troubleshooting Guide

### Docker Issues

#### "Cannot connect to Docker daemon"

**Symptoms:**
- isAvailable() returns false
- Error: "connect ENOENT /var/run/docker.sock"

**Solutions:**
1. Start Docker: `sudo systemctl start docker`
2. Check socket permissions: `ls -la /var/run/docker.sock`
3. Add user to docker group: `sudo usermod -aG docker $USER`
4. Log out and back in

#### "Permission denied on workspace"

**Symptoms:**
- Container can't write to /workspace
- Permission denied errors

**Solutions:**
1. Check workspace ownership matches container user (UID 1000)
2. Use `:z` or `:Z` suffix for SELinux systems
3. Run container as root (not recommended)

#### "Container OOM killed"

**Symptoms:**
- Container exits with code 137
- Memory limit exceeded

**Solutions:**
1. Increase AGENTGATE_SANDBOX_MEMORY_MB
2. Check for memory leaks in agent
3. Monitor memory usage during execution

### Subprocess Issues

#### "Command not found in container"

**Symptoms:**
- exec returns exit code 127
- Error: "claude: not found"

**Solutions:**
1. Verify agent image includes claude CLI
2. Check PATH in container
3. Use full path to binary

#### "Timeout exceeded"

**Symptoms:**
- timedOut: true in result
- Agent takes too long

**Solutions:**
1. Increase AGENTGATE_SANDBOX_TIMEOUT
2. Check if agent is stuck
3. Review agent task complexity

---

## Security Considerations

### What Sandboxing Protects Against

| Threat | Docker | Subprocess |
|--------|--------|------------|
| Reading host files | ✓ Blocked | ✗ Not blocked |
| Writing host files | ✓ Blocked | ✗ Not blocked |
| Network exfiltration | ✓ Blocked (mode=none) | ✗ Not blocked |
| Process snooping | ✓ Blocked | ✗ Not blocked |
| Resource exhaustion | ✓ Limited | ✗ Not limited |

### What Sandboxing Does NOT Protect Against

1. **Malicious code in workspace** - Agent can execute anything there
2. **Mounted credentials** - If you mount ~/.claude, agent can read it
3. **Docker escape vulnerabilities** - Rare but possible
4. **Denial of service** - Can still use allowed resources heavily

### Security Best Practices

1. **Use network mode "none"** unless absolutely needed
2. **Don't mount sensitive directories** into workspace
3. **Review workspace contents** before agent execution
4. **Monitor container resource usage**
5. **Keep Docker updated** for security patches
6. **Use read-only mounts** where possible

---

## Performance Benchmarks

### Container Startup (Docker Desktop, M1 Mac)

| Operation | Time |
|-----------|------|
| Pull image (first) | 15-30s |
| Pull image (cached) | 0ms |
| Create container | 50ms |
| Start container | 180ms |
| First exec | 50ms |
| **Total (cached)** | **~280ms** |

### Execution Overhead

| Scenario | Subprocess | Docker | Overhead |
|----------|------------|--------|----------|
| echo "test" | 5ms | 50ms | +45ms |
| node script | 100ms | 150ms | +50ms |
| Full agent run | 30s | 30.3s | +1% |

### Memory Overhead

| Component | Memory |
|-----------|--------|
| Container runtime | ~20MB |
| Node.js baseline | ~50MB |
| Agent idle | ~100MB |
| **Overhead** | **~70MB** |

---

## References

### Docker Documentation
- [Docker SDK for Node.js](https://github.com/apocas/dockerode)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Container Resource Constraints](https://docs.docker.com/config/containers/resource_constraints/)

### Agent Sandboxing
- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Docker Sandboxes](https://docs.docker.com/ai/sandboxes)
- [E2B Sandbox](https://github.com/e2b-dev/E2B)

### Security Research
- [Container Isolation Technologies](https://unit42.paloaltonetworks.com/making-containers-more-isolated-an-overview-of-sandboxed-container-technologies/)
- [gVisor Architecture](https://gvisor.dev/docs/architecture_guide/)
- [Firecracker Design](https://firecracker-microvm.github.io/)

---

## Future Enhancements

### gVisor Provider (v0.2.14+)

Add gVisor for stronger syscall isolation:
- User-space kernel intercepts syscalls
- Better protection against kernel exploits
- Slight performance overhead

### Firecracker Provider (v0.3.x)

Add microVM support for maximum isolation:
- Hardware-level isolation
- Separate kernel per sandbox
- Suitable for multi-tenant deployments

### E2B Cloud Integration (v0.3.x)

Add cloud sandbox option:
- No local Docker required
- Scales automatically
- Pay-per-use pricing

### Container Pool (Optimization)

Reuse containers within work order:
- Keep container running between iterations
- Reduce startup overhead
- Clean workspace between uses
