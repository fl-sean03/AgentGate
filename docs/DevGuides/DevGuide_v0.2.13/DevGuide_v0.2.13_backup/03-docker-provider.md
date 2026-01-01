# 03: Docker Provider

## Thrust 3: Docker Container Provider

### 3.1 Objective

Implement Docker container-based isolation provider with full namespace and cgroup isolation.

### 3.2 Background

Docker provides robust isolation through:
- Linux namespaces for filesystem, network, PID isolation
- cgroups for resource limits
- Seccomp for syscall filtering
- Capabilities for permission control

The Docker provider uses the `dockerode` library to interact with the Docker daemon.

### 3.3 Subtasks

#### 3.3.1 Add dockerode Dependency

Add Docker SDK to packages/server/package.json:
- `dockerode`: Docker API client
- `@types/dockerode`: TypeScript types

#### 3.3.2 Create Docker Client Wrapper

Create `packages/server/src/sandbox/docker-client.ts`:

**DockerClient class:**
- Singleton pattern for Docker connection
- Connection to Docker socket (default: /var/run/docker.sock)
- Connection health check
- Container operations wrapper

**Methods:**
- `isAvailable(): Promise<boolean>` - Ping Docker daemon
- `pullImage(image: string): Promise<void>` - Pull image if not present
- `createContainer(options: ContainerCreateOptions): Promise<Container>`
- `startContainer(id: string): Promise<void>`
- `execInContainer(id: string, cmd: string[]): Promise<ExecResult>`
- `stopContainer(id: string, timeout?: number): Promise<void>`
- `removeContainer(id: string): Promise<void>`
- `getContainerStats(id: string): Promise<ContainerStats>`

#### 3.3.3 Create DockerProvider Class

Create `packages/server/src/sandbox/docker-provider.ts`:

**Implement SandboxProvider interface:**

- `name`: Return 'docker'
- `isAvailable()`:
  - Check Docker daemon is reachable
  - Verify Docker version >= 20.10
  - Return false if Docker unavailable
- `createSandbox(config: SandboxConfig)`:
  - Pull image if not present
  - Create container with configuration
  - Start container
  - Return DockerSandbox instance
- `listSandboxes()`: List containers with agentgate label
- `cleanup()`: Remove orphaned containers

#### 3.3.4 Create DockerSandbox Class

**Implement Sandbox interface:**

**Container Creation Options:**
- `Image`: From config.image
- `Cmd`: Entrypoint to keep container running (e.g., `sleep infinity`)
- `WorkingDir`: /workspace
- `User`: 'agentgate' (UID 1000)
- `HostConfig.Binds`: Mount workspace to /workspace
- `HostConfig.NetworkMode`: From config.networkMode
- `HostConfig.Memory`: From config.resourceLimits.memoryMB * 1024 * 1024
- `HostConfig.NanoCpus`: From config.resourceLimits.cpuCount * 1e9
- `HostConfig.ReadonlyRootfs`: true
- `HostConfig.SecurityOpt`: ['no-new-privileges']
- `HostConfig.CapDrop`: ['ALL']
- `Labels`: { 'agentgate.sandbox': 'true', 'agentgate.run-id': runId }

**Methods:**

`execute(command: string, args: string[], options?: ExecOptions)`:
- Create exec instance in container
- Attach to stdout/stderr
- Start exec
- Collect output with size limits
- Handle timeout via AbortController
- Return ExecResult

`writeFile(path: string, content: string)`:
- Validate path is within /workspace
- Use container exec to write file
- Alternative: Use Docker copy API

`readFile(path: string)`:
- Validate path is within /workspace
- Use container exec to cat file
- Alternative: Use Docker copy API

`destroy()`:
- Stop container with timeout
- Remove container
- Update status to 'destroyed'

`getStats()`:
- Get container stats from Docker API
- Return CPU usage, memory usage, network I/O

#### 3.3.5 Implement Container Exec

Container exec is the core operation:

1. Create exec instance:
   - Cmd: [command, ...args]
   - AttachStdout: true
   - AttachStderr: true
   - Env: from options.env
   - WorkingDir: options.cwd or /workspace

2. Start exec and attach streams:
   - Demultiplex stdout/stderr from Docker stream
   - Collect output into buffers
   - Apply size limits (e.g., 10MB max)

3. Wait for completion:
   - Poll exec inspect for ExitCode
   - Handle timeout
   - Return result

#### 3.3.6 Handle Container Lifecycle Events

Implement lifecycle management:

- Track container creation time
- Set container labels for identification
- Handle Docker events (die, kill, oom)
- Auto-cleanup containers older than timeout
- Log lifecycle events

### 3.4 Verification Steps

1. Docker daemon is running
2. Create DockerProvider instance
3. Verify `isAvailable()` returns true
4. Create sandbox with test config
5. Execute `echo test` in container
6. Verify output is "test"
7. Execute command that writes file
8. Read file back, verify content
9. Destroy sandbox
10. Verify container is removed

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/sandbox/docker-client.ts` | Created |
| `packages/server/src/sandbox/docker-provider.ts` | Created |
| `packages/server/src/sandbox/index.ts` | Modified - export provider |
| `packages/server/package.json` | Modified - add dockerode |

---

## Container Configuration Reference

### Security Settings

```
HostConfig: {
  // Network isolation
  NetworkMode: 'none',

  // Filesystem isolation
  ReadonlyRootfs: true,
  Binds: ['/host/workspace:/workspace:rw'],

  // Resource limits
  Memory: 4 * 1024 * 1024 * 1024,  // 4GB
  NanoCpus: 2 * 1e9,               // 2 CPUs
  PidsLimit: 256,                   // Max processes

  // Security hardening
  SecurityOpt: ['no-new-privileges'],
  CapDrop: ['ALL'],

  // User mapping
  // Container user 'agentgate' (1000) maps to host user
}
```

### Writable Directories

Even with read-only rootfs, these paths are writable:
- `/workspace` - Mounted workspace
- `/tmp` - Temporary files (tmpfs)
- `/home/agentgate` - User home (tmpfs)

### Environment Variables Passed

```
NODE_ENV=production
HOME=/home/agentgate
USER=agentgate
WORKSPACE=/workspace
NO_COLOR=1
FORCE_COLOR=0
```

---

## Error Handling

### Docker Connection Errors

- **Docker not installed**: isAvailable() returns false, fallback to subprocess
- **Docker not running**: isAvailable() returns false, fallback to subprocess
- **Permission denied**: Log error, suggest adding user to docker group
- **Socket not found**: Log error with socket path

### Container Errors

- **Image not found**: Pull image automatically
- **Pull failed**: Log error, return meaningful message
- **Container create failed**: Log full error, cleanup partial resources
- **Container start failed**: Remove container, return error
- **OOM killed**: Detect via container events, report in result

### Exec Errors

- **Command not found**: Return in ExecResult with exit code 127
- **Permission denied**: Return in ExecResult with exit code 126
- **Timeout**: Kill exec, return with timedOut=true

---

## Performance Optimizations

### Image Pre-pulling

On server startup:
1. Check if agent image exists locally
2. Pull in background if missing
3. Log progress for visibility

### Container Reuse (Future)

For same work order, could reuse container:
1. Keep container running between iterations
2. Clean workspace between uses
3. Destroy on work order completion

### Parallel Container Creation

When creating multiple sandboxes:
1. Create containers in parallel
2. Use Promise.all for batch operations
3. Limit concurrency to prevent Docker overload
