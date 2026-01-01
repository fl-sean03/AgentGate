# 02: Provider Interface & Subprocess Provider

## Thrust 1: Sandbox Provider Interface

### 1.1 Objective

Define abstract interfaces for sandbox providers, enabling pluggable isolation backends.

### 1.2 Background

The provider pattern allows different isolation technologies while maintaining a consistent API. Each provider implements the same interface, making them interchangeable.

### 1.3 Subtasks

#### 1.3.1 Create Sandbox Types Module

Create `packages/server/src/sandbox/types.ts` with:

**SandboxConfig** - Configuration for creating a sandbox:
- `workspacePath`: Host path to workspace directory
- `workspaceMount`: Path inside container (default: `/workspace`)
- `image`: Container image to use
- `resourceLimits`: CPU, memory, disk, timeout limits
- `networkMode`: 'none', 'bridge', or 'host'
- `env`: Environment variables to pass
- `user`: User to run as inside container

**ResourceLimits** - Resource constraints:
- `cpuCount`: Number of CPU cores
- `memoryMB`: Memory limit in megabytes
- `diskMB`: Disk space limit (optional)
- `timeoutSeconds`: Maximum execution time

**SandboxStatus** - Lifecycle states:
- `creating`: Container being created
- `running`: Container is running
- `stopped`: Container stopped normally
- `destroyed`: Container removed
- `error`: Container failed

**ExecOptions** - Execution options:
- `env`: Additional environment variables
- `cwd`: Working directory inside sandbox
- `timeout`: Command-specific timeout
- `stdin`: Input to provide

**ExecResult** - Execution result:
- `exitCode`: Process exit code
- `stdout`: Standard output
- `stderr`: Standard error
- `timedOut`: Whether execution timed out
- `durationMs`: Execution duration

#### 1.3.2 Create Sandbox Interface

Define the `Sandbox` interface representing an active sandbox:

- `id: string` - Unique identifier
- `status: SandboxStatus` - Current status
- `containerId?: string` - Docker container ID (if applicable)
- `execute(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>`
- `writeFile(path: string, content: string): Promise<void>`
- `readFile(path: string): Promise<string>`
- `listFiles(path: string): Promise<string[]>`
- `destroy(): Promise<void>`
- `getStats(): Promise<SandboxStats>` - Resource usage

#### 1.3.3 Create SandboxProvider Interface

Define the provider interface:

- `name: string` - Provider identifier (e.g., 'docker', 'subprocess')
- `isAvailable(): Promise<boolean>` - Check if provider can be used
- `createSandbox(config: SandboxConfig): Promise<Sandbox>`
- `listSandboxes(): Promise<Sandbox[]>` - List active sandboxes
- `cleanup(): Promise<void>` - Clean up orphaned resources

#### 1.3.4 Create Provider Base Class

Create `packages/server/src/sandbox/provider.ts` with:

- Abstract base class implementing common functionality
- Default resource limits
- Logging setup
- Error handling utilities

### 1.4 Verification Steps

1. Run `pnpm build` - compilation succeeds
2. All types are exported from `packages/server/src/sandbox/index.ts`
3. Types can be imported in other modules
4. No circular dependencies

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/sandbox/types.ts` | Created |
| `packages/server/src/sandbox/provider.ts` | Created |
| `packages/server/src/sandbox/index.ts` | Created |
| `packages/server/src/types/index.ts` | Modified - export sandbox types |

---

## Thrust 2: Subprocess Provider

### 2.1 Objective

Implement a subprocess-based provider that maintains current behavior, serving as fallback when Docker is unavailable.

### 2.2 Background

The subprocess provider wraps the existing `spawn()` logic in the provider interface. This ensures:
- Backward compatibility
- Development mode without Docker
- Graceful fallback in production

### 2.3 Subtasks

#### 2.3.1 Create SubprocessProvider Class

Create `packages/server/src/sandbox/subprocess-provider.ts`:

Implement `SandboxProvider` interface:
- `name`: Return 'subprocess'
- `isAvailable()`: Always return true (Node.js is always available)
- `createSandbox()`: Return a SubprocessSandbox instance
- `listSandboxes()`: Return active subprocess sandboxes
- `cleanup()`: Kill orphaned processes

#### 2.3.2 Create SubprocessSandbox Class

Implement `Sandbox` interface:

- `id`: Generate unique ID
- `status`: Track lifecycle state
- `execute()`: Use `spawn()` with configured options
  - Set `cwd` to workspace path
  - Pass environment variables
  - Handle timeout via setTimeout
  - Collect stdout/stderr
  - Return ExecResult
- `writeFile()`: Use `fs.writeFile` with path validation
- `readFile()`: Use `fs.readFile` with path validation
- `destroy()`: Kill process if running, update status

#### 2.3.3 Add Path Validation

Implement workspace path validation:
- Ensure all file operations stay within workspace
- Reject paths with `..` that escape workspace
- Normalize paths before operations

#### 2.3.4 Add Process Management

Track spawned processes:
- Store process references by sandbox ID
- Kill processes on sandbox destroy
- Clean up on server shutdown

### 2.4 Verification Steps

1. Create SubprocessProvider instance
2. Verify `isAvailable()` returns true
3. Create sandbox with mock config
4. Execute simple command (e.g., `echo test`)
5. Verify output matches expected
6. Destroy sandbox
7. Verify process is killed

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/sandbox/subprocess-provider.ts` | Created |
| `packages/server/src/sandbox/index.ts` | Modified - export provider |

---

## Test Cases for Thrust 1-2

### Unit Tests

1. **Types compile correctly**
   - All interfaces can be implemented
   - Type guards work as expected

2. **SubprocessProvider availability**
   - isAvailable() returns true
   - createSandbox() returns valid sandbox

3. **SubprocessSandbox execution**
   - execute() runs command
   - stdout captured correctly
   - stderr captured correctly
   - exit code returned
   - timeout works

4. **File operations**
   - writeFile creates file in workspace
   - readFile reads file content
   - Path traversal blocked

5. **Lifecycle management**
   - destroy() kills process
   - Status updates correctly

### Integration Tests

1. **Real command execution**
   - Run `node -e "console.log('test')"`
   - Verify output is "test"

2. **Error handling**
   - Run invalid command
   - Verify error captured

3. **Timeout handling**
   - Run `sleep 10` with 1s timeout
   - Verify timedOut is true
