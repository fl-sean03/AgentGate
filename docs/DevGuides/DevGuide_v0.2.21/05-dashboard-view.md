# 05: Thrust 4 - Dashboard View

## Objective

Create the main dashboard view displaying system statistics, recent work orders, and quick navigation to other views. This is the default landing screen when launching the TUI.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F4.1 | Display work order statistics | Must Have |
| F4.2 | Display run statistics | Must Have |
| F4.3 | Display system health status | Must Have |
| F4.4 | List recent work orders | Must Have |
| F4.5 | Navigate to work order on select | Must Have |
| F4.6 | Keyboard shortcuts for navigation | Must Have |
| F4.7 | Auto-refresh data periodically | Should Have |
| F4.8 | Manual refresh on keypress | Should Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N4.1 | Initial load < 2 seconds | Must Have |
| N4.2 | Works at 80 column width | Must Have |
| N4.3 | Graceful degradation on error | Should Have |

---

## UI Specification

### Layout Structure

```
┌─ AgentGate ─────────────────────────────────────────────────┐
│                                                             │
│  STATS ROW                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Work Orders │  │    Runs     │  │   System    │         │
│  │             │  │             │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  RECENT WORK ORDERS                                         │
│  ─────────────────────────────────────────────────────────  │
│  Status  ID        Prompt                        Created    │
│  ──────────────────────────────────────────────────────────│
│  ● run   FHC3pJst  Phase 3 implementation        2m ago    │
│  ● run   GZlV380i  Fix issue #65                 5m ago    │
│  ✓ ok    x3Uir8xH  Fix sandbox default          12m ago    │
│  ✗ fail  abc12345  Build optimization            1h ago    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [d]ashboard [w]ork-orders [r]uns [n]ew [q]uit    ? for help│
└─────────────────────────────────────────────────────────────┘
```

### Stats Row

```
Three stat cards displayed horizontally:

┌─ Work Orders ──────┐  ┌─ Runs ─────────────┐  ┌─ System ─────────┐
│ Total:    47       │  │ Active:   3        │  │ Status: ● Healthy│
│ Running:   3       │  │ Today:   12        │  │ Uptime:   4d 2h  │
│ Failed:    2       │  │ Success: 89%       │  │ Capacity: 3/10   │
│ Queued:    1       │  │                    │  │                  │
└────────────────────┘  └────────────────────┘  └──────────────────┘

Work Orders Card:
- Total: Count of all work orders
- Running: Count with status 'running'
- Failed: Count with status 'failed'
- Queued: Count with status 'queued'

Runs Card:
- Active: Runs currently in progress
- Today: Runs started today
- Success: Success rate percentage

System Card:
- Status: Health indicator (●/○ + text)
- Uptime: Server uptime formatted
- Capacity: Active/max concurrent
```

### Recent Work Orders List

```
Section Title: "Recent Work Orders"

Table Columns:
| Column | Width | Content |
|--------|-------|---------|
| Status | 8 | Badge with icon |
| ID | 10 | Work order short ID |
| Prompt | flex | Task prompt (truncated) |
| Created | 10 | Relative time |

Row Selection:
- Arrow keys move selection
- Enter navigates to work order
- Selected row has inverse colors
- Show 5-10 recent, based on terminal height

Empty State:
"No work orders yet. Press [n] to create one."
```

### Status Bar (Bottom)

```
Format: [key]action [key]action ... ? for help

Hints:
- [d]ashboard - Current view (highlight)
- [w]ork-orders - Go to work order list
- [r]uns - Go to runs list
- [n]ew - Create new work order
- [q]uit - Exit application
- ? - Show help panel
```

---

## Component Hierarchy

```
DashboardView
├── Box (main container)
│   ├── Text (title: "AgentGate")
│   ├── StatsRow
│   │   ├── StatsCard (Work Orders)
│   │   ├── StatsCard (Runs)
│   │   └── StatsCard (System)
│   ├── Divider
│   └── RecentWorkOrders
│       ├── Text (section title)
│       └── Table (work orders)
├── Divider
└── KeyHint (bottom bar)
```

---

## Component Specifications

### DashboardView

**Location:** `src/components/views/DashboardView.tsx`

```
Props: (none - uses hooks)

State:
- selectedIndex: number (selected work order)
- isRefreshing: boolean

Hooks Used:
- useWorkOrders({ limit: 10 })
- useHealth()
- useKeyboard() for navigation

Behavior:
1. Fetch data on mount
2. Auto-refresh every 10 seconds
3. j/k or arrows to navigate list
4. Enter to view selected work order
5. r to manual refresh
```

### StatsCard

**Location:** `src/components/panels/StatsCard.tsx`

```
Props:
{
  title: string,
  stats: Array<{ label: string, value: string | number, color?: string }>,
  width?: number,
}

Rendering:
- Box with title
- Each stat as "Label: Value" line
- Optional color for value (e.g., red for failures)
```

### StatsRow

**Location:** `src/components/panels/StatsRow.tsx`

```
Props:
{
  workOrderStats: WorkOrderStats,
  runStats: RunStats,
  health: HealthStatus,
}

Rendering:
- Flex row with three StatsCard components
- Equal width distribution
- Responsive: stack vertically if narrow terminal
```

### RecentWorkOrders

**Location:** `src/components/panels/RecentWorkOrders.tsx`

```
Props:
{
  workOrders: WorkOrder[],
  selectedIndex: number,
  onSelect: (index: number) => void,
  onNavigate: (workOrder: WorkOrder) => void,
}

Rendering:
- Section title
- Table with work orders
- Row highlighting for selection
```

---

## Data Requirements

### Work Order Stats

```
Derived from GET /api/v1/work-orders

Calculate:
- total: workOrders.length
- running: workOrders.filter(w => w.status === 'running').length
- failed: workOrders.filter(w => w.status === 'failed').length
- queued: workOrders.filter(w => w.status === 'queued').length
```

### Run Stats

```
Derived from GET /api/v1/work-orders (includes run counts)

Calculate:
- active: Sum of work orders with active runs
- today: Count runs with createdAt today
- successRate: (succeeded / total) * 100
```

### Health Status

```
From GET /health

Fields:
- status: 'healthy' | 'degraded' | 'unhealthy'
- uptime: number (seconds)
- limits.activeWorkOrders: number
- limits.maxConcurrentWorkOrders: number
```

---

## Keyboard Navigation

### Dashboard Shortcuts

| Key | Action | Handler |
|-----|--------|---------|
| `j` / `↓` | Select next work order | `setSelectedIndex(i + 1)` |
| `k` / `↑` | Select previous work order | `setSelectedIndex(i - 1)` |
| `Enter` | View selected work order | `navigate('work-order', id)` |
| `w` | Go to work orders list | `navigate('work-orders')` |
| `n` | Create new work order | `navigate('create')` |
| `r` | Refresh data | `refetch()` |
| `q` | Quit application | `exit()` |
| `?` | Show help | `showHelp()` |

### Focus Management

```
Focus Flow:
1. Recent work orders list has focus by default
2. Selected index starts at 0
3. Wrap around: going past end goes to start
4. Remember selected index when returning to view
```

---

## Loading States

### Initial Load

```
While fetching data:
┌─ AgentGate ─────────────────────────────────────────────────┐
│                                                             │
│                    ⠋ Loading...                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Refresh Load

```
While refreshing (data already displayed):
- Show small spinner in corner
- Keep existing data visible
- Replace data atomically when ready
```

### Error State

```
On fetch failure:
┌─ AgentGate ─────────────────────────────────────────────────┐
│                                                             │
│  ┌─ Error ─────────────────────────────────────────────┐   │
│  │ Cannot connect to server                             │   │
│  │                                                      │   │
│  │ Check that AgentGate is running at:                  │   │
│  │ http://localhost:3000                                │   │
│  │                                                      │   │
│  │ [r]etry                                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Responsive Behavior

### Wide Terminal (120+ cols)

```
Stats cards side by side, full text:
┌─ Work Orders ────┐ ┌─ Runs ───────────┐ ┌─ System ─────────┐
│ Total:      47   │ │ Active:      3   │ │ Status: ● Healthy│
│ Running:     3   │ │ Today:      12   │ │ Uptime:   4d 2h  │
│ Failed:      2   │ │ Success:   89%   │ │ Capacity: 3/10   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Normal Terminal (80-119 cols)

```
Stats cards side by side, abbreviated:
┌─ Work Orders ─┐ ┌─ Runs ──────┐ ┌─ System ────┐
│ Total:   47   │ │ Active:  3  │ │ ● Healthy   │
│ Running:  3   │ │ Today:  12  │ │ Up: 4d 2h   │
│ Failed:   2   │ │ Rate:  89%  │ │ Cap: 3/10   │
└───────────────┘ └─────────────┘ └─────────────┘
```

### Narrow Terminal (< 80 cols)

```
Stats cards stacked vertically:
┌─ Work Orders ───────────────────┐
│ Total: 47  Running: 3  Failed: 2│
└─────────────────────────────────┘
┌─ System ● Healthy ──────────────┐
│ Uptime: 4d 2h    Capacity: 3/10 │
└─────────────────────────────────┘
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC4.1 | Work order stats display | Show counts |
| AC4.2 | Run stats display | Show active, today, rate |
| AC4.3 | Health status shows | Icon + text |
| AC4.4 | Recent work orders list | Shows 5+ items |
| AC4.5 | j/k navigation works | Selection moves |
| AC4.6 | Enter opens work order | Navigation occurs |
| AC4.7 | Auto-refresh works | Data updates |
| AC4.8 | r manual refresh | Data updates |
| AC4.9 | Loading state shows | Spinner visible |
| AC4.10 | Error state shows | Error message visible |
| AC4.11 | Empty state works | Message when no data |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| DashboardView renders | No crash |
| StatsCard renders | Shows title and stats |
| StatsRow layout | Three cards visible |
| RecentWorkOrders render | Table with rows |
| Empty state | Shows message when empty |
| Loading state | Shows spinner |
| Error state | Shows error box |

### Integration Tests

| Test | Description |
|------|-------------|
| Fetches data on mount | API called |
| Navigation works | Pressing Enter navigates |
| Refresh updates data | New data appears |
| Stats calculate correctly | Counts match data |

### E2E Tests

| Test | Description |
|------|-------------|
| Dashboard loads | View renders with data |
| Navigate to work order | Select and enter |
| Keyboard navigation | Full flow with keys |

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `src/components/views/DashboardView.tsx` | 120 | Main view |
| `src/components/panels/StatsCard.tsx` | 40 | Stats card |
| `src/components/panels/StatsRow.tsx` | 50 | Stats row |
| `src/components/panels/RecentWorkOrders.tsx` | 60 | Work order list |
| `src/hooks/useHealth.ts` | 40 | Health hook |
| `tests/views/DashboardView.test.tsx` | 100 | View tests |

**Total: ~6 files, ~410 lines**
