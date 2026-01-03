# Thrust 4: Execution Environment

## 4.1 Objective

Consolidate workspace, sandbox, and agent configuration into a unified `ExecutionSpec` that clearly separates WHERE work happens (workspace), HOW it's isolated (sandbox), and WHAT performs the work (agent).

---

## 4.2 Background

### Current State

Execution configuration is scattered:

```typescript
// In HarnessConfig
agentDriver?: AgentDriverConfig;     // Agent configuration

// In WorkOrder
workspaceSource: WorkspaceSource;    // Where to work
agentType: AgentType;                // Which agent

// In Environment/Config
sandboxConfig: SandboxConfig;        // Isolation settings
```

### Problems

1. **Split Configuration**: Workspace in WorkOrder, agent in HarnessConfig
2. **No Sandbox in HarnessConfig**: Sandbox is environment-level only
3. **Duplicate Agent Type**: Both `agentType` and `agentDriver`
4. **Unclear Relationships**: How does workspace relate to sandbox?

---

## 4.3 Subtasks

### 4.3.1 Define ExecutionSpec Types

**Files Created**:
- `packages/server/src/types/execution.ts` (if not already from Thrust 1)

**Specification**:

Complete type definitions for execution environment:

```typescript
// Main execution specification
interface ExecutionSpec {
  workspace: WorkspaceSpec;
  sandbox?: SandboxSpec;
  agent: AgentSpec;
}

// ═══════════════════════════════════════════════════════════════
// WORKSPACE - Where the code lives
// ═══════════════════════════════════════════════════════════════

type WorkspaceSpec =
  | LocalWorkspace
  | GitWorkspace
  | GitHubWorkspace
  | GitHubNewWorkspace
  | FreshWorkspace;

interface LocalWorkspace {
  source: 'local';
  path: string;                      // Absolute path
  readonly?: boolean;                // Prevent writes (for testing)
}

interface GitWorkspace {
  source: 'git';
  url: string;                       // Clone URL
  ref?: string;                      // Branch, tag, or commit
  depth?: number;                    // Clone depth (default: 1)
  credentials?: GitCredentials;
}

interface GitHubWorkspace {
  source: 'github';
  owner: string;
  repo: string;
  ref?: string;                      // Branch, tag, or commit
  fork?: boolean;                    // Fork before working
}

interface GitHubNewWorkspace {
  source: 'github-new';
  owner: string;
  repoName: string;
  private?: boolean;
  template?: string;                 // Template repo
  description?: string;
}

interface FreshWorkspace {
  source: 'fresh';
  destPath: string;
  template?: WorkspaceTemplate;
  projectName?: string;
}

type WorkspaceTemplate =
  | 'node-typescript'
  | 'node-javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'empty';

interface GitCredentials {
  type: 'token' | 'ssh' | 'env';
  token?: string;                    // For type: 'token'
  keyPath?: string;                  // For type: 'ssh'
  envVar?: string;                   // For type: 'env'
}

// ═══════════════════════════════════════════════════════════════
// SANDBOX - Isolation and resources
// ═══════════════════════════════════════════════════════════════

interface SandboxSpec {
  provider: SandboxProvider;
  image?: string;                    // Docker image
  resources?: ResourceSpec;
  network?: NetworkMode;
  mounts?: MountSpec[];
  environment?: Record<string, string>;
  workdir?: string;                  // Working directory in sandbox
}

type SandboxProvider = 'docker' | 'subprocess' | 'none';
type NetworkMode = 'none' | 'bridge' | 'host';

interface ResourceSpec {
  cpu?: number;                      // CPU cores
  memory?: string;                   // e.g., "4Gi", "512Mi"
  disk?: string;                     // e.g., "10Gi"
  timeout?: string;                  // e.g., "1h"
}

interface MountSpec {
  source: string;                    // Host path
  target: string;                    // Container path
  readonly?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// AGENT - What performs the work
// ═══════════════════════════════════════════════════════════════

interface AgentSpec {
  driver: AgentDriver;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: ToolSpec[];
  mcpServers?: Record<string, MCPServerSpec>;
  capabilities?: AgentCapabilities;
}

type AgentDriver =
  | 'claude-code-subscription'
  | 'claude-code-api'
  | 'claude-agent-sdk'
  | 'opencode'
  | 'openai-codex';

interface ToolSpec {
  name: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

interface MCPServerSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface AgentCapabilities {
  fileSystem?: boolean;              // Can read/write files
  network?: boolean;                 // Can make network requests
  shell?: boolean;                   // Can run shell commands
  browser?: boolean;                 // Can use browser automation
}
```

**Verification**:
- [ ] All workspace sources represented
- [ ] Sandbox configuration complete
- [ ] Agent configuration complete
- [ ] Types compile without errors

---

### 4.3.2 Create Workspace Manager

**Files Created**:
- `packages/server/src/execution/workspace-manager.ts`

**Specification**:

Manages workspace acquisition and cleanup:

```typescript
interface WorkspaceManager {
  // Acquire workspace based on spec
  acquire(spec: WorkspaceSpec): Promise<AcquiredWorkspace>;

  // Release workspace (cleanup)
  release(workspace: AcquiredWorkspace): Promise<void>;

  // Get workspace status
  status(workspace: AcquiredWorkspace): WorkspaceStatus;
}

interface AcquiredWorkspace {
  id: string;
  path: string;                      // Local path
  spec: WorkspaceSpec;
  acquiredAt: Date;
  gitInfo?: GitInfo;
}

interface GitInfo {
  remote?: string;
  branch?: string;
  commit?: string;
  clean?: boolean;
}

type WorkspaceStatus = 'active' | 'released' | 'error';

class DefaultWorkspaceManager implements WorkspaceManager {
  async acquire(spec: WorkspaceSpec): Promise<AcquiredWorkspace> {
    switch (spec.source) {
      case 'local':
        return this.acquireLocal(spec);
      case 'git':
        return this.acquireGit(spec);
      case 'github':
        return this.acquireGitHub(spec);
      case 'github-new':
        return this.acquireGitHubNew(spec);
      case 'fresh':
        return this.acquireFresh(spec);
    }
  }

  private async acquireLocal(spec: LocalWorkspace): Promise<AcquiredWorkspace> {
    // Verify path exists
    const exists = await fs.pathExists(spec.path);
    if (!exists) {
      throw new WorkspaceNotFoundError(spec.path);
    }

    // Get git info if available
    const gitInfo = await this.getGitInfo(spec.path);

    return {
      id: nanoid(),
      path: spec.path,
      spec,
      acquiredAt: new Date(),
      gitInfo,
    };
  }

  private async acquireGitHub(spec: GitHubWorkspace): Promise<AcquiredWorkspace> {
    // Clone to temp directory
    const tempDir = path.join(os.tmpdir(), 'agentgate', nanoid());
    await fs.ensureDir(tempDir);

    const url = `https://github.com/${spec.owner}/${spec.repo}.git`;
    const git = simpleGit();

    await git.clone(url, tempDir, {
      '--depth': 1,
      '--branch': spec.ref || 'main',
    });

    return {
      id: nanoid(),
      path: tempDir,
      spec,
      acquiredAt: new Date(),
      gitInfo: {
        remote: url,
        branch: spec.ref || 'main',
        commit: await this.getHeadCommit(tempDir),
      },
    };
  }

  // ... other acquire methods ...

  async release(workspace: AcquiredWorkspace): Promise<void> {
    // Only cleanup temp directories
    if (workspace.spec.source !== 'local') {
      await fs.remove(workspace.path);
    }
  }

  private async getGitInfo(path: string): Promise<GitInfo | undefined> {
    try {
      const git = simpleGit(path);
      const status = await git.status();
      const log = await git.log({ maxCount: 1 });

      return {
        branch: status.current || undefined,
        commit: log.latest?.hash,
        clean: status.isClean(),
      };
    } catch {
      return undefined;
    }
  }
}
```

**Verification**:
- [ ] Acquires local workspaces
- [ ] Clones git/github workspaces
- [ ] Creates fresh workspaces
- [ ] Cleans up temp directories

---

### 4.3.3 Create Sandbox Manager

**Files Created**:
- `packages/server/src/execution/sandbox-manager.ts`

**Specification**:

Manages sandbox creation and lifecycle:

```typescript
interface SandboxManager {
  // Create sandbox for execution
  create(spec: SandboxSpec, workspace: AcquiredWorkspace): Promise<Sandbox>;

  // Execute command in sandbox
  exec(sandbox: Sandbox, command: string): Promise<ExecResult>;

  // Destroy sandbox
  destroy(sandbox: Sandbox): Promise<void>;
}

interface Sandbox {
  id: string;
  provider: SandboxProvider;
  status: 'running' | 'stopped' | 'error';
  workspacePath: string;             // Path inside sandbox
  containerId?: string;              // For docker
  processId?: number;                // For subprocess
}

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

class DefaultSandboxManager implements SandboxManager {
  private docker?: Dockerode;

  constructor() {
    try {
      this.docker = new Dockerode();
    } catch {
      // Docker not available
    }
  }

  async create(spec: SandboxSpec, workspace: AcquiredWorkspace): Promise<Sandbox> {
    switch (spec.provider) {
      case 'docker':
        return this.createDocker(spec, workspace);
      case 'subprocess':
        return this.createSubprocess(spec, workspace);
      case 'none':
        return this.createNone(workspace);
    }
  }

  private async createDocker(
    spec: SandboxSpec,
    workspace: AcquiredWorkspace
  ): Promise<Sandbox> {
    if (!this.docker) {
      throw new DockerNotAvailableError();
    }

    const image = spec.image || 'node:20-slim';
    const workdir = spec.workdir || '/workspace';

    // Pull image if needed
    await this.pullImage(image);

    // Create container
    const container = await this.docker.createContainer({
      Image: image,
      Cmd: ['sleep', 'infinity'],
      WorkingDir: workdir,
      HostConfig: {
        Binds: [`${workspace.path}:${workdir}`],
        NetworkMode: spec.network || 'none',
        Memory: this.parseMemory(spec.resources?.memory),
        CpuCount: spec.resources?.cpu,
        // Add mounts
        ...(spec.mounts && {
          Binds: [
            `${workspace.path}:${workdir}`,
            ...spec.mounts.map(m =>
              `${m.source}:${m.target}${m.readonly ? ':ro' : ''}`
            ),
          ],
        }),
      },
      Env: Object.entries(spec.environment || {}).map(
        ([k, v]) => `${k}=${v}`
      ),
    });

    await container.start();

    return {
      id: nanoid(),
      provider: 'docker',
      status: 'running',
      workspacePath: workdir,
      containerId: container.id,
    };
  }

  private async createSubprocess(
    spec: SandboxSpec,
    workspace: AcquiredWorkspace
  ): Promise<Sandbox> {
    // Subprocess mode - less isolation but works everywhere
    return {
      id: nanoid(),
      provider: 'subprocess',
      status: 'running',
      workspacePath: workspace.path,
    };
  }

  async exec(sandbox: Sandbox, command: string): Promise<ExecResult> {
    const startTime = Date.now();

    if (sandbox.provider === 'docker' && sandbox.containerId) {
      return this.execDocker(sandbox.containerId, command, sandbox.workspacePath);
    }

    // Subprocess mode
    const result = await execa(command, {
      cwd: sandbox.workspacePath,
      shell: true,
      reject: false,
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration: Date.now() - startTime,
    };
  }

  async destroy(sandbox: Sandbox): Promise<void> {
    if (sandbox.provider === 'docker' && sandbox.containerId && this.docker) {
      const container = this.docker.getContainer(sandbox.containerId);
      await container.stop();
      await container.remove();
    }
  }

  private parseMemory(mem?: string): number | undefined {
    if (!mem) return undefined;
    const match = mem.match(/^(\d+)(Mi|Gi)$/);
    if (!match) return undefined;
    const [, num, unit] = match;
    return parseInt(num) * (unit === 'Gi' ? 1024 * 1024 * 1024 : 1024 * 1024);
  }
}
```

**Verification**:
- [ ] Creates Docker sandboxes
- [ ] Creates subprocess sandboxes
- [ ] Executes commands in sandbox
- [ ] Destroys sandboxes properly

---

### 4.3.4 Create Agent Manager

**Files Created**:
- `packages/server/src/execution/agent-manager.ts`

**Specification**:

Manages agent driver instantiation:

```typescript
interface AgentManager {
  // Create agent instance
  create(spec: AgentSpec, sandbox: Sandbox): Promise<AgentInstance>;

  // Run agent with prompt
  run(agent: AgentInstance, prompt: string): Promise<AgentRunResult>;

  // Stop agent
  stop(agent: AgentInstance): Promise<void>;
}

interface AgentInstance {
  id: string;
  driver: AgentDriver;
  status: 'ready' | 'running' | 'stopped' | 'error';
  processId?: number;
}

interface AgentRunResult {
  success: boolean;
  output: string;
  filesChanged: string[];
  tokensUsed: number;
  duration: number;
}

class DefaultAgentManager implements AgentManager {
  private driverFactories = new Map<AgentDriver, AgentDriverFactory>();

  constructor() {
    this.registerBuiltinDrivers();
  }

  private registerBuiltinDrivers(): void {
    this.driverFactories.set('claude-code-subscription',
      () => new ClaudeCodeSubscriptionDriver());
    this.driverFactories.set('claude-agent-sdk',
      () => new ClaudeAgentSDKDriver());
    this.driverFactories.set('opencode',
      () => new OpenCodeDriver());
  }

  async create(spec: AgentSpec, sandbox: Sandbox): Promise<AgentInstance> {
    const factory = this.driverFactories.get(spec.driver);
    if (!factory) {
      throw new UnknownAgentDriverError(spec.driver);
    }

    const driver = factory();
    await driver.initialize({
      model: spec.model,
      maxTokens: spec.maxTokens,
      temperature: spec.temperature,
      systemPrompt: spec.systemPrompt,
      workspacePath: sandbox.workspacePath,
    });

    return {
      id: nanoid(),
      driver: spec.driver,
      status: 'ready',
    };
  }

  async run(agent: AgentInstance, prompt: string): Promise<AgentRunResult> {
    // Implementation varies by driver
    // ...
  }

  async stop(agent: AgentInstance): Promise<void> {
    // Stop the agent process
    // ...
  }
}
```

**Verification**:
- [ ] Creates agent instances for all drivers
- [ ] Runs agents with prompts
- [ ] Stops agents properly
- [ ] Tracks tokens used

---

### 4.3.5 Create Execution Coordinator

**Files Created**:
- `packages/server/src/execution/coordinator.ts`

**Specification**:

Coordinates workspace, sandbox, and agent:

```typescript
interface ExecutionCoordinator {
  // Set up execution environment
  setup(spec: ExecutionSpec): Promise<ExecutionEnvironment>;

  // Run agent in environment
  runAgent(env: ExecutionEnvironment, prompt: string): Promise<AgentRunResult>;

  // Tear down environment
  teardown(env: ExecutionEnvironment): Promise<void>;
}

interface ExecutionEnvironment {
  id: string;
  workspace: AcquiredWorkspace;
  sandbox: Sandbox;
  agent: AgentInstance;
  status: 'active' | 'stopped' | 'error';
}

class DefaultExecutionCoordinator implements ExecutionCoordinator {
  constructor(
    private workspaceManager: WorkspaceManager,
    private sandboxManager: SandboxManager,
    private agentManager: AgentManager
  ) {}

  async setup(spec: ExecutionSpec): Promise<ExecutionEnvironment> {
    // 1. Acquire workspace
    const workspace = await this.workspaceManager.acquire(spec.workspace);

    // 2. Create sandbox
    const sandbox = await this.sandboxManager.create(
      spec.sandbox || { provider: 'subprocess' },
      workspace
    );

    // 3. Create agent
    const agent = await this.agentManager.create(spec.agent, sandbox);

    return {
      id: nanoid(),
      workspace,
      sandbox,
      agent,
      status: 'active',
    };
  }

  async runAgent(env: ExecutionEnvironment, prompt: string): Promise<AgentRunResult> {
    return this.agentManager.run(env.agent, prompt);
  }

  async teardown(env: ExecutionEnvironment): Promise<void> {
    await this.agentManager.stop(env.agent);
    await this.sandboxManager.destroy(env.sandbox);
    await this.workspaceManager.release(env.workspace);
  }
}
```

**Verification**:
- [ ] Sets up full environment
- [ ] Runs agent in environment
- [ ] Tears down cleanly

---

## 4.4 Verification Steps

```bash
# Test workspace manager
pnpm --filter @agentgate/server test -- --grep "WorkspaceManager"

# Test sandbox manager
pnpm --filter @agentgate/server test -- --grep "SandboxManager"

# Test agent manager
pnpm --filter @agentgate/server test -- --grep "AgentManager"

# Test coordinator
pnpm --filter @agentgate/server test -- --grep "ExecutionCoordinator"
```

---

## 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/types/execution.ts` | Created/Extended |
| `packages/server/src/execution/workspace-manager.ts` | Created |
| `packages/server/src/execution/sandbox-manager.ts` | Created |
| `packages/server/src/execution/agent-manager.ts` | Created |
| `packages/server/src/execution/coordinator.ts` | Created |
| `packages/server/src/execution/index.ts` | Created |
| `packages/server/test/unit/execution/` | Created (tests) |

---

## 4.6 Dependencies

- **Depends on**: Thrust 1 (ExecutionSpec types)
- **Used by**: Convergence controller (Thrust 2)
