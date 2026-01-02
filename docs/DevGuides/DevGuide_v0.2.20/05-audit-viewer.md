# 05: Thrust 4 - Audit Trail Viewer

## Objective

Implement audit trail viewing capabilities that show configuration history for work orders and the specific configuration snapshot used for each run.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F4.1 | Show audit timeline on WorkOrderDetail page | Must Have |
| F4.2 | Display configuration snapshot used for each run | Must Have |
| F4.3 | Show which profile was used and its resolved config | Must Have |
| F4.4 | Display timestamp of each configuration capture | Must Have |
| F4.5 | Allow expanding/collapsing JSON config sections | Must Have |
| F4.6 | Show diff between consecutive snapshots | Should Have |
| F4.7 | Link snapshot entries to their corresponding runs | Should Have |
| F4.8 | Filter audit entries by date range | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N4.1 | Audit section loads within 500ms | Must Have |
| N4.2 | Large configs render without performance issues | Must Have |
| N4.3 | Works on mobile viewport | Must Have |
| N4.4 | Supports dark mode | Must Have |

---

## API Endpoints

### Get Audit Records for Work Order

**Endpoint:** GET /api/v1/work-orders/:id/audit

**Response:**
```
{
  "success": true,
  "data": [
    {
      "snapshotId": "snap-001",
      "runId": "run-abc123",
      "runNumber": 1,
      "profileName": "default",
      "profileChain": ["default"],
      "config": {
        "loopStrategy": { "mode": "iterative", "maxIterations": 5 },
        "verification": { "waitForCI": true },
        ...
      },
      "capturedAt": "2026-01-02T10:00:00Z"
    },
    {
      "snapshotId": "snap-002",
      "runId": "run-def456",
      "runNumber": 2,
      "profileName": "fast-iteration",
      "profileChain": ["fast-iteration", "default"],
      "config": {
        "loopStrategy": { "mode": "iterative", "maxIterations": 3 },
        "verification": { "waitForCI": false },
        ...
      },
      "capturedAt": "2026-01-02T11:00:00Z"
    }
  ]
}
```

### Get Specific Run Audit

**Endpoint:** GET /api/v1/audit/runs/:runId

**Response:**
```
{
  "success": true,
  "data": {
    "snapshotId": "snap-001",
    "runId": "run-abc123",
    "profileName": "default",
    "profileChain": ["default"],
    "config": { ... },
    "overrides": {
      "loopStrategy.maxIterations": {
        "original": 5,
        "override": 3,
        "source": "work-order-request"
      }
    },
    "capturedAt": "2026-01-02T10:00:00Z"
  }
}
```

---

## User Interface Specification

### Audit Section on WorkOrderDetail Page

**Placement:** Below the runs list, collapsible section

```
┌─────────────────────────────────────────────────────────────────┐
│ Work Order: abc123                                              │
├─────────────────────────────────────────────────────────────────┤
│ Runs (2)                                                        │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Run #1  succeeded  10:00 AM                                 │ │
│ │ Run #2  failed     11:00 AM                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ▼ Configuration History (2 snapshots)                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │  ○─────────────────○                                        │ │
│ │  │                 │                                        │ │
│ │  Run #1            Run #2                                   │ │
│ │  10:00 AM          11:00 AM                                 │ │
│ │  Profile: default  Profile: fast-iteration                 │ │
│ │  [View Config]     [View Config] [Compare to #1]            │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Audit Timeline Entry

Each entry in the timeline shows:

| Element | Description |
|---------|-------------|
| Timeline dot | Connected to other entries with line |
| Run reference | "Run #1" with link to run detail |
| Timestamp | When config was captured |
| Profile name | Which profile was used |
| Profile chain | Inheritance path (if extended) |
| View Config button | Opens config viewer modal/panel |
| Compare button | Opens diff view (if previous exists) |

### Configuration Viewer

**Modal or slide-out panel showing full config:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Configuration Snapshot                                    [X]   │
├─────────────────────────────────────────────────────────────────┤
│ Run: #1 (run-abc123)                                            │
│ Captured: Jan 2, 2026 at 10:00:00 AM                           │
│ Profile: default                                                │
│ Inheritance: (none)                                             │
├─────────────────────────────────────────────────────────────────┤
│ ▼ loopStrategy                                                  │
│   ├── mode: "iterative"                                         │
│   └── maxIterations: 5                                          │
│                                                                 │
│ ▼ verification                                                  │
│   ├── waitForCI: true                                           │
│   ├── skipLevels: []                                            │
│   ├── localRetryEnabled: true                                   │
│   └── ciRetryEnabled: true                                      │
│                                                                 │
│ ▶ limits (collapsed)                                            │
│ ▶ github (collapsed)                                            │
│ ▶ agent (collapsed)                                             │
├─────────────────────────────────────────────────────────────────┤
│                                              [Copy JSON] [Close]│
└─────────────────────────────────────────────────────────────────┘
```

### Configuration Diff View

**When comparing two snapshots:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Compare Configurations                                    [X]   │
├─────────────────────────────────────────────────────────────────┤
│ Run #1 (10:00 AM)              →    Run #2 (11:00 AM)          │
│ Profile: default                    Profile: fast-iteration    │
├─────────────────────────────────────────────────────────────────┤
│ Changes:                                                        │
│                                                                 │
│ loopStrategy.maxIterations                                      │
│   - 5                                                           │
│   + 3                                                           │
│                                                                 │
│ verification.waitForCI                                          │
│   - true                                                        │
│   + false                                                       │
│                                                                 │
│ verification.skipLevels                                         │
│   - []                                                          │
│   + ["L2"]                                                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                          [Close]│
└─────────────────────────────────────────────────────────────────┘
```

### Config Snapshot on RunDetail Page

**Embedded section showing config used for this specific run:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Run: run-abc123                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Status: succeeded                                               │
│ Duration: 5m 32s                                                │
│ Iterations: 3                                                   │
├─────────────────────────────────────────────────────────────────┤
│ ▼ Configuration Used                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Profile: fast-iteration → default                           │ │
│ │ Captured: Jan 2, 2026 at 11:00:00 AM                        │ │
│ │                                                             │ │
│ │ Key Settings:                                               │ │
│ │ • Max Iterations: 3                                         │ │
│ │ • Wait for CI: false                                        │ │
│ │ • Skip Levels: L2                                           │ │
│ │                                                             │ │
│ │ [View Full Config]                                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Iterations                                                      │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

### WorkOrderDetail Integration

```
WorkOrderDetailPage
├── ... (existing components)
├── RunsList
└── AuditSection (NEW)
    ├── SectionHeader ("Configuration History")
    ├── AuditTimeline
    │   └── AuditTimelineEntry (repeated)
    │       ├── TimelineDot
    │       ├── RunReference
    │       ├── Timestamp
    │       ├── ProfileInfo
    │       ├── ViewConfigButton
    │       └── CompareButton
    ├── ConfigViewerModal
    │   ├── ModalHeader
    │   ├── ConfigMetadata
    │   └── ConfigTree (collapsible)
    └── ConfigDiffModal
        ├── ModalHeader
        ├── SnapshotComparison
        └── DiffList
```

### RunDetail Integration

```
RunDetailPage
├── ... (existing components)
└── ConfigSnapshotSection (NEW)
    ├── SectionHeader ("Configuration Used")
    ├── ProfileChain
    ├── CaptureTimestamp
    ├── KeySettingsSummary
    └── ViewFullConfigButton → ConfigViewerModal
```

---

## Data Flow

### Loading Audit Data

1. WorkOrderDetail mounts
2. Fetch work order details (existing)
3. Fetch audit records via GET /api/v1/work-orders/:id/audit
4. Render timeline with audit entries
5. On "View Config" click: Show modal with full config
6. On "Compare" click: Show diff modal comparing to previous

### Loading Run Config

1. RunDetail mounts
2. Fetch run details (existing)
3. Fetch run audit via GET /api/v1/audit/runs/:runId
4. Render config snapshot section with key settings
5. On "View Full Config" click: Show modal with full config

---

## Diff Algorithm

### Comparing Two Configs

1. Flatten both config objects to dot-notation paths
2. Identify added paths (in new, not in old)
3. Identify removed paths (in old, not in new)
4. Identify changed paths (in both, different values)
5. Group changes by top-level section
6. Render with color coding:
   - Red/strikethrough for removed
   - Green for added
   - Yellow for changed

### Example Flattening

```
Input:
{
  "loopStrategy": {
    "mode": "iterative",
    "maxIterations": 5
  }
}

Output:
{
  "loopStrategy.mode": "iterative",
  "loopStrategy.maxIterations": 5
}
```

---

## Collapsible Config Tree

### Behavior

- Top-level sections collapsed by default
- Click to expand/collapse
- Expand all / Collapse all buttons
- Remember expansion state during session

### Visual Indicators

| State | Icon |
|-------|------|
| Collapsed (has children) | ▶ |
| Expanded (has children) | ▼ |
| Leaf node (no children) | (none) |

### Value Formatting

| Type | Format |
|------|--------|
| String | "value" (quoted, syntax highlighted) |
| Number | 123 (no quotes, number color) |
| Boolean | true/false (keyword color) |
| Null | null (keyword color, italic) |
| Array | [n items] when collapsed |
| Object | {n keys} when collapsed |

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC4.1 | Audit section appears on WorkOrderDetail | Navigate to work order |
| AC4.2 | Timeline shows all snapshots | Verify count matches API |
| AC4.3 | Each entry shows run, time, profile | Inspect entries |
| AC4.4 | View Config opens modal | Click button |
| AC4.5 | Config tree is collapsible | Click sections |
| AC4.6 | Compare shows diff | Click compare button |
| AC4.7 | Diff highlights changes | Verify color coding |
| AC4.8 | RunDetail shows config section | Navigate to run |
| AC4.9 | Key settings summary accurate | Compare to full config |
| AC4.10 | Copy JSON works | Click copy, paste |
| AC4.11 | Section collapses | Click header |
| AC4.12 | Works on mobile | Test at 375px |
| AC4.13 | Dark mode correct | Toggle theme |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| AuditTimeline renders entries | Pass mock data, verify rendered |
| AuditTimelineEntry shows metadata | Verify run, time, profile shown |
| ConfigTree collapses | Click section, verify collapsed |
| ConfigTree expands | Click section, verify expanded |
| ConfigDiff identifies changes | Pass two configs, verify diff |
| ConfigDiff color coding | Verify add/remove/change colors |

### Integration Tests

| Test | Description |
|------|-------------|
| Load audit from API | Mock API, verify timeline populated |
| View config modal opens | Click button, verify modal |
| Compare modal opens | Click compare, verify diff modal |
| RunDetail config section | Load run, verify config shown |

### E2E Tests

| Test | Description |
|------|-------------|
| Full audit flow | Create WO, run, verify audit appears |
| Config comparison | Multiple runs, compare configs |
