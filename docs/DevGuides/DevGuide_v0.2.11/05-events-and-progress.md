# 05: File Events & Progress Indicators

## Thrust 7: File Change Events

### 7.1 Objective

Track and emit events when files are created, modified, or deleted in the workspace.

### 7.2 Background

While tool calls tell us when an agent uses Write/Edit, we want:
- Confirmation file was actually changed
- Detection of changes from Bash commands
- File size information
- Consolidated view of all file changes

### 7.3 Subtasks

#### 7.3.1 Create FileWatcher Module

Create `packages/server/src/agent/file-watcher.ts`:

**Functionality:**
- Watch workspace directory for changes
- Detect create/modify/delete events
- Filter out ignored patterns (.git, node_modules, etc.)
- Emit FileChangedEvent

**Interface:**
```typescript
class FileWatcher {
  constructor(workspacePath: string, options?: FileWatcherOptions);
  start(): void;
  stop(): void;
  onFileChange(callback: (event: FileChangedEvent) => void): void;
}
```

#### 7.3.2 Implement Chokidar Integration

Use chokidar (or Node.js fs.watch) for file watching:

**Configuration:**
- Watch workspace root recursively
- Ignore patterns: `.git/**`, `node_modules/**`, `*.log`
- Debounce rapid changes (100ms)
- Resolve symlinks

#### 7.3.3 Generate FileChangedEvent

When file change detected:

**Event fields:**
- `type`: `'file_changed'`
- `workOrderId`: From context
- `runId`: From context
- `path`: Relative to workspace root
- `action`: `'created' | 'modified' | 'deleted'`
- `sizeBytes`: New file size (fs.stat)
- `timestamp`: ISO string

#### 7.3.4 Integrate with StreamingExecutor

Connect file watcher to streaming executor:

**Flow:**
1. StreamingExecutor starts file watcher before running agent
2. File changes emit via same callback as other events
3. File watcher stops when agent completes
4. Cleanup on error/cancellation

#### 7.3.5 Add to Broadcaster

Add `emitFileChanged` method to broadcaster if not already done.

#### 7.3.6 Handle Edge Cases

**Edge cases:**
- File created then immediately deleted
- Same file modified multiple times rapidly
- Binary files (don't try to read content)
- Permission errors
- Symlink changes

### 7.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Create unit tests for FileWatcher
3. Integration test: Run agent that creates files, verify events
4. Verify events appear in dashboard Files tab

### 7.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/file-watcher.ts` | Created |
| `packages/server/src/agent/streaming-executor.ts` | Modified |
| `packages/server/test/file-watcher.test.ts` | Created |

---

## Thrust 8: Progress Indicators

### 8.1 Objective

Provide meaningful progress indication during agent execution.

### 8.2 Background

Progress is hard to estimate for AI agents because:
- Task complexity varies wildly
- No predetermined number of steps
- Execution can take unexpected paths

We'll use heuristics and observable metrics to provide useful progress indication.

### 8.3 Subtasks

#### 8.3.1 Define Progress Heuristics

Create progress estimation logic:

**Inputs:**
- Elapsed time
- Number of tool calls made
- Types of tool calls (tests = near end)
- Task prompt analysis (optional)
- Historical data (optional)

**Output:**
- Estimated percentage (0-100)
- Current phase string
- ETA if confident, otherwise undefined

#### 8.3.2 Create ProgressTracker Module

Create `packages/server/src/agent/progress-tracker.ts`:

**Functionality:**
- Track execution metrics
- Apply heuristics
- Emit periodic updates
- Learn from completion (store for future estimates)

**Interface:**
```typescript
class ProgressTracker {
  constructor(workOrderId: string, runId: string, options?: ProgressOptions);
  recordToolCall(tool: string): void;
  recordOutput(text: string): void;
  getProgress(): ProgressState;
  startPeriodicEmit(callback: (event: ProgressUpdateEvent) => void, intervalMs: number): void;
  stop(): void;
}
```

#### 8.3.3 Implement Phase Detection

Detect execution phases from activity:

**Phases:**
1. **Starting**: First few seconds, initialization
2. **Reading**: Predominantly Read/Glob/Grep calls
3. **Planning**: Agent output with planning language
4. **Implementing**: Write/Edit calls
5. **Testing**: Bash calls with test/check patterns
6. **Finalizing**: Git commands, PR creation

**Detection rules:**
- Phase changes based on recent tool call patterns
- Keyword detection in agent output
- Time-based fallbacks

#### 8.3.4 Implement Percentage Estimation

Calculate percentage based on:

**Simple model:**
```
percentage = min(
  elapsed_time / expected_time * 0.3 +
  tool_calls / expected_tools * 0.3 +
  phase_weight * 0.4,
  99  // Never show 100% until actually complete
)
```

**Phase weights:**
| Phase | Weight |
|-------|--------|
| Starting | 5 |
| Reading | 15 |
| Planning | 25 |
| Implementing | 60 |
| Testing | 85 |
| Finalizing | 95 |

#### 8.3.5 Emit Progress Events

Emit `ProgressUpdateEvent` at configurable intervals:

**Default**: Every 5 seconds
**Content:**
- Current percentage
- Current phase
- Tool call count
- Elapsed seconds
- Estimated remaining (if confident)

#### 8.3.6 Update Dashboard Progress Header

Ensure ProgressHeader component handles:

- Smooth percentage animation
- Phase text updates
- ETA display with uncertainty indicator
- Indeterminate mode when no estimate available

### 8.4 Verification Steps

1. Run `pnpm typecheck` - no errors
2. Unit tests for ProgressTracker
3. Integration test: Run agent, verify progress events emitted
4. Dashboard shows progress bar updating
5. Phase changes reflected in UI

### 8.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/progress-tracker.ts` | Created |
| `packages/server/src/agent/streaming-executor.ts` | Modified |
| `packages/server/test/progress-tracker.test.ts` | Created |
| `packages/dashboard/src/components/ProgressHeader.tsx` | Modified |

---

## Testing Requirements

### FileWatcher Tests

```typescript
describe('FileWatcher', () => {
  let watcher: FileWatcher;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp('/tmp/watcher-test-');
    watcher = new FileWatcher(tempDir);
  });

  afterEach(async () => {
    watcher.stop();
    await fs.rm(tempDir, { recursive: true });
  });

  it('should detect file creation', async () => {
    const events: FileChangedEvent[] = [];
    watcher.onFileChange(e => events.push(e));
    watcher.start();

    await fs.writeFile(path.join(tempDir, 'test.txt'), 'hello');
    await wait(200);

    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('created');
  });

  it('should detect file modification', async () => {
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'hello');
    const events: FileChangedEvent[] = [];
    watcher.onFileChange(e => events.push(e));
    watcher.start();

    await fs.writeFile(path.join(tempDir, 'test.txt'), 'world');
    await wait(200);

    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('modified');
  });

  it('should ignore .git directory', async () => {
    const events: FileChangedEvent[] = [];
    watcher.onFileChange(e => events.push(e));
    watcher.start();

    await fs.mkdir(path.join(tempDir, '.git'));
    await fs.writeFile(path.join(tempDir, '.git/config'), 'test');
    await wait(200);

    expect(events).toHaveLength(0);
  });
});
```

### ProgressTracker Tests

```typescript
describe('ProgressTracker', () => {
  it('should start at 0%', () => {
    const tracker = new ProgressTracker('wo-1', 'run-1');
    expect(tracker.getProgress().percentage).toBe(0);
  });

  it('should increase with tool calls', () => {
    const tracker = new ProgressTracker('wo-1', 'run-1');
    tracker.recordToolCall('Read');
    tracker.recordToolCall('Read');
    tracker.recordToolCall('Read');
    expect(tracker.getProgress().percentage).toBeGreaterThan(0);
  });

  it('should detect reading phase', () => {
    const tracker = new ProgressTracker('wo-1', 'run-1');
    tracker.recordToolCall('Read');
    tracker.recordToolCall('Glob');
    tracker.recordToolCall('Grep');
    expect(tracker.getProgress().currentPhase).toBe('Reading');
  });

  it('should detect testing phase', () => {
    const tracker = new ProgressTracker('wo-1', 'run-1');
    tracker.recordToolCall('Bash'); // pnpm test
    tracker.recordOutput('Running tests...');
    expect(tracker.getProgress().currentPhase).toBe('Testing');
  });

  it('should emit periodic updates', async () => {
    const updates: ProgressUpdateEvent[] = [];
    const tracker = new ProgressTracker('wo-1', 'run-1');
    tracker.startPeriodicEmit(e => updates.push(e), 100);

    await wait(350);
    tracker.stop();

    expect(updates.length).toBeGreaterThanOrEqual(3);
  });
});
```
