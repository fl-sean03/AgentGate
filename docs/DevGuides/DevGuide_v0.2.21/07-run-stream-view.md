# 07: Thrust 6 - Run Stream View

## Objective

Create a real-time run streaming view that displays live agent activity, tool calls, output, and progress. This view connects via Server-Sent Events (SSE) to show run progress as it happens.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F6.1 | Connect to SSE stream | Must Have |
| F6.2 | Display run status live | Must Have |
| F6.3 | Show agent events in real-time | Must Have |
| F6.4 | Display iteration progress | Must Have |
| F6.5 | Show tool calls with details | Must Have |
| F6.6 | Tabs for different event types | Should Have |
| F6.7 | Pause/resume event stream | Should Have |
| F6.8 | Scroll to follow or manual scroll | Should Have |
| F6.9 | Copy output to clipboard | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N6.1 | Handle high event rate | Must Have |
| N6.2 | Memory efficient (limit stored events) | Must Have |
| N6.3 | Reconnect on connection loss | Must Have |
| N6.4 | Smooth scroll performance | Should Have |

---

## UI Specification

### Main Run Stream View

```
┌─ Run: FHC3pJst ─────────────────────────────────── Iteration 2/5 ┐
│                                                                   │
│  Status: ● building    Branch: agentgate/run-FHC3pJst            │
│  Started: 2m ago       Duration: 2m 34s                          │
│  Profile: default      Model: claude-3-opus                       │
│                                                                   │
│  [Output] [Tool Calls] [Files] [Errors]                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                   │
│  Agent Activity                                                   │
│  ─────────────────────────────────────────────────────────────── │
│  10:45:32 [read]   packages/server/src/orchestrator.ts           │
│  10:45:33 [read]   packages/server/src/types/run.ts              │
│  10:45:35 [edit]   packages/server/src/orchestrator.ts:234       │
│  10:45:36 [output] Adding WorkspaceManager facade...             │
│  10:45:38 [edit]   packages/server/src/workspace/manager.ts      │
│  10:45:40 [bash]   npm run build                                 │
│  10:45:41 [output] Build started...                              │
│  10:45:45 [output] Compiling TypeScript...                       │
│  █████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░ 45%           │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│ [o]utput [t]ool-calls [f]iles [e]rrors [Space] pause [←] back    │
└───────────────────────────────────────────────────────────────────┘
```

### Output Tab

```
Shows all agent stdout/stderr output:

│  Agent Output (Press Space to pause, Ctrl+F to search)           │
│  ─────────────────────────────────────────────────────────────── │
│  Starting iteration 2...                                          │
│  Reading file: packages/server/src/orchestrator.ts                │
│  Analyzing the orchestrator implementation...                     │
│  Found TODO at line 234: Add workspace management                 │
│  Planning changes:                                                │
│    1. Create WorkspaceManager class                               │
│    2. Add facade pattern for existing code                        │
│    3. Implement cleanup on run completion                         │
│  Editing orchestrator.ts...                                       │
│  Running build to verify changes...                               │
│  > npm run build                                                  │
│  > tsc --noEmit                                                   │
│  Build successful!                                                │
│  ▼ (auto-scrolling)                                               │
```

### Tool Calls Tab

```
Shows chronological list of tool calls:

│  Tool Calls (15 total, 2m 10s elapsed)                           │
│  ─────────────────────────────────────────────────────────────── │
│  Time     Tool    Target                              Duration   │
│  ──────────────────────────────────────────────────────────────  │
│  10:45:32 Read    packages/server/src/orchestrator.ts   120ms   │
│  10:45:33 Read    packages/server/src/types/run.ts       85ms   │
│  10:45:35 Edit    packages/server/src/orchestrator.ts   200ms   │
│ ▶10:45:40 Bash    npm run build                       45,000ms  │
│  10:45:48 Read    test/orchestrator.test.ts              90ms   │
│                                                                  │
│  ▼ Bash: npm run build                                          │
│    Command: npm run build                                        │
│    Duration: 45.0s                                               │
│    Exit Code: 0                                                  │
│    ┌───────────────────────────────────────────────────────┐    │
│    │ > agentgate@0.2.19 build                              │    │
│    │ > tsc --noEmit && tsup                                │    │
│    │                                                        │    │
│    │ Build completed successfully                           │    │
│    └───────────────────────────────────────────────────────┘    │
```

### Files Tab

```
Shows files modified in current iteration:

│  Files Changed (3 files, +45 -12 lines)                          │
│  ─────────────────────────────────────────────────────────────── │
│  Operation  File                                    Changes      │
│  ──────────────────────────────────────────────────────────────  │
│  Modified   packages/server/src/orchestrator.ts     +30 -8       │
│  Modified   packages/server/src/workspace/manager.ts +15 -4      │
│  Created    packages/server/src/workspace/types.ts  +10         │
│                                                                   │
│  ▼ packages/server/src/orchestrator.ts                           │
│    @@ -230,8 +230,12 @@                                          │
│    - const result = await agent.run();                           │
│    + const workspace = this.workspaceManager.prepare();          │
│    + const result = await agent.run(workspace);                  │
│    + await this.workspaceManager.cleanup(workspace);             │
```

### Errors Tab

```
Shows errors if any occurred:

│  Errors (1 error in iteration 2)                                 │
│  ─────────────────────────────────────────────────────────────── │
│                                                                   │
│  ┌─ BUILD_ERROR ─────────────────────────────────────────────┐  │
│  │ Exit Code: 1                                               │  │
│  │                                                            │  │
│  │ error TS2345: Argument of type 'string' is not            │  │
│  │ assignable to parameter of type 'WorkspaceConfig'.        │  │
│  │                                                            │  │
│  │ packages/server/src/orchestrator.ts:245:15                │  │
│  │                                                            │  │
│  │ Stderr:                                                    │  │
│  │ npm ERR! code ELIFECYCLE                                   │  │
│  │ npm ERR! errno 1                                           │  │
│  └────────────────────────────────────────────────────────────┘  │
```

---

## Component Hierarchy

```
RunStreamView
├── Box (main container)
│   ├── RunHeader
│   │   ├── RunStatus
│   │   ├── RunMetadata
│   │   └── IterationProgress
│   ├── TabNavigation
│   │   └── Tab (Output, Tool Calls, Files, Errors)
│   ├── TabContent
│   │   ├── OutputTab
│   │   │   ├── EventList
│   │   │   └── AutoScrollIndicator
│   │   ├── ToolCallsTab
│   │   │   ├── ToolCallList
│   │   │   └── ToolCallDetail (selected)
│   │   ├── FilesTab
│   │   │   ├── FileChangeList
│   │   │   └── FileDiff (selected)
│   │   └── ErrorsTab
│   │       └── ErrorDetail (repeated)
│   └── ProgressBar (if in progress)
├── KeyHint
└── ConnectionStatus (if disconnected)
```

---

## Component Specifications

### RunStreamView

**Location:** `src/components/views/RunStreamView.tsx`

```
Props:
{
  runId: string,
}

State:
- activeTab: 'output' | 'tools' | 'files' | 'errors'
- isPaused: boolean
- selectedToolIndex: number
- selectedFileIndex: number
- autoScroll: boolean

Hooks:
- useRunStream(runId)
- useKeyboard()

Behavior:
1. Connect to SSE on mount
2. Render events based on active tab
3. Handle tab switching with keyboard
4. Toggle pause/resume
5. Handle auto-scroll
6. Disconnect on unmount
```

### RunHeader

**Location:** `src/components/panels/RunHeader.tsx`

```
Props:
{
  run: Run,
  iteration: number,
  maxIterations: number,
}

Displays:
- Run ID in title
- Status badge
- Branch name
- Started time (relative)
- Duration (live updating)
- Profile name
- Model name
- Iteration X/Y
```

### EventList

**Location:** `src/components/panels/EventList.tsx`

```
Props:
{
  events: RunEvent[],
  autoScroll: boolean,
  onScrollChange: (auto: boolean) => void,
  maxHeight: number,
}

Event Format:
- Time: HH:mm:ss (gray)
- Type: [read], [edit], [bash], [output] (colored)
- Content: File path, command, or output text
- Truncate long content with ellipsis

Behavior:
- Virtual scrolling for performance
- Auto-scroll follows new events
- Manual scroll disables auto-scroll
- Space toggles auto-scroll
```

### ToolCallList

**Location:** `src/components/panels/ToolCallList.tsx`

```
Props:
{
  toolCalls: ToolCall[],
  selectedIndex: number,
  onSelect: (index: number) => void,
}

Columns:
- Time
- Tool name
- Target (file or command)
- Duration

Selection:
- j/k to navigate
- Enter to expand detail
- Selected row highlighted
```

### ToolCallDetail

**Location:** `src/components/panels/ToolCallDetail.tsx`

```
Props:
{
  toolCall: ToolCall,
}

Displays (based on tool type):
- Read: File path, content preview
- Edit: File path, before/after diff
- Bash: Command, exit code, stdout/stderr
- Output: Full text content
```

---

## SSE Event Handling

### Event Types

```
Event Type -> UI Action:

run:status
  - Update status badge
  - Update duration
  - Handle completion

run:iteration:start
  - Increment iteration counter
  - Clear previous iteration events (optionally)

run:iteration:end
  - Mark iteration complete
  - Show verification results

agent:event (tool_call)
  - Add to tool call list
  - Add to event stream
  - Update active tool indicator

agent:event (output)
  - Add to output stream
  - Auto-scroll if enabled

agent:event (error)
  - Add to error list
  - Show error indicator

error
  - Show connection error
  - Attempt reconnection
```

### Event Storage

```
Store last N events per type:
- All events: 500 max
- Tool calls: 200 max
- Output lines: 1000 max
- Errors: 50 max

When limit reached:
- Remove oldest events
- Keep recent history visible
```

### Connection States

```
States:
1. connecting - Show spinner
2. connected - Green indicator
3. disconnected - Yellow indicator, attempt reconnect
4. error - Red indicator, show error message

UI Indicators:
┌─ Run: FHC3pJst ──────────────────────────── ● Connected ──┐
┌─ Run: FHC3pJst ──────────────────────────── ○ Connecting ─┐
┌─ Run: FHC3pJst ─────────────────────── ○ Reconnecting... ─┐
```

---

## Keyboard Navigation

### Global Run Stream Keys

| Key | Action | Description |
|-----|--------|-------------|
| `o` | Output tab | Switch to output tab |
| `t` | Tool calls tab | Switch to tool calls tab |
| `f` | Files tab | Switch to files tab |
| `e` | Errors tab | Switch to errors tab |
| `Space` | Pause/Resume | Toggle event stream |
| `g` | Go to top | Scroll to top |
| `G` | Go to bottom | Scroll to bottom |
| `←` / `Esc` | Back | Return to work order |
| `c` | Cancel | Cancel run (with confirm) |
| `q` | Quit | Exit application |

### Tab-Specific Keys

**Tool Calls Tab:**
| Key | Action |
|-----|--------|
| `j` / `↓` | Select next tool call |
| `k` / `↑` | Select previous tool call |
| `Enter` | Toggle detail view |

**Files Tab:**
| Key | Action |
|-----|--------|
| `j` / `↓` | Select next file |
| `k` / `↑` | Select previous file |
| `Enter` | Toggle diff view |

---

## Progress Display

### Iteration Progress

```
Format in header:
  Iteration 2/5

Progress bar for build/test:
  Building... █████████████████████████░░░░░░░░░░░░░░░░░ 60%

Verification progress:
  L0 ✓  L1 ⠋  L2 ○  L3 ○
```

### Duration Tracking

```
Live updating duration:
- Update every second while running
- Format: "Xm Ys" or "Xh Ym" for long runs
- Stop updating when run completes
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC6.1 | SSE connects | Connection established |
| AC6.2 | Events stream live | Events appear in real-time |
| AC6.3 | Status updates live | Badge changes on status change |
| AC6.4 | Tab switching works | Content changes per tab |
| AC6.5 | Tool call list shows | All tool calls visible |
| AC6.6 | Tool call detail expands | Shows full output |
| AC6.7 | Files tab shows changes | File list visible |
| AC6.8 | Errors tab shows errors | Errors visible when present |
| AC6.9 | Pause/resume works | Stream pauses/resumes |
| AC6.10 | Auto-scroll works | Follows new events |
| AC6.11 | Reconnection works | Reconnects after disconnect |
| AC6.12 | Back navigation works | Returns to work order |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| RunStreamView renders | No crash |
| EventList renders events | Shows formatted events |
| ToolCallList renders | Shows tool calls |
| Tab switching | Content changes |
| Pause state | Events stop updating |

### Integration Tests

| Test | Description |
|------|-------------|
| SSE connection | Connects to stream |
| Event processing | Events parsed correctly |
| Reconnection | Reconnects on disconnect |
| State updates | Status changes reflected |

### E2E Tests

| Test | Description |
|------|-------------|
| Watch running run | Connect and see events |
| Tab navigation | Switch tabs with keys |
| Complete run observation | Watch until completion |

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `src/components/views/RunStreamView.tsx` | 180 | Main view |
| `src/components/panels/RunHeader.tsx` | 60 | Header component |
| `src/components/panels/EventList.tsx` | 100 | Event stream |
| `src/components/panels/ToolCallList.tsx` | 80 | Tool call list |
| `src/components/panels/ToolCallDetail.tsx` | 70 | Tool detail |
| `src/components/panels/FileDiff.tsx` | 60 | File diff display |
| `src/components/panels/ErrorDisplay.tsx` | 50 | Error panel |
| `src/components/panels/TabNavigation.tsx` | 40 | Tab bar |
| `tests/views/RunStreamView.test.tsx` | 150 | View tests |

**Total: ~9 files, ~790 lines**
