# 10: Thrust 9 - Iteration Deep Dive

## Objective

Provide comprehensive iteration-level detail views showing full agent output, tool call history, file changes, and verification results for each iteration within a run.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F9.1 | Expand iteration card to show full details | Must Have |
| F9.2 | Display complete agent stdout/stderr | Must Have |
| F9.3 | Show all tool calls with timing | Must Have |
| F9.4 | Display file changes with diffs | Must Have |
| F9.5 | Show verification results per level | Must Have |
| F9.6 | Navigate between iterations | Must Have |
| F9.7 | Search within agent output | Should Have |
| F9.8 | Download iteration artifacts | Should Have |
| F9.9 | Compare iterations side-by-side | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N9.1 | Large outputs load progressively | Must Have |
| N9.2 | Works on mobile viewport | Must Have |
| N9.3 | Supports dark mode | Must Have |

---

## Data Sources

### Iteration Data (from v0.2.19)

```
interface IterationData {
  number: number;
  status: IterationStatus;
  startedAt: string;
  completedAt: string | null;
  sessionId: string;
  agentResultFile: string | null;
  verificationReportFile: string | null;
  verification: {
    l0Passed: boolean | null;
    l1Passed: boolean | null;
    l2Passed: boolean | null;
    l3Passed: boolean | null;
    overallPassed: boolean;
  };
  metrics: {
    durationMs: number;
    tokensUsed: { input: number; output: number } | null;
    toolCallCount: number;
    fileChanges: number;
  };
}
```

### Agent Result File (persisted in v0.2.19)

```
interface PersistedAgentResult {
  iteration: number;
  sessionId: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  tokensUsed: TokenUsage | null;
  toolCalls: ToolCallRecord[];
  model: string;
  capturedAt: string;
}
```

### Verification Report File

```
interface PersistedVerificationReport {
  iteration: number;
  levels: {
    L0: { passed: boolean; results: ContractResult[] };
    L1: { passed: boolean; results: TestResult[] };
    L2: { passed: boolean; results: BlackboxResult[] };
    L3: { passed: boolean; results: SanityResult[] };
  };
  overall: boolean;
  capturedAt: string;
}
```

---

## User Interface Specification

### Iteration Card (Collapsed)

```
┌─────────────────────────────────────────────────────────────────┐
│ Iteration 2                                                     │
│ ─────────────────────────────────────────────────────────────── │
│ Status: ● succeeded      Duration: 2m 34s                       │
│ Tools: 15 calls          Files: 3 changed                       │
│ Verification: L0 ✓  L1 ✓  L2 ✓  L3 ✓                            │
│                                                    [Expand ▼]   │
└─────────────────────────────────────────────────────────────────┘
```

### Iteration Card (Expanded)

```
┌─────────────────────────────────────────────────────────────────┐
│ Iteration 2                                      [◀ Prev] [Next ▶]
│ ─────────────────────────────────────────────────────────────── │
│ Status: ● succeeded      Duration: 2m 34s                       │
│ Started: 11:00:00 AM     Completed: 11:02:34 AM                │
│ Session: sess-abc123     Model: claude-3-opus                   │
│                                                                 │
│ [Agent Output] [Tool Calls] [Files] [Verification]              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                 │
│ AGENT OUTPUT TAB:                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🔍 [Search...                                    ]          │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │   1 │ Starting iteration 2...                               │ │
│ │   2 │ Reading file: src/index.ts                            │ │
│ │   3 │ Analyzing authentication flow...                      │ │
│ │   4 │ Found issue in login handler                          │ │
│ │   5 │ Editing src/auth/login.ts                             │ │
│ │   6 │ Running tests...                                      │ │
│ │   7 │ All tests passed                                      │ │
│ │ ... │ ...                                                   │ │
│ │  45 │ Iteration complete                                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Tokens: 12,450 input / 3,200 output                            │
│                                                                 │
│ [📋 Copy] [📥 Download] [Collapse ▲]                            │
└─────────────────────────────────────────────────────────────────┘
```

### Tab: Tool Calls

```
│ TOOL CALLS TAB:                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 15 tool calls (2m 10s total)                                │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 11:00:05  Read         src/index.ts              120ms      │ │
│ │ 11:00:07  Read         src/auth/login.ts          85ms      │ │
│ │ 11:00:15  Edit         src/auth/login.ts         200ms      │ │
│ │ 11:00:18  Bash         npm run test            45,000ms     │ │
│ │ 11:00:35  Read         test/auth.test.ts         90ms      │ │
│ │ 11:00:40  Edit         test/auth.test.ts        150ms      │ │
│ │ ...                                                         │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ▼ Bash: npm run test                                        │ │
│ │   Duration: 45.0s                                           │ │
│ │   Exit Code: 0                                              │ │
│ │   ┌─────────────────────────────────────────────────────┐   │ │
│ │   │ > npm run test                                      │   │ │
│ │   │ PASS test/auth.test.ts                              │   │ │
│ │   │   ✓ login with valid credentials (25ms)             │   │ │
│ │   │   ✓ login with invalid credentials (12ms)           │   │ │
│ │   └─────────────────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────────────────┘ │
```

### Tab: Files

```
│ FILES TAB:                                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 3 files changed (+45 -12)                                   │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ M src/auth/login.ts              +30 -8                     │ │
│ │ M test/auth.test.ts              +15 -4                     │ │
│ │ A src/auth/types.ts              +10                        │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ▼ src/auth/login.ts                                         │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ @@ -10,8 +10,12 @@ export async function login(...)       │ │ │
│ │ │ - const token = await generateToken(user);               │ │ │
│ │ │ + const token = await generateToken(user, {              │ │ │
│ │ │ +   expiresIn: '24h',                                    │ │ │
│ │ │ +   algorithm: 'RS256'                                   │ │ │
│ │ │ + });                                                    │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
```

### Tab: Verification

```
│ VERIFICATION TAB:                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Overall: ✓ Passed                                           │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ▼ L0: Contract Validation           ✓ Passed               │ │
│ │   ├─ TypeScript compilation          ✓                     │ │
│ │   ├─ ESLint checks                   ✓                     │ │
│ │   └─ Schema validation               ✓                     │ │
│ │                                                             │ │
│ │ ▼ L1: Test Execution                 ✓ Passed               │ │
│ │   ├─ Unit tests (45/45)              ✓                     │ │
│ │   ├─ Integration tests (12/12)       ✓                     │ │
│ │   └─ Coverage: 87%                   ✓                     │ │
│ │                                                             │ │
│ │ ▶ L2: Blackbox Testing               ✓ Passed (collapsed)   │ │
│ │ ▶ L3: Sanity Checks                  ✓ Passed (collapsed)   │ │
│ └─────────────────────────────────────────────────────────────┘ │
```

---

## Component Hierarchy

```
IterationCard
├── IterationHeader
│   ├── IterationNumber
│   ├── StatusBadge
│   ├── QuickMetrics (duration, tools, files)
│   ├── VerificationSummary (L0-L3 badges)
│   └── ExpandButton
└── IterationDetail (when expanded)
    ├── DetailHeader
    │   ├── FullMetadata (times, session, model)
    │   └── NavigationButtons (prev/next)
    ├── TabNavigation
    │   └── Tab (Output, Tool Calls, Files, Verification)
    ├── TabContent
    │   ├── AgentOutputTab
    │   │   ├── SearchBar
    │   │   ├── OutputViewer
    │   │   └── TokenStats
    │   ├── ToolCallsTab
    │   │   ├── SummaryStats
    │   │   └── ToolCallList
    │   │       └── ToolCallItem (expandable)
    │   ├── FilesTab
    │   │   ├── SummaryStats
    │   │   └── FileChangeList
    │   │       └── FileChange (with diff)
    │   └── VerificationTab
    │       └── VerificationLevel (repeated, collapsible)
    │           └── CheckResult (repeated)
    └── DetailActions
        ├── CopyButton
        ├── DownloadButton
        └── CollapseButton
```

---

## Data Loading Strategy

### Lazy Loading

1. IterationCard shows summary data (already in run response)
2. On expand: Fetch agent result file and verification report
3. Show loading indicator while fetching
4. Cache fetched data for duration of session

### Endpoints

| Data | Source |
|------|--------|
| Summary | Included in GET /api/v1/runs/:id |
| Agent output | GET /api/v1/runs/:id/iterations/:n/agent-result |
| Verification | GET /api/v1/runs/:id/iterations/:n/verification |
| File diffs | GET /api/v1/runs/:id/iterations/:n/files |

---

## Iteration Navigation

### Behavior

- Prev/Next buttons at top of expanded detail
- Keyboard shortcuts: [ for previous, ] for next
- Disabled when at first/last iteration
- Smooth scroll to keep expanded card in view

### State Preservation

- When navigating, maintain current tab selection
- Pre-fetch adjacent iterations for faster navigation
- Show loading briefly if data not cached

---

## File Diff Display

### Diff Format

- Unified diff format
- Color coded: green for additions, red for deletions
- Line numbers for context
- Collapsible hunks

### Large Diffs

- Collapse by default if > 100 lines changed
- "Show all" button to expand
- Virtual scrolling for very large diffs

---

## Search Within Output

### Features

- Real-time search as user types
- Highlight all matches
- Navigate between matches (up/down arrows)
- Case-insensitive by default
- Toggle for regex search

### UI

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔍 [error                     ] [Aa] [.*]   3 of 12  [▲] [▼]   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC9.1 | Iteration card expands on click | Click card |
| AC9.2 | Agent output displays correctly | Check content |
| AC9.3 | Tool calls show with timing | Verify list |
| AC9.4 | Tool call details expandable | Click item |
| AC9.5 | File changes show diffs | Check diff view |
| AC9.6 | Verification levels shown | Check tab |
| AC9.7 | Tab navigation works | Click tabs |
| AC9.8 | Prev/next navigation works | Use buttons |
| AC9.9 | Search highlights matches | Search term |
| AC9.10 | Copy button works | Copy, paste |
| AC9.11 | Download button works | Click, verify file |
| AC9.12 | Loading state shown | Slow network test |
| AC9.13 | Dark mode correct | Toggle theme |
| AC9.14 | Mobile layout works | Test at 375px |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| IterationCard collapse/expand | Toggle state |
| Tab switching | Verify tab content changes |
| ToolCallItem expand | Show details |
| FileChange diff render | Verify diff display |
| Search highlighting | Match highlighting |
| Navigation buttons | Enable/disable logic |

### Integration Tests

| Test | Description |
|------|-------------|
| Load agent result | Fetch on expand |
| Load verification | Fetch on expand |
| Cache behavior | Second expand instant |
| Tab data loading | Each tab loads data |

### E2E Tests

| Test | Description |
|------|-------------|
| Full iteration exploration | Expand, browse tabs |
| Multi-iteration navigation | Navigate through all |
| Search and copy | Search, copy result |
