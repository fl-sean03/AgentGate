# 05: Container Image

## Thrust 6: Agent Container Image

### 6.1 Objective

Create a minimal, secure Docker image optimized for agent execution.

### 6.2 Background

The agent container needs:
- Node.js runtime (for Claude Code CLI)
- Git (for repository operations)
- Common build tools (for running tests/builds)
- Minimal attack surface
- Non-root user
- Fast startup

### 6.3 Subtasks

#### 6.3.1 Create Dockerfile

Create `docker/Dockerfile.agent`:

**Multi-stage build:**

Stage 1: Builder
- Use node:20-alpine as base
- Install build dependencies
- Install Claude Code CLI globally

Stage 2: Runtime
- Use node:20-alpine as base
- Copy Node.js and npm from builder
- Install runtime dependencies only
- Create agentgate user (UID 1000)
- Set up workspace directory
- Copy entrypoint script

**Runtime dependencies:**
- git (repository operations)
- curl (health checks, API calls)
- bash (shell scripts)
- python3 (many projects need it)
- jq (JSON processing)

**Size optimization:**
- Use Alpine Linux (~5MB base)
- Multi-stage build to exclude dev dependencies
- Clean up package caches
- No unnecessary tools

#### 6.3.2 Create Entrypoint Script

Create `docker/agent-entrypoint.sh`:

**Initialization:**
1. Validate workspace mount exists
2. Set correct permissions on workspace
3. Configure git (safe.directory)
4. Set up shell environment

**Keep-alive mode:**
- If no command provided, run `sleep infinity`
- This keeps container running for exec commands

**Command mode:**
- If command provided, execute directly
- Forward signals for graceful shutdown

#### 6.3.3 Configure Claude Code in Container

Claude Code CLI requirements:
- Node.js 18+ (using 20)
- Git for repository operations
- Home directory for config
- Credentials if using subscription

**Credentials handling:**
- Mount credentials file if subscription mode
- Path: ~/.claude/.credentials.json
- Read-only mount for security

**Settings:**
- Disable telemetry in container
- Set non-interactive mode
- Configure output format

#### 6.3.4 Add Health Check

Container health check:
- Check Node.js is working
- Check Claude CLI is available
- Check workspace is mounted
- Return healthy/unhealthy status

#### 6.3.5 Document Build Process

Create build instructions:
- How to build image locally
- How to publish to registry
- Version tagging strategy
- Multi-arch support (amd64, arm64)

### 6.4 Verification Steps

1. Build image: `docker build -f docker/Dockerfile.agent -t agentgate/agent:dev .`
2. Run container: `docker run --rm -it agentgate/agent:dev bash`
3. Verify Node.js: `node --version` (should be 20.x)
4. Verify Claude CLI: `claude --version`
5. Verify git: `git --version`
6. Check user: `whoami` (should be agentgate)
7. Check workspace: `ls /workspace` (should exist)
8. Exit and verify container removed

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `docker/Dockerfile.agent` | Created |
| `docker/agent-entrypoint.sh` | Created |
| `.dockerignore` | Modified - add patterns |
| `docker-compose.yml` | Modified - add agent service |

---

## Dockerfile Reference

### Base Image Selection

| Option | Size | Pros | Cons |
|--------|------|------|------|
| alpine | ~5MB | Minimal, fast | musl libc issues |
| slim | ~80MB | glibc, stable | Larger |
| full | ~900MB | Everything included | Too large |

**Decision:** Alpine with known workarounds for musl issues.

### Layer Optimization

Order layers by change frequency:
1. Base image (rare changes)
2. System packages (occasional)
3. Node.js setup (occasional)
4. Claude CLI install (frequent)
5. Entrypoint (frequent)

This maximizes cache reuse.

### Security Hardening

**User setup:**
- Create `agentgate` user with UID 1000
- No sudo access
- Home directory at /home/agentgate
- Shell is /bin/bash

**Filesystem:**
- Minimal installed packages
- No package manager cache
- Read-only rootfs compatible
- /workspace is only writable mount

**Capabilities:**
- Designed to run with all caps dropped
- No setuid binaries needed
- No privileged operations

---

## docker-compose.yml Updates

Add agent image build configuration:

```yaml
services:
  # ... existing services ...

  # Agent image builder (for development)
  agent-builder:
    build:
      context: .
      dockerfile: docker/Dockerfile.agent
    image: agentgate/agent:dev
    # Not run directly - just for building
    profiles:
      - build
```

Add sandbox configuration to server:

```yaml
  server:
    # ... existing config ...
    volumes:
      # ... existing volumes ...
      # Docker socket for sandbox (optional)
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      # ... existing env ...
      - AGENTGATE_SANDBOX_PROVIDER=auto
      - AGENTGATE_SANDBOX_IMAGE=agentgate/agent:latest
```

---

## Multi-Architecture Support

Build for multiple architectures:

```bash
# Set up buildx
docker buildx create --use

# Build multi-arch
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f docker/Dockerfile.agent \
  -t agentgate/agent:latest \
  --push \
  .
```

### Architecture Considerations

- **amd64**: Standard x86-64, most common
- **arm64**: Apple Silicon, AWS Graviton
- Node.js native modules may need platform-specific builds
- Test on both architectures before release

---

## Image Versioning

**Tagging strategy:**
- `agentgate/agent:latest` - Current stable
- `agentgate/agent:v0.2.13` - Version-specific
- `agentgate/agent:dev` - Development builds
- `agentgate/agent:sha-abc123` - Commit-specific

**Update process:**
1. Build with commit SHA tag
2. Test thoroughly
3. Tag as version
4. Tag as latest if stable
