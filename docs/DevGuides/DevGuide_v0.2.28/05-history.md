# 05: History - Runs List and Detail Views

This document covers Thrust 9, implementing the runs history functionality.

---

## Thrust 9: Runs History

### 9.1 Objective

Create views for browsing past runs and viewing run details.

### 9.2 Background

Users need to:
- See their recent runs at a glance
- Check the status of completed runs
- View PR links for successful runs
- Understand why runs failed

The history view is accessed via 'r' from the home screen.

### 9.3 Subtasks

#### 9.3.1 Create Runs List Hook

Fetch user's run history.

**Files to create:**
- `packages/tui/src/hooks/useRuns.ts` - Runs history hook

**Requirements:**
- Fetch runs from /api/v1/runs
- Support pagination (fetch more on scroll)
- Filter by status (optional)
- Sort by most recent first
- Cache results for session

**Dog Food Work Order:**
```
Create packages/tui/src/hooks/useRuns.ts:

Create a useRuns hook that:
- Fetches runs from /api/v1/runs on mount
- Takes optional status filter parameter
- Returns { runs, isLoading, error, hasMore, loadMore }
- Supports pagination:
  - Initial fetch: 20 runs
  - loadMore() fetches next 20
  - hasMore indicates if more available
- Each run includes:
  - id, workOrderId
  - status (running, succeeded, failed, canceled)
  - workOrder.taskPrompt (truncated)
  - workOrder.workspaceSource.fullName (repo)
  - startedAt, completedAt, duration
  - prUrl (if available)

Sort by startedAt descending (most recent first).
```

#### 9.3.2 Create Runs List Screen

Display the runs history.

**Files to create:**
- `packages/tui/src/screens/RunsList.tsx` - Runs list screen

**Requirements:**
- Show runs with status indicator
- Show repo name and task (truncated)
- Show relative time (e.g., "2h ago")
- Keyboard navigation (up/down)
- Enter to view details
- Escape to return to home

**Dog Food Work Order:**
```
Create packages/tui/src/screens/RunsList.tsx:

Create a RunsList screen that:
- Uses useRuns() hook for data
- Uses useState for selectedIndex
- Renders:
  - Header: "Runs"
  - List of runs, each showing:
    - Status indicator (●, ✓, ✗) with color
    - Repo name (owner/repo)
    - Relative time on right
    - Task prompt below (dimmed, truncated)
  - Selection indicator (▸) for current item
  - Footer: [↑↓] Select  [Enter] View details  [Esc] Back
- Handles keyboard:
  - Up/Down or j/k: change selectedIndex
  - Enter: call onSelectRun(run) to view details
  - Escape: call onBack() to return to home
  - q: quit

If runs is empty, show "No runs yet" message.
If loading, show spinner.
```

#### 9.3.3 Create Run Detail Screen

Display details of a single run.

**Files to create:**
- `packages/tui/src/screens/RunDetail.tsx` - Run detail screen

**Requirements:**
- Full status with icon
- Repository and task
- Timing: started, completed, duration
- Iterations used
- Files changed (if available)
- PR link (if available)
- Error details (if failed)

**Dog Food Work Order:**
```
Create packages/tui/src/screens/RunDetail.tsx:

Create a RunDetail screen that:
- Takes run object as prop
- Fetches full run details if needed
- Renders:
  - Status header with icon (✓ Success, ✗ Failed, etc.)
  - Repo and task
  - Divider
  - Details section:
    - Status: Succeeded/Failed/Canceled
    - Started: formatted datetime
    - Duration: Xm Ys
    - Iterations: N
  - Files Changed section (if available):
    - List of file paths
  - Pull Request section (if succeeded):
    - PR URL
  - Error section (if failed):
    - Error message and details
  - Footer: [o] Open PR (if available)  [Esc] Back
- Handles keyboard:
  - o: open PR URL in browser (if available)
  - Escape: call onBack() to return to runs list

Format dates nicely (e.g., "Today at 2:34 PM").
```

#### 9.3.4 Integrate with App Router

Connect runs views to navigation.

**Files to modify:**
- `packages/tui/src/App.tsx` - Add runs routing

**Requirements:**
- 'r' from home navigates to runs list
- Enter on run navigates to detail
- Escape from detail returns to list
- Escape from list returns to home

**Dog Food Work Order:**
```
Modify packages/tui/src/App.tsx to add runs navigation:

1. Add screen states: 'runs-list' and 'run-detail'
2. Add selectedRun state for detail view
3. Add handlers:
   - onViewRuns: set screen to 'runs-list'
   - onSelectRun: set selectedRun, screen to 'run-detail'
   - onBackFromDetail: set screen to 'runs-list'
   - onBackFromList: set screen to 'home'
4. Render RunsList when screen is 'runs-list'
5. Render RunDetail when screen is 'run-detail'

Pass the appropriate callbacks to each screen.
```

### 9.4 Verification Steps

1. 'r' from home opens runs list
2. Runs show correct status indicators
3. Navigation with arrows works
4. Enter opens run details
5. Detail shows all relevant information
6. 'o' opens PR in browser
7. Escape navigation works correctly

### 9.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/src/hooks/useRuns.ts` | Created | Runs history hook |
| `packages/tui/src/screens/RunsList.tsx` | Created | Runs list screen |
| `packages/tui/src/screens/RunDetail.tsx` | Created | Run detail screen |
| `packages/tui/src/App.tsx` | Modified | Add runs routing |

---

## Phase 4 Part 1 Completion Checklist

After completing Thrust 9:

- [ ] Runs list fetches and displays history
- [ ] Status indicators show correct colors
- [ ] Relative times are formatted correctly
- [ ] Keyboard navigation works
- [ ] Run detail shows complete information
- [ ] PR links can be opened in browser
- [ ] Error details are displayed for failures
- [ ] Navigation between screens works

---

## Next Steps

After Thrust 9, proceed to [06-polish.md](./06-polish.md) for final polish and refinements.
