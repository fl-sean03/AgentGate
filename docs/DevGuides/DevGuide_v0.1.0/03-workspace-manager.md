# Module B: Workspace Manager

## Purpose

Create, manage, and protect workspaces where agents operate. The workspace manager ensures containment, enforces policies, and provides git integration.

---

## Thrust 5: Workspace Lifecycle

### 5.1 Objective

Implement workspace creation, initialization, and cleanup with git integration.

### 5.2 Background

Workspaces are directories where agents operate. Each workspace:
- Has a git repository (required for snapshots)
- Is isolated from other workspaces
- Has an exclusive lease during operation
- Enforces path policies

### 5.3 Subtasks

#### 5.3.1 Create Workspace Manager

Create `src/workspace/manager.ts`:

The manager provides:
- `create(source: WorkspaceSource): Promise<Workspace>` - Create workspace from source
- `initialize(workspace: Workspace): Promise<void>` - Initialize git if needed
- `get(id: string): Promise<Workspace | null>` - Get workspace by ID
- `delete(id: string): Promise<void>` - Delete workspace (if not leased)
- `getByPath(path: string): Promise<Workspace | null>` - Find by path

#### 5.3.2 Implement Source Handlers

Support two workspace sources:

**Local Path Source:**
- Validate path exists and is a directory
- Check if it's already a git repo
- If not, initialize git repo
- Create workspace record

**Git URL Source:**
- Clone repository to workspaces directory
- Use shallow clone for speed (`--depth 1`)
- Set up proper remote tracking
- Create workspace record

#### 5.3.3 Create Git Operations Module

Create `src/workspace/git-ops.ts`:

Git operations wrapper using simple-git:
- `isGitRepo(path: string): Promise<boolean>`
- `initRepo(path: string): Promise<void>`
- `cloneRepo(url: string, dest: string): Promise<void>`
- `getCurrentSha(path: string): Promise<string>`
- `getDiff(path: string, from: string, to: string): Promise<string>`
- `stageAll(path: string): Promise<void>`
- `commit(path: string, message: string): Promise<string>`
- `hasUncommittedChanges(path: string): Promise<boolean>`
- `checkout(path: string, ref: string): Promise<void>`
- `createBranch(path: string, name: string): Promise<void>`

#### 5.3.4 Implement Workspace Persistence

Create `src/workspace/workspace-store.ts`:

JSON file-based storage at `~/.agentgate/workspaces/`:
- `save(workspace: Workspace): Promise<void>`
- `load(id: string): Promise<Workspace | null>`
- `loadAll(): Promise<Workspace[]>`
- `delete(id: string): Promise<void>`

### 5.4 Verification Steps

1. Create workspace from local path - workspace created with git initialized
2. Create workspace from git URL - repo cloned successfully
3. Get workspace by ID - returns correct workspace
4. Delete workspace - removes record (not files for safety)
5. Restart process - workspaces persist

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/workspace/manager.ts` | Created |
| `agentgate/src/workspace/git-ops.ts` | Created |
| `agentgate/src/workspace/workspace-store.ts` | Created |
| `agentgate/src/workspace/index.ts` | Created |

---

## Thrust 6: Workspace Leasing

### 6.1 Objective

Implement exclusive lease mechanism to prevent concurrent modifications.

### 6.2 Background

Only one run can operate on a workspace at a time. The lease mechanism:
- Prevents race conditions
- Ensures clean state for each run
- Times out stale leases

### 6.3 Subtasks

#### 6.3.1 Create Lease Manager

Create `src/workspace/lease.ts`:

The lease manager provides:
- `acquire(workspaceId: string, runId: string): Promise<Lease | null>` - Try to acquire lease
- `release(leaseId: string): Promise<void>` - Release lease
- `refresh(leaseId: string): Promise<void>` - Extend lease timeout
- `isLeased(workspaceId: string): Promise<boolean>` - Check lease status
- `getActiveLease(workspaceId: string): Promise<Lease | null>` - Get current lease

Lease structure:
- `id`: string (nanoid)
- `workspaceId`: string
- `runId`: string
- `acquiredAt`: Date
- `expiresAt`: Date (default: 1 hour from acquisition)
- `lastRefreshedAt`: Date

#### 6.3.2 Implement Lease Persistence

Store leases in `~/.agentgate/leases/` as JSON files.

Include automatic stale lease detection:
- On acquire, check if existing lease is expired
- If expired, forcibly release and acquire new
- Log warning when releasing stale lease

#### 6.3.3 Implement Lease Heartbeat

For long-running operations, the orchestrator must refresh leases:
- Refresh interval: every 5 minutes
- Lease timeout: 1 hour
- On failure to refresh, log error but continue

#### 6.3.4 Add Lease to Workspace Operations

Update workspace manager:
- Check lease before any write operation
- Include lease check in workspace status
- Expose lease info in workspace queries

### 6.4 Verification Steps

1. Acquire lease on workspace - returns lease ID
2. Try to acquire same workspace - returns null (already leased)
3. Release lease - workspace becomes available
4. Acquire with expired lease - stale lease released, new lease acquired
5. Refresh lease - expiresAt extended

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/workspace/lease.ts` | Created |
| `agentgate/src/workspace/manager.ts` | Modified |
| `agentgate/src/types/workspace.ts` | Modified (add Lease type) |

---

## Thrust 7: Path Policy Enforcement

### 7.1 Objective

Implement path validation to ensure agents stay within workspace boundaries.

### 7.2 Background

Agents must not:
- Write outside workspace root
- Access sensitive files (secrets, credentials)
- Create files matching forbidden patterns

### 7.3 Subtasks

#### 7.3.1 Create Path Policy Module

Create `src/workspace/path-policy.ts`:

Policy configuration:
- `rootPath`: Workspace root (absolute path)
- `allowedPaths`: Glob patterns for allowed paths (relative to root)
- `forbiddenPatterns`: Glob patterns that must not exist in workspace

Default forbidden patterns:
- `**/.env`
- `**/.env.*`
- `**/secrets/**`
- `**/*.pem`
- `**/*.key`
- `**/credentials.json`
- `**/service-account*.json`

#### 7.3.2 Implement Path Validation

Create validation functions:
- `isPathWithinRoot(path: string, root: string): boolean` - Check containment
- `isPathAllowed(path: string, policy: PathPolicy): boolean` - Check against policy
- `findForbiddenFiles(root: string, patterns: string[]): Promise<string[]>` - Scan for violations
- `validateWorkspace(workspace: Workspace): Promise<ValidationResult>` - Full validation

Use `fast-glob` for pattern matching.

#### 7.3.3 Integrate with Workspace Manager

Add policy checks:
- Before lease acquisition, validate workspace
- After BUILD phase, scan for forbidden files
- Block snapshotting if violations found

#### 7.3.4 Create Policy Configuration

Allow per-workspace policy override via `.agentgate/policy.yaml`:

Schema:
- `allowedPaths`: string[] (glob patterns)
- `forbiddenPatterns`: string[] (glob patterns)
- `allowNetwork`: boolean (default: false)
- `maxFileSize`: number (bytes, default: 10MB)

### 7.4 Verification Steps

1. Create file outside root - blocked by policy
2. Create .env file - detected as forbidden
3. Create normal file - allowed
4. Custom policy allows .env - file permitted
5. Scan workspace with violations - returns list

### 7.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/workspace/path-policy.ts` | Created |
| `agentgate/src/workspace/manager.ts` | Modified |
| `agentgate/package.json` | Modified (add fast-glob) |

---

## Thrust 8: Clean Checkout for Verification

### 8.1 Objective

Implement clean workspace extraction for the verifier.

### 8.2 Background

The verifier needs an isolated copy of the workspace at a specific snapshot. This copy:
- Is read-only from verifier's perspective
- Lives in a temporary directory
- Is deleted after verification
- Contains no workspace metadata (leases, etc.)

### 8.3 Subtasks

#### 8.3.1 Implement Snapshot Extraction

Create `src/workspace/checkout.ts`:

Functions:
- `extractSnapshot(workspace: Workspace, sha: string, destDir: string): Promise<void>`
  - Create dest directory
  - Use `git archive` to extract without .git
  - Alternatively, use `git worktree` for speed
- `createCleanCheckout(workspace: Workspace, sha: string): Promise<string>`
  - Create temp directory
  - Extract snapshot
  - Return path to clean checkout
- `cleanupCheckout(checkoutPath: string): Promise<void>`
  - Remove temp directory
  - Verify complete removal

#### 8.3.2 Choose Extraction Method

For MVP, use `git archive`:
- Simpler implementation
- No .git directory in output
- Works with any git version

Alternative (faster for large repos):
- `git worktree add --detach` creates linked checkout
- Requires cleanup with `git worktree remove`

#### 8.3.3 Implement Temp Directory Management

Create `src/utils/temp.ts`:

Functions:
- `createTempDir(prefix: string): Promise<string>` - Create temp directory
- `removeTempDir(path: string): Promise<void>` - Remove temp directory
- `listTempDirs(): Promise<string[]>` - List AgentGate temp dirs
- `cleanupStaleTempDirs(maxAge: number): Promise<void>` - Remove old temps

Temp directory location: `~/.agentgate/tmp/`

### 8.4 Verification Steps

1. Extract snapshot to temp dir - files match snapshot
2. Temp dir has no .git directory - confirmed
3. Clean up temp dir - directory removed
4. Extract non-existent SHA - proper error thrown
5. Stale temp cleanup - old directories removed

### 8.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/workspace/checkout.ts` | Created |
| `agentgate/src/utils/temp.ts` | Created |

---

## Module B Complete Checklist

- [ ] Workspace manager created
- [ ] Local path source handler working
- [ ] Git URL source handler working
- [ ] Git operations module complete
- [ ] Workspace persistence working
- [ ] Lease manager implemented
- [ ] Lease heartbeat working
- [ ] Stale lease detection working
- [ ] Path policy module created
- [ ] Forbidden pattern detection working
- [ ] Policy configuration support
- [ ] Clean checkout extraction working
- [ ] Temp directory management working
- [ ] Unit tests passing

---

## Next Steps

Proceed to [04-agent-driver.md](./04-agent-driver.md) for Module C implementation.
