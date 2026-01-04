# 03: Core Screens - Home, Task Input, Results

This document covers Thrusts 4-6, implementing the primary user-facing screens.

---

## Thrust 4: Home Screen

### 4.1 Objective

Create the main home screen showing the user's GitHub repositories with search functionality.

### 4.2 Background

The home screen is where users spend most of their time. It should:
- Load quickly with cached repos
- Filter repos as user types
- Show running tasks prominently
- Navigate to other screens via keyboard

### 4.3 Subtasks

#### 4.3.1 Create Repository List Hook

Fetch and cache user repositories.

**Files to create:**
- `packages/tui/src/hooks/useRepos.ts` - Repository fetching hook

**Requirements:**
- Fetch repos from /api/v1/repos on mount
- Cache results for session
- Support filtering by search term
- Sort by last updated
- Return loading/error states

**Dog Food Work Order:**
```
Create packages/tui/src/hooks/useRepos.ts:

Create a useRepos hook that:
- Fetches repos from API on mount using the ApiClient
- Returns { repos, isLoading, error, refetch }
- Caches repos in Zustand store for session
- Provides filter(searchTerm) function for local filtering
- Sorts repos by pushedAt date (most recent first)

The hook should:
- Not refetch if repos already cached
- Support force refetch via refetch()
- Return empty array while loading

Each repo object should have:
- fullName: string (owner/repo)
- description: string | null
- pushedAt: Date
- private: boolean
```

#### 4.3.2 Create Repository List Component

Display the list of repositories.

**Files to create:**
- `packages/tui/src/components/RepoList.tsx` - Repository list component

**Requirements:**
- Show repo full name and last updated time
- Highlight selected item with `▸` indicator
- Dim private repos (or show lock icon)
- Support keyboard navigation (up/down)
- Show "No repositories found" if empty

**Dog Food Work Order:**
```
Create packages/tui/src/components/RepoList.tsx:

Create a RepoList component that:
- Takes repos array and selectedIndex props
- Renders each repo as a row with:
  - Selection indicator (▸ for selected, space for others)
  - Full name (owner/repo)
  - "updated Xh ago" on the right
- Highlights selected row (could use inverse colors or different color)
- Shows "No repositories" message if array is empty

Use Ink's Box and Text components.
Use flexDirection="column" for the list.
Each row should use justifyContent="space-between".
Format the pushedAt date as relative time (e.g., "2h ago", "3d ago").
```

#### 4.3.3 Create Home Screen

Assemble the home screen with search and list.

**Files to create:**
- `packages/tui/src/screens/Home.tsx` - Home screen component

**Requirements:**
- Search input at top
- Repository list below
- Running task banner (if any active)
- Footer with keyboard hints
- Handle navigation to task input

**Dog Food Work Order:**
```
Create packages/tui/src/screens/Home.tsx:

Create a Home screen component that:
- Uses useRepos() to get repository list
- Uses useState for:
  - searchTerm: string
  - selectedIndex: number
- Filters repos based on searchTerm
- Renders:
  - Running task banner (if activeRun from props/context)
  - Search input box with placeholder
  - RepoList component
  - Footer with keyboard hints
- Handles keyboard:
  - Up/Down or j/k: change selectedIndex
  - Enter: call onSelectRepo(repo) callback
  - r: call onViewRuns() callback
  - v: call onViewRunning() callback (if active run)
  - q: quit
  - Typing: update searchTerm, reset selectedIndex to 0

Use useInput from Ink for keyboard handling.
Wrap everything in the standard box border.
```

#### 4.3.4 Create Search Input Component

Create a styled text input for search.

**Files to create:**
- `packages/tui/src/components/TextInput.tsx` - Single-line text input

**Requirements:**
- Show placeholder when empty
- Cursor indicator
- Handle character input
- Handle backspace
- Support focus state

**Dog Food Work Order:**
```
Create packages/tui/src/components/TextInput.tsx:

Create a TextInput component that:
- Takes value, onChange, placeholder props
- Shows placeholder in dim color when value is empty
- Shows value with cursor indicator (underscore or block)
- Handles character keys (append to value)
- Handles backspace (remove last character)
- Handles Escape (clear value, call onEscape if provided)

Use useInput from Ink for keyboard handling.
Use a Box with border for the input container.
The input should be single-line only.
```

### 4.4 Verification Steps

1. Home screen loads and shows repository list
2. Search filters repositories as user types
3. Arrow keys navigate the list
4. Enter on a repo triggers navigation callback
5. "r" key triggers runs view callback
6. "q" key quits the application

### 4.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/src/hooks/useRepos.ts` | Created | Repos hook |
| `packages/tui/src/components/RepoList.tsx` | Created | Repo list |
| `packages/tui/src/components/TextInput.tsx` | Created | Text input |
| `packages/tui/src/screens/Home.tsx` | Created | Home screen |
| `packages/tui/src/App.tsx` | Modified | Add home routing |

---

## Thrust 5: Task Input Screen

### 5.1 Objective

Create the task input screen where users describe what they want the agent to do.

### 5.2 Background

The task input is the most important screen. Users need to:
- See which repo they selected
- Type a multi-line task description
- Submit with Enter
- Go back with Escape

### 5.3 Subtasks

#### 5.3.1 Create Multi-Line Text Area Component

Create a text area for task input.

**Files to create:**
- `packages/tui/src/components/TextArea.tsx` - Multi-line text input

**Requirements:**
- Support multiple lines
- Show line count or word wrap
- Cursor navigation within text
- Handle Enter for new line vs submit (Ctrl+Enter or just Enter at end)
- Placeholder text when empty

**Dog Food Work Order:**
```
Create packages/tui/src/components/TextArea.tsx:

Create a TextArea component that:
- Takes value, onChange, placeholder, maxLines props
- Shows placeholder in dim color when value is empty
- Renders text with cursor indicator
- Handles:
  - Character keys: insert at cursor
  - Backspace: delete before cursor
  - Enter: insert newline (if not at maxLines)
  - Arrow keys: move cursor (basic support)
- Wraps text to fit container width
- Shows current line/total lines indicator

Use a Box with border for the container.
The component should expand to fill available height.
Use Ink's useInput and measureElement if needed.
```

#### 5.3.2 Create Task Input Screen

Create the task input screen.

**Files to create:**
- `packages/tui/src/screens/TaskInput.tsx` - Task input screen

**Requirements:**
- Show selected repository name
- Multi-line text area for task
- Footer with keyboard hints
- Submit with Enter (when task not empty)
- Cancel with Escape

**Dog Food Work Order:**
```
Create packages/tui/src/screens/TaskInput.tsx:

Create a TaskInput screen that:
- Takes repo (selected repository) as prop
- Uses useState for taskText
- Renders:
  - Repository name at top
  - Divider line
  - "What would you like to do?" prompt
  - TextArea for task input
  - Footer with [Enter] Start, [Esc] Back
- Handles keyboard:
  - Enter (when task not empty): call onSubmit(repo, taskText)
  - Escape: call onBack()
- Validates task is not empty before submitting

Wrap in standard box border.
The text area should be the main focus.
```

#### 5.3.3 Create Work Order Submission Hook

Handle work order submission.

**Files to create:**
- `packages/tui/src/hooks/useWorkOrder.ts` - Work order submission hook

**Requirements:**
- submitWorkOrder(repo, task) creates work order
- Returns work order ID on success
- Handles errors gracefully
- Tracks loading state

**Dog Food Work Order:**
```
Create packages/tui/src/hooks/useWorkOrder.ts:

Create a useWorkOrder hook that:
- Provides submitWorkOrder(repo, task) async function
- Uses ApiClient to POST /api/v1/work-orders with:
  - taskPrompt: task
  - workspaceSource: { type: 'github', owner, repo, ref: 'main' }
  - agentType: 'claude-code-subscription'
  - maxIterations: 3
  - gatePlanSource: 'auto'
- Returns { submit, isSubmitting, error, workOrderId }
- On success, sets workOrderId
- On error, sets error message

Parse owner/repo from the fullName string.
Handle network errors with user-friendly messages.
```

### 5.4 Verification Steps

1. Task input screen shows selected repo name
2. User can type multi-line task description
3. Enter submits when task is not empty
4. Escape returns to home screen
5. Work order is created on server

### 5.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/src/components/TextArea.tsx` | Created | Multi-line input |
| `packages/tui/src/screens/TaskInput.tsx` | Created | Task input screen |
| `packages/tui/src/hooks/useWorkOrder.ts` | Created | Submission hook |
| `packages/tui/src/App.tsx` | Modified | Add task input routing |

---

## Thrust 6: Result Screens

### 6.1 Objective

Create screens for displaying task outcomes: success, failure, and canceled states.

### 6.2 Background

Result screens should:
- Clearly indicate success or failure
- Show relevant details (duration, iterations, PR link)
- Provide clear next actions
- Be visually distinct from each other

### 6.3 Subtasks

#### 6.3.1 Create Success Screen

Display successful completion with PR link.

**Files to create:**
- `packages/tui/src/screens/Success.tsx` - Success result screen

**Requirements:**
- Large checkmark and "Task completed" header
- Repository and task summary
- Stats: duration, iterations, files changed
- Verification summary (all green)
- PR link (clickable if terminal supports)
- Actions: Enter to done, o to open PR

**Dog Food Work Order:**
```
Create packages/tui/src/screens/Success.tsx:

Create a Success screen that:
- Takes run object as prop (includes workOrder, stats, prUrl)
- Renders:
  - "✓ Task completed" header in green
  - Repository name and truncated task prompt
  - Divider
  - Stats section: Duration, Iterations, Files changed
  - Verification summary: L0 ✓  L1 ✓  L2 ✓  L3 ✓
  - Pull Request section with URL
  - Footer: [Enter] Done  [o] Open PR in browser
- Handles keyboard:
  - Enter: call onDone() to return to home
  - o: open PR URL in browser using 'open' package

Use green color for success indicators.
Format duration as "Xm Ys".
```

#### 6.3.2 Create Failure Screen

Display failure with error details.

**Files to create:**
- `packages/tui/src/screens/Failure.tsx` - Failure result screen

**Requirements:**
- Red X and "Task failed" header
- Which verification level failed
- Specific error messages
- Option to retry with more iterations
- Option to accept and return home

**Dog Food Work Order:**
```
Create packages/tui/src/screens/Failure.tsx:

Create a Failure screen that:
- Takes run object as prop (includes error details, iterations used)
- Renders:
  - "✗ Task failed after N iterations" header in red
  - Repository name and truncated task prompt
  - Divider
  - Failed verification level and specific errors
  - Explanation message
  - Footer: [Enter] Done  [r] Retry with more iterations
- Handles keyboard:
  - Enter: call onDone() to return to home
  - r: call onRetry() to restart with higher maxIterations

Parse error details to show:
- Which level failed (L0, L1, L2, L3)
- Specific test/check that failed
- File and line if available
```

#### 6.3.3 Create Canceled Screen

Display cancellation confirmation.

**Files to create:**
- `packages/tui/src/screens/Canceled.tsx` - Canceled result screen

**Requirements:**
- Neutral styling (not red, not green)
- "Task canceled" message
- Duration before cancellation
- Note that no changes were pushed
- Single action: Enter to return home

**Dog Food Work Order:**
```
Create packages/tui/src/screens/Canceled.tsx:

Create a Canceled screen that:
- Takes run object as prop (includes duration, workOrder)
- Renders:
  - "Task canceled" header in dim color
  - Repository name and truncated task prompt
  - Divider
  - "The task was canceled after Xm Ys."
  - "No changes were pushed."
  - Footer: [Enter] Done
- Handles keyboard:
  - Enter: call onDone() to return to home

Use dim/gray colors for neutral tone.
Keep the message simple and reassuring.
```

#### 6.3.4 Create Iteration Screen

Display iteration transition when verification fails.

**Files to create:**
- `packages/tui/src/screens/Iteration.tsx` - Iteration transition screen

**Requirements:**
- Show which verification failed
- Show error details
- Show "Starting iteration N of M..."
- Auto-transition back to running screen

**Dog Food Work Order:**
```
Create packages/tui/src/screens/Iteration.tsx:

Create an Iteration screen that:
- Takes run object and verification results as props
- Renders:
  - Repository and task at top
  - Divider
  - Verification results with pass/fail indicators
  - Failed test details
  - Divider
  - "Starting iteration N of M..." with spinner
  - Footer: [c] Cancel
- Handles keyboard:
  - c: call onCancel() to cancel the work order

This screen is shown briefly between iterations.
After 2 seconds (or when next iteration starts), transition to Running screen.
Use yellow for the iteration indicator.
```

### 6.4 Verification Steps

1. Success screen shows all required information
2. Pressing 'o' opens PR in browser
3. Failure screen shows error details
4. Pressing 'r' on failure triggers retry
5. Canceled screen shows clean message
6. All screens return to home on Enter

### 6.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/src/screens/Success.tsx` | Created | Success screen |
| `packages/tui/src/screens/Failure.tsx` | Created | Failure screen |
| `packages/tui/src/screens/Canceled.tsx` | Created | Canceled screen |
| `packages/tui/src/screens/Iteration.tsx` | Created | Iteration screen |
| `packages/tui/src/App.tsx` | Modified | Add result routing |

---

## Phase 2 Completion Checklist

After completing Thrusts 4-6:

- [ ] Home screen displays user's repositories
- [ ] Search filters repositories in real-time
- [ ] Keyboard navigation works (arrows, j/k)
- [ ] Task input accepts multi-line text
- [ ] Work orders are submitted to server
- [ ] Success screen shows PR link
- [ ] Failure screen shows error details
- [ ] Canceled screen shows clean message
- [ ] All navigation paths work correctly
- [ ] No lint errors or test failures

---

## Next Steps

After Phase 2, proceed to [04-streaming.md](./04-streaming.md) for real-time agent activity streaming.
