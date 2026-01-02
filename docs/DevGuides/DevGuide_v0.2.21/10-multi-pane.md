# 10: Thrust 9 - Multi-Pane Mode

## Objective

Implement a multi-pane view similar to tmux, allowing users to monitor multiple runs simultaneously in a split-screen layout with independent scrolling and focus management.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F9.1 | Split screen into 2-4 panes | Must Have |
| F9.2 | Each pane shows independent run | Must Have |
| F9.3 | Focus switching between panes | Must Have |
| F9.4 | Add/remove panes dynamically | Must Have |
| F9.5 | Different layout options | Should Have |
| F9.6 | Pane resizing | Could Have |
| F9.7 | Maximize single pane | Could Have |
| F9.8 | Health pane option | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N9.1 | Handle 4 SSE streams | Must Have |
| N9.2 | Memory efficient | Must Have |
| N9.3 | Smooth focus transitions | Should Have |
| N9.4 | Works at 80x24 minimum | Should Have |

---

## UI Specification

### Two-Pane Layout (Horizontal Split)

```
┌─ AgentGate ─────────────────────────────────────────────────────┐
│ ┌─ Run: FHC3pJst ● [1] ──────┐ ┌─ Run: GZlV380i ● [2] ──────┐ │
│ │ Status: ● building          │ │ Status: ● building          │ │
│ │ Iteration: 2/5              │ │ Iteration: 1/3              │ │
│ │                             │ │                             │ │
│ │ 10:45:32 [read] file.ts    │ │ 10:45:30 [read] main.ts    │ │
│ │ 10:45:33 [edit] file.ts    │ │ 10:45:31 [output] Analyzing │ │
│ │ 10:45:35 [bash] npm build  │ │ 10:45:32 [edit] main.ts    │ │
│ │ ████████░░░░░░░░ 45%       │ │ ████░░░░░░░░░░░░ 20%       │ │
│ └─────────────────────────────┘ └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ [1-2] focus pane [+] add pane [-] remove [=] layout [q]uit      │
└─────────────────────────────────────────────────────────────────┘
```

### Four-Pane Layout (Grid)

```
┌─ AgentGate ─────────────────────────────────────────────────────┐
│ ┌─ Run: FHC3pJst ● [1] ──────┐ ┌─ Run: GZlV380i ● [2] ──────┐ │
│ │ ● building  2/5            │ │ ● building  1/3            │ │
│ │ [edit] orchestrator.ts:234 │ │ [read] run-executor.ts     │ │
│ │ █████████░░░ 45%           │ │ ████░░░░░░░ 20%           │ │
│ └─────────────────────────────┘ └─────────────────────────────┘ │
│ ┌─ Run: x3Uir8xH ✓ [3] ──────┐ ┌─ System Health [4] ────────┐ │
│ │ ✓ succeeded                │ │ ● API: Healthy              │ │
│ │ Duration: 12m 34s          │ │ ● DB: Healthy               │ │
│ │ PR: github.com/...#72      │ │ Active: 3/10                │ │
│ └─────────────────────────────┘ └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ [1-4] focus [+] add [-] remove [=] layout [m]aximize [q]uit     │
└─────────────────────────────────────────────────────────────────┘
```

### Single Pane with Sidebar

```
┌─ AgentGate ─────────────────────────────────────────────────────┐
│ ┌─ Runs ─────┐ ┌─ Run: FHC3pJst ──────────────────────────────┐ │
│ │ ● FHC3pJst │ │ Status: ● building    Iteration: 2/5        │ │
│ │ ● GZlV380i │ │                                              │ │
│ │ ✓ x3Uir8xH │ │ Agent Activity                               │ │
│ │ ✗ abc12345 │ │ ─────────────────────────────────────────── │ │
│ │            │ │ 10:45:32 [read]   orchestrator.ts           │ │
│ │            │ │ 10:45:33 [edit]   orchestrator.ts:234       │ │
│ │            │ │ 10:45:35 [bash]   npm run build             │ │
│ │            │ │ 10:45:38 [output] Build started...          │ │
│ │            │ │ ████████████████████░░░░░░░░░░ 60%          │ │
│ └────────────┘ └──────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ [j/k] select run [Enter] focus [+] add pane [=] layout [q]uit   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layout Options

### Available Layouts

| Layout | Panes | Description |
|--------|-------|-------------|
| Single | 1 | Full screen, one run |
| Horizontal | 2 | Left/right split |
| Vertical | 2 | Top/bottom split |
| Grid | 4 | 2x2 grid |
| Main+Side | 2 | Large main + sidebar list |
| Three Column | 3 | Three equal columns |

### Layout Cycling

```
Press = to cycle:
Single -> Horizontal -> Vertical -> Grid -> Single

Or press = with number:
=2 -> Horizontal
=3 -> Three Column
=4 -> Grid
```

---

## Component Hierarchy

```
MultiPaneView
├── Box (main container)
│   ├── PaneLayout (layout manager)
│   │   ├── Pane (repeated)
│   │   │   ├── PaneHeader
│   │   │   │   └── RunStatus, FocusIndicator
│   │   │   └── PaneContent
│   │   │       └── RunStreamMini or HealthMini or Empty
│   │   └── PaneDivider (between panes)
│   └── KeyHint
└── AddPaneDialog (when adding)
```

---

## Component Specifications

### MultiPaneView

**Location:** `src/components/views/MultiPaneView.tsx`

```
Props: (none - uses store)

Store State:
- panes: Pane[]
- focusedPaneIndex: number
- layout: LayoutType

Behavior:
1. Initialize with 1-4 panes from store
2. Render layout based on type
3. Handle focus switching
4. Handle add/remove pane
5. Manage SSE connections for each pane
```

### Pane Type Definition

```
interface Pane {
  id: string;
  type: 'run' | 'health' | 'empty';
  runId?: string;       // if type === 'run'
  workOrderId?: string; // for display
}
```

### PaneLayout

**Location:** `src/components/panels/PaneLayout.tsx`

```
Props:
{
  panes: Pane[],
  layout: LayoutType,
  focusedIndex: number,
  onFocus: (index: number) => void,
}

Rendering:
- Calculate pane dimensions based on layout
- Render panes with appropriate sizing
- Add dividers between panes
```

### RunStreamMini

**Location:** `src/components/panels/RunStreamMini.tsx`

```
Props:
{
  runId: string,
  isFocused: boolean,
  height: number,
  width: number,
}

Features:
- Compact version of RunStreamView
- Limited event history (last 10 events)
- Status and progress bar
- No tabs (output only)
```

### HealthMini

**Location:** `src/components/panels/HealthMini.tsx`

```
Props:
{
  isFocused: boolean,
  height: number,
  width: number,
}

Features:
- Compact health display
- Status indicators
- Active/max counts
- Auto-refresh
```

### AddPaneDialog

**Location:** `src/components/panels/AddPaneDialog.tsx`

```
Props:
{
  onSelect: (runId: string | 'health') => void,
  onCancel: () => void,
}

Content:
- List of active runs
- Health option
- Empty pane option
```

---

## Pane Management

### Adding Panes

```
1. Press + to open dialog
2. Select run from list or "Health"
3. Pane added to layout
4. New pane gets focus

Maximum 4 panes. If at max:
- Show message: "Maximum 4 panes. Remove one first."
```

### Removing Panes

```
1. Focus pane to remove
2. Press - to remove
3. Adjacent pane gets focus
4. Layout adjusts

Minimum 1 pane. If removing last:
- Show message: "Cannot remove last pane."
```

### Focus Switching

```
Methods:
1. Press 1-4 to focus pane by number
2. Tab to cycle through panes
3. Shift+Tab to cycle backwards
4. Arrow keys within pane for content

Focus Indicator:
- Focused pane has cyan border
- Unfocused panes have gray border
- Pane number shown in header: [1], [2], etc.
```

---

## Keyboard Navigation

### Multi-Pane Global Keys

| Key | Action | Description |
|-----|--------|-------------|
| `1-4` | Focus pane | Switch to pane N |
| `Tab` | Next pane | Cycle to next pane |
| `Shift+Tab` | Prev pane | Cycle to previous pane |
| `+` | Add pane | Open add pane dialog |
| `-` | Remove pane | Remove focused pane |
| `=` | Cycle layout | Change layout style |
| `m` | Maximize | Toggle maximize focused pane |
| `Esc` | Exit multi-pane | Return to single view |
| `q` | Quit | Exit application |

### Within Focused Pane

| Key | Action | Description |
|-----|--------|-------------|
| `j` / `↓` | Scroll down | Scroll event list |
| `k` / `↑` | Scroll up | Scroll event list |
| `g` | Go to top | Scroll to first event |
| `G` | Go to bottom | Scroll to latest event |
| `Space` | Pause/Resume | Toggle event stream |
| `Enter` | Expand | Open full RunStreamView |

---

## SSE Connection Management

### Connection Strategy

```
Each pane with type 'run' maintains SSE connection:
- Connect when pane added
- Disconnect when pane removed
- Reconnect on connection loss

Memory Management:
- Each pane stores max 100 events
- Older events discarded
- Separate event store per pane
```

### Connection States

```
Per-pane status indicators:
● Connected (green dot)
○ Connecting (yellow dot)
✗ Disconnected (red dot)

Display in pane header:
┌─ Run: FHC3pJst ● [1] ────────┐
```

---

## Pane State Store

### src/store/panes.ts

```
State:
{
  panes: Pane[],
  focusedPaneIndex: number,
  layout: LayoutType,
  maximizedPaneId: string | null,
}

Actions:
- addPane(type, runId?): void
- removePane(id): void
- focusPane(index): void
- setLayout(layout): void
- toggleMaximize(id): void
- updatePaneRun(paneId, runId): void
```

---

## Layout Calculation

### Size Calculation

```
Terminal dimensions:
- width: process.stdout.columns
- height: process.stdout.rows

Available space:
- contentHeight = height - 3 (header + footer + border)
- contentWidth = width - 2 (borders)

Pane dimensions (Grid layout, 4 panes):
- paneWidth = Math.floor(contentWidth / 2) - 1 (divider)
- paneHeight = Math.floor(contentHeight / 2) - 1 (divider)

Pane dimensions (Horizontal, 2 panes):
- paneWidth = Math.floor(contentWidth / 2) - 1
- paneHeight = contentHeight
```

### Minimum Dimensions

```
Minimum pane size:
- Width: 30 characters
- Height: 8 lines

If terminal too small:
- Switch to single pane
- Show message: "Terminal too small for multi-pane"
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC9.1 | Two panes display | Split screen visible |
| AC9.2 | Four panes display | Grid layout visible |
| AC9.3 | Focus switches with 1-4 | Focus indicator moves |
| AC9.4 | Tab cycles focus | Focus moves to next |
| AC9.5 | + adds pane | New pane appears |
| AC9.6 | - removes pane | Pane disappears |
| AC9.7 | = changes layout | Layout cycles |
| AC9.8 | Each pane streams | Events update in each |
| AC9.9 | Maximize works | Single pane fills screen |
| AC9.10 | Enter expands | Full view opens |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| Pane renders | Single pane visible |
| Layout calculates | Correct dimensions |
| Focus switches | Index updates |
| Add pane | Array grows |
| Remove pane | Array shrinks |

### Integration Tests

| Test | Description |
|------|-------------|
| Two SSE streams | Both receive events |
| Four SSE streams | All receive events |
| Layout switching | Dimensions adjust |
| Reconnection | Handles disconnect |

### E2E Tests

| Test | Description |
|------|-------------|
| Multi-pane workflow | Add, switch, remove |
| Watch multiple runs | Real streaming |
| Layout transitions | All layouts work |

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `src/components/views/MultiPaneView.tsx` | 150 | Main view |
| `src/components/panels/PaneLayout.tsx` | 100 | Layout manager |
| `src/components/panels/Pane.tsx` | 60 | Single pane |
| `src/components/panels/RunStreamMini.tsx` | 100 | Compact run view |
| `src/components/panels/HealthMini.tsx` | 60 | Compact health |
| `src/components/panels/AddPaneDialog.tsx` | 80 | Add pane dialog |
| `src/store/panes.ts` | 80 | Pane state |
| `src/utils/layout-calc.ts` | 60 | Layout calculations |
| `tests/views/MultiPaneView.test.tsx` | 120 | View tests |

**Total: ~9 files, ~810 lines**
