# 04: Streaming - Real-Time Agent Activity

This document covers Thrusts 7-8, implementing real-time streaming of agent activity and verification progress.

---

## Thrust 7: Running Screen

### 7.1 Objective

Create the running screen that displays real-time agent activity as the agent works on the task.

### 7.2 Background

The running screen is the heart of the TUI experience. Users watch the agent:
- Read files and understand the codebase
- Edit files to make changes
- Run commands to test and build
- Iterate through verification failures

This needs to feel alive and responsive.

### 7.3 Subtasks

#### 7.3.1 Create Run State Hook

Manage run state and SSE connection.

**Files to create:**
- `packages/tui/src/hooks/useRun.ts` - Run state management hook

**Requirements:**
- Connect to SSE stream for run ID
- Parse incoming events into typed objects
- Maintain activity log (last N events)
- Track run status and iteration
- Handle disconnection and reconnection
- Support cancellation

**Dog Food Work Order:**
```
Create packages/tui/src/hooks/useRun.ts:

Create a useRun hook that:
- Takes workOrderId as parameter
- Connects to SSE stream at /api/v1/runs/{runId}/stream
- Maintains state:
  - run: Run object (status, iteration, etc.)
  - activities: AgentActivity[] (last 50 events)
  - verification: VerificationProgress | null
  - error: string | null
  - isConnected: boolean
- Provides actions:
  - cancel(): cancels the work order via API
  - reconnect(): attempts to reconnect SSE
- Handles SSE events:
  - 'agent:activity' - add to activities array
  - 'verification:start' - set verification in progress
  - 'verification:progress' - update verification state
  - 'run:completed' - update final status
  - 'run:error' - set error state
- Cleans up SSE connection on unmount

Use the RunStream class from api/stream.ts.
Limit activities to last 50 to prevent memory issues.
```

#### 7.3.2 Create Activity Log Component

Display scrolling agent activity.

**Files to create:**
- `packages/tui/src/components/ActivityLog.tsx` - Agent activity display

**Requirements:**
- Show tool type with color-coded badge
- Show file path or command
- Show brief output/description
- Auto-scroll to latest
- Limit visible lines to fit screen

**Dog Food Work Order:**
```
Create packages/tui/src/components/ActivityLog.tsx:

Create an ActivityLog component that:
- Takes activities array as prop
- Renders each activity as a row with:
  - Tool type badge (Read, Edit, Write, Bash) with color
  - File path or command (truncated if too long)
  - Optional description line below (dimmed)
- Colors by tool type:
  - Read: cyan
  - Edit: yellow
  - Write: green
  - Bash: magenta
  - Error: red
- Shows only last N activities that fit in available height
- Most recent activity at bottom

Use Ink's Box and Text components.
Use flexDirection="column" for the log.
Format times as relative (e.g., just now, 5s ago).
```

#### 7.3.3 Create Running Screen

Assemble the running screen.

**Files to create:**
- `packages/tui/src/screens/Running.tsx` - Running screen component

**Requirements:**
- Header with repo, task, iteration, elapsed time
- Activity log (main content area)
- Current status indicator at bottom
- Footer with cancel/detach hints
- Transition to verifying when agent completes

**Dog Food Work Order:**
```
Create packages/tui/src/screens/Running.tsx:

Create a Running screen that:
- Takes workOrderId as prop
- Uses useRun() hook for state
- Uses useState for elapsedTime (update every second)
- Renders:
  - Header: repo name, "iter N · Xm Ys"
  - Task prompt (truncated to one line)
  - Divider
  - ActivityLog component (fills available space)
  - Status line: "● Agent working..." with spinner
  - Footer: [c] Cancel  [d] Detach
- Handles keyboard:
  - c: confirm cancel, then call run.cancel()
  - d: call onDetach() to return to home (run continues)
- Handles state transitions:
  - On verification start: transition to Verifying screen
  - On run completed: transition to result screen
  - On error: show error and offer retry

Use setInterval to update elapsed time every second.
Clean up interval on unmount.
```

#### 7.3.4 Create Spinner Component

Create an animated spinner.

**Files to create:**
- `packages/tui/src/components/Spinner.tsx` - Loading spinner

**Requirements:**
- Animated spinning indicator
- Optional label text
- Multiple spinner styles

**Dog Food Work Order:**
```
Create packages/tui/src/components/Spinner.tsx:

Create a Spinner component that:
- Takes optional label prop
- Animates through spinner frames: ◐ ◓ ◑ ◒ (or similar)
- Updates frame every 100ms
- Shows label next to spinner if provided

Use useState and useEffect for animation.
Use setInterval for frame updates.
Clean up interval on unmount.
Export as default component.

Alternative: use ink-spinner package if available.
```

#### 7.3.5 Handle Detach and Reattach

Allow user to detach from running task.

**Files to modify:**
- `packages/tui/src/screens/Home.tsx` - Show running task banner
- `packages/tui/src/store/app.ts` - Track detached runs

**Requirements:**
- Detach returns to home but run continues
- Home shows banner with running task
- Pressing 'v' reattaches to running task
- Banner updates with elapsed time

**Dog Food Work Order:**
```
Modify the TUI to support detaching and reattaching:

1. In src/store/app.ts, add:
   - activeRunId: string | null
   - Set when run starts, clear when completed

2. In src/screens/Home.tsx:
   - Check for activeRunId in store
   - If present, show banner at top:
     "● Running: repo/name 'task...' Xm Ys"
   - Add 'v' key handler to navigate to Running screen

3. In src/screens/Running.tsx:
   - On detach, just navigate to home (don't clear activeRunId)
   - The useRun hook should persist connection state in store

The SSE connection should continue in the background.
When user reattaches, show current state (not replay history).
```

### 7.4 Verification Steps

1. Running screen connects to SSE stream
2. Agent activity appears in real-time
3. Elapsed time updates every second
4. Cancel shows confirmation and cancels run
5. Detach returns to home with banner
6. Reattach shows current state

### 7.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/src/hooks/useRun.ts` | Created | Run state hook |
| `packages/tui/src/components/ActivityLog.tsx` | Created | Activity display |
| `packages/tui/src/components/Spinner.tsx` | Created | Spinner animation |
| `packages/tui/src/screens/Running.tsx` | Created | Running screen |
| `packages/tui/src/screens/Home.tsx` | Modified | Add run banner |
| `packages/tui/src/store/app.ts` | Modified | Track active run |

---

## Thrust 8: Verification Display

### 8.1 Objective

Display verification progress as the system validates agent changes.

### 8.2 Background

After the agent completes, AgentGate runs L0-L3 verification:
- L0: Contract checks (lint, types, required files)
- L1: Test suite execution
- L2: Integration/blackbox tests
- L3: Build and sanity checks

Users should see which level is running and results as they complete.

### 8.3 Subtasks

#### 8.3.1 Create Verification Status Component

Display verification level progress.

**Files to create:**
- `packages/tui/src/components/VerificationStatus.tsx` - Verification display

**Requirements:**
- Show all 4 levels with status indicators
- ✓ for passed (green)
- ● for running (yellow, animated)
- ○ for waiting (dim)
- ✗ for failed (red)
- Show brief details for running level

**Dog Food Work Order:**
```
Create packages/tui/src/components/VerificationStatus.tsx:

Create a VerificationStatus component that:
- Takes verification object as prop with:
  - currentLevel: 'L0' | 'L1' | 'L2' | 'L3' | null
  - results: { L0?: 'passed'|'failed', L1?: ..., etc. }
  - progress?: { current: number, total: number } for tests
- Renders each level as a row:
  - Status indicator (✓, ●, ○, ✗)
  - Level name (L0 Contracts, L1 Tests, etc.)
  - Status text (Passed, Running, Waiting, Failed)
  - For running level with progress: "(12/18)"
- Colors:
  - Passed: green
  - Running: yellow
  - Waiting: dim gray
  - Failed: red

Use flexDirection="column" for the list.
Each row should be a Box with alignItems="center".
```

#### 8.3.2 Create Verifying Screen

Display verification in progress.

**Files to create:**
- `packages/tui/src/screens/Verifying.tsx` - Verification screen

**Requirements:**
- Header with repo, task, iteration
- "Agent completed. Verifying changes..." message
- VerificationStatus component
- Cancel option in footer
- Transition to result when complete

**Dog Food Work Order:**
```
Create packages/tui/src/screens/Verifying.tsx:

Create a Verifying screen that:
- Takes run object and verification state as props
- Renders:
  - Header with repo, iteration, elapsed time
  - Task prompt (truncated)
  - Divider
  - "Agent completed. Verifying changes..." message
  - VerificationStatus component
  - Spacer to push footer down
  - Footer: [c] Cancel
- Handles keyboard:
  - c: call onCancel() to cancel work order
- Handles state transitions:
  - All passed: transition to Success screen
  - Any failed: transition to Iteration or Failure screen
    - Iteration if more iterations available
    - Failure if max iterations reached

Use useRun hook to get verification updates.
```

#### 8.3.3 Handle Verification Failures

Route to iteration or failure based on remaining iterations.

**Files to modify:**
- `packages/tui/src/App.tsx` - Add verification routing logic

**Requirements:**
- On verification failure:
  - If iterations remain → Iteration screen
  - If max iterations reached → Failure screen
- Track iteration count from run state
- Pass error details to result screens

**Dog Food Work Order:**
```
Modify packages/tui/src/App.tsx to handle verification routing:

Add logic to determine next screen after verification:

1. Listen for verification completion in the run state
2. If verification passed:
   - Navigate to Success screen
3. If verification failed:
   - Check run.iteration vs run.maxIterations
   - If iteration < maxIterations:
     - Navigate to Iteration screen (shows failure, then auto-continues)
   - Else:
     - Navigate to Failure screen
4. If run canceled:
   - Navigate to Canceled screen

Pass the run object and error details to result screens.
The Iteration screen should auto-transition back to Running after a brief delay.
```

### 8.4 Verification Steps

1. Verifying screen appears after agent completes
2. Each level shows correct status indicator
3. Progress updates in real-time for tests
4. Failed verification shows appropriate next screen
5. Cancel during verification works
6. All transitions are smooth

### 8.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/src/components/VerificationStatus.tsx` | Created | Verification display |
| `packages/tui/src/screens/Verifying.tsx` | Created | Verifying screen |
| `packages/tui/src/App.tsx` | Modified | Add verification routing |

---

## Phase 3 Completion Checklist

After completing Thrusts 7-8:

- [ ] Running screen shows real-time agent activity
- [ ] Tool types have correct colors
- [ ] Elapsed time updates every second
- [ ] Cancel confirms and cancels run
- [ ] Detach returns to home with banner
- [ ] Reattach shows current run state
- [ ] Verifying screen shows L0-L3 progress
- [ ] Status indicators update in real-time
- [ ] Verification failures route correctly
- [ ] All SSE events are handled

---

## Next Steps

After Phase 3, proceed to [05-history.md](./05-history.md) for runs history views.
