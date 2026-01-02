# 06: Thrust 5 - Work Orders View

## Objective

Create a comprehensive work order list view with filtering, searching, pagination, and detail navigation. This view allows users to browse all work orders and access individual work order details.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F5.1 | List all work orders | Must Have |
| F5.2 | Filter by status | Must Have |
| F5.3 | Search by prompt/ID | Must Have |
| F5.4 | Keyboard navigation (vim-style) | Must Have |
| F5.5 | View work order details | Must Have |
| F5.6 | Pagination for large lists | Must Have |
| F5.7 | Sort by date/status | Should Have |
| F5.8 | Bulk selection | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N5.1 | Handle 1000+ work orders | Must Have |
| N5.2 | Responsive column widths | Must Have |
| N5.3 | Smooth scrolling | Should Have |

---

## UI Specification

### Work Order List View

```
┌─ Work Orders ─────────────────────────────────── Filter: All ┐
│                                                              │
│  [/] Search: ________________________________                │
│                                                              │
│  Status    ID          Prompt                     Created    │
│  ──────────────────────────────────────────────────────────  │
│ ▶● running  FHC3pJst   Phase 3 implementation     2m ago    │
│  ● running  GZlV380i   Fix issue #65              5m ago    │
│  ✓ success  x3Uir8xH   Fix sandbox default       12m ago    │
│  ✓ success  VMARSZ6w   Fix empty errors          15m ago    │
│  ✗ failed   abc12345   Build optimization         1h ago    │
│  ✓ success  def67890   Add logging                2h ago    │
│  ○ queued   ghi11111   Refactor tests             2h ago    │
│                                                              │
│  Showing 1-7 of 47                             Page 1 of 7   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [↑↓] navigate [enter] view [f]ilter [n]ew [/] search [q]uit │
└──────────────────────────────────────────────────────────────┘
```

### Work Order Detail View

```
┌─ Work Order: FHC3pJst ─────────────────────────────────────────┐
│                                                                 │
│  Status: ● running          Created: Jan 2, 2026 10:00 AM      │
│  Profile: default           Repository: owner/repo              │
│                                                                 │
│  Prompt                                                         │
│  ───────────────────────────────────────────────────────────── │
│  Implement Phase 3 of the v0.2.19 Observability refactor.      │
│  Focus on workspace management and sandbox improvements.        │
│                                                                 │
│  Runs (3)                                                       │
│  ───────────────────────────────────────────────────────────── │
│  #  Status     Started        Duration    Iterations           │
│  1  ✓ success  10:00:00 AM    12m 34s     3/3                  │
│  2  ✗ failed   10:15:00 AM    5m 12s      2/3 (L1 failed)      │
│ ▶3  ● running  10:25:00 AM    2m 34s      1/3 (building)       │
│                                                                 │
│  PR: https://github.com/owner/repo/pull/72                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [↑↓] select run [enter] stream [t]rigger [c]ancel [←] back     │
└─────────────────────────────────────────────────────────────────┘
```

### Filter Panel

```
When pressing [f]:

┌─ Filter ─────────────────────────────────┐
│                                          │
│  Status:                                 │
│    ( ) All                               │
│    ( ) Running                           │
│    (●) Failed                            │
│    ( ) Succeeded                         │
│    ( ) Queued                            │
│    ( ) Cancelled                         │
│                                          │
│  Sort By:                                │
│    (●) Created (newest)                  │
│    ( ) Created (oldest)                  │
│    ( ) Status                            │
│                                          │
│  [Enter] Apply  [Esc] Cancel             │
└──────────────────────────────────────────┘
```

---

## Component Hierarchy

```
WorkOrdersView
├── Box (main container)
│   ├── Header (title + filter indicator)
│   ├── SearchInput (optional, shown with /)
│   ├── WorkOrderTable
│   │   ├── TableHeader
│   │   └── WorkOrderRow (repeated)
│   ├── Pagination
│   └── KeyHint
└── FilterPanel (overlay when active)

WorkOrderDetailView
├── Box (main container)
│   ├── WorkOrderHeader
│   ├── PromptSection
│   ├── RunsTable
│   │   └── RunRow (repeated)
│   ├── PRLink (if exists)
│   └── KeyHint
```

---

## Component Specifications

### WorkOrdersView

**Location:** `src/components/views/WorkOrdersView.tsx`

```
Props: (none - uses hooks and store)

State:
- selectedIndex: number
- searchQuery: string
- searchActive: boolean
- filterPanelOpen: boolean

Hooks:
- useWorkOrders({ status, search, page, limit })
- useKeyboard() for navigation
- useNavigation() for view changes

Behavior:
1. Fetch work orders on mount
2. Re-fetch when filter/search changes
3. Handle keyboard navigation
4. Open filter panel on 'f'
5. Activate search on '/'
```

### WorkOrderRow

**Location:** `src/components/panels/WorkOrderRow.tsx`

```
Props:
{
  workOrder: WorkOrder,
  isSelected: boolean,
  onSelect: () => void,
}

Columns:
- Status badge (icon + short text)
- ID (first 8 chars)
- Prompt (truncated to fit)
- Created (relative time)

Selection:
- Background color inverts when selected
- Cursor indicator (▶) when selected
```

### WorkOrderDetailView

**Location:** `src/components/views/WorkOrderDetailView.tsx`

```
Props:
{
  workOrderId: string,
}

State:
- selectedRunIndex: number

Hooks:
- useWorkOrder(workOrderId)
- useKeyboard()

Sections:
1. Header with status and metadata
2. Full prompt text
3. Runs table (selectable)
4. PR link if exists
```

### FilterPanel

**Location:** `src/components/panels/FilterPanel.tsx`

```
Props:
{
  currentFilter: FilterState,
  onApply: (filter: FilterState) => void,
  onCancel: () => void,
}

FilterState:
{
  status: WorkOrderStatus | 'all',
  sortBy: 'created_desc' | 'created_asc' | 'status',
}

Behavior:
- Radio buttons for status
- Radio buttons for sort
- Enter to apply
- Escape to cancel
```

### SearchInput

**Location:** `src/components/panels/SearchInput.tsx`

```
Props:
{
  value: string,
  onChange: (value: string) => void,
  onSubmit: () => void,
  onCancel: () => void,
  placeholder?: string,
}

Behavior:
- Focus on mount
- Update on each keystroke
- Submit on Enter
- Cancel on Escape
- Clear on Ctrl+U
```

---

## Data Requirements

### Work Order List API

```
GET /api/v1/work-orders

Query Parameters:
- status: Filter by status
- search: Search in prompt and ID
- page: Page number (1-based)
- limit: Items per page (default: 10)
- sortBy: created_desc | created_asc | status

Response:
{
  data: WorkOrder[],
  total: number,
  page: number,
  limit: number,
  totalPages: number,
}
```

### Work Order Detail

```
WorkOrder shape:
{
  id: string,
  taskPrompt: string,
  status: WorkOrderStatus,
  repoUrl: string,
  profileName: string,
  createdAt: string,
  updatedAt: string,
  prUrl: string | null,
  runs: Run[],
}

Run shape:
{
  id: string,
  number: number,
  status: RunStatus,
  startedAt: string,
  completedAt: string | null,
  iterations: Iteration[],
  currentIteration: number,
  maxIterations: number,
}
```

---

## Keyboard Navigation

### Work Order List

| Key | Action | Description |
|-----|--------|-------------|
| `j` / `↓` | Move down | Select next work order |
| `k` / `↑` | Move up | Select previous work order |
| `Enter` | Open detail | Navigate to work order detail |
| `g` | Go to top | Select first work order |
| `G` | Go to bottom | Select last work order |
| `/` | Search | Activate search input |
| `f` | Filter | Open filter panel |
| `n` | New | Create new work order |
| `←` / `Esc` | Back | Return to dashboard |
| `q` | Quit | Exit application |

### Work Order Detail

| Key | Action | Description |
|-----|--------|-------------|
| `j` / `↓` | Select next run | Move selection down |
| `k` / `↑` | Select previous run | Move selection up |
| `Enter` | Stream run | Navigate to run stream |
| `t` | Trigger run | Start new run |
| `c` | Cancel | Cancel work order |
| `p` | Open PR | Open PR URL in browser |
| `←` / `Esc` | Back | Return to list |

### Filter Panel

| Key | Action | Description |
|-----|--------|-------------|
| `j` / `↓` | Next option | Move to next radio |
| `k` / `↑` | Previous option | Move to previous radio |
| `Space` | Select | Select current option |
| `Enter` | Apply | Apply filter and close |
| `Esc` | Cancel | Close without applying |

### Search Mode

| Key | Action | Description |
|-----|--------|-------------|
| `<chars>` | Type | Add to search query |
| `Backspace` | Delete | Remove last character |
| `Ctrl+U` | Clear | Clear entire query |
| `Enter` | Search | Execute search |
| `Esc` | Cancel | Clear and exit search |

---

## Pagination

### Behavior

```
- Show 7-10 items per page (based on terminal height)
- Display "Showing X-Y of Z" and "Page N of M"
- Navigate pages with [ and ] keys
- Jump to first/last page with { and }
```

### Calculation

```
const itemsPerPage = Math.max(5, terminalHeight - 10);
const totalPages = Math.ceil(totalItems / itemsPerPage);
const startItem = (page - 1) * itemsPerPage + 1;
const endItem = Math.min(page * itemsPerPage, totalItems);
```

---

## States

### Loading State

```
┌─ Work Orders ────────────────────────────────────────────────┐
│                                                              │
│                    ⠋ Loading work orders...                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Empty State

```
┌─ Work Orders ────────────────────────────────────────────────┐
│                                                              │
│                    No work orders found                      │
│                                                              │
│                  Press [n] to create one                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### No Results State

```
┌─ Work Orders ─────────────────────── Filter: Failed ─────────┐
│                                                              │
│  [/] Search: authentication                                  │
│                                                              │
│              No work orders match your search                │
│                                                              │
│              [c]lear search  [r]eset filter                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC5.1 | Work orders list displays | Shows all work orders |
| AC5.2 | Status filter works | Only filtered items shown |
| AC5.3 | Search works | Matching items shown |
| AC5.4 | j/k navigation works | Selection moves |
| AC5.5 | Enter opens detail | Detail view loads |
| AC5.6 | Pagination works | Can navigate pages |
| AC5.7 | Detail shows runs | Runs table visible |
| AC5.8 | Run selection works | Can select and open |
| AC5.9 | Filter panel works | Opens, applies filter |
| AC5.10 | Empty state shown | Message when no data |
| AC5.11 | Back navigation works | Returns to previous |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| WorkOrdersView renders | No crash |
| WorkOrderRow renders | Shows all columns |
| Selection highlighting | Selected row inverted |
| Filter panel opens | Shows on 'f' |
| Search input activates | Shows on '/' |
| Pagination calculates | Correct page numbers |

### Integration Tests

| Test | Description |
|------|-------------|
| Fetches on mount | API called with defaults |
| Filter changes fetch | API called with filter |
| Search changes fetch | API called with search |
| Navigation to detail | Correct ID passed |
| Pagination fetches | API called with page |

### E2E Tests

| Test | Description |
|------|-------------|
| Browse work orders | Navigate list, view detail |
| Filter and search | Apply filter, search, clear |
| Full navigation flow | Dashboard -> List -> Detail -> Run |

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `src/components/views/WorkOrdersView.tsx` | 150 | List view |
| `src/components/views/WorkOrderDetailView.tsx` | 120 | Detail view |
| `src/components/panels/WorkOrderRow.tsx` | 50 | Row component |
| `src/components/panels/FilterPanel.tsx` | 80 | Filter overlay |
| `src/components/panels/SearchInput.tsx` | 60 | Search input |
| `src/components/panels/Pagination.tsx` | 40 | Pagination controls |
| `src/store/workorders.ts` | 50 | Work order state |
| `tests/views/WorkOrdersView.test.tsx` | 120 | View tests |

**Total: ~8 files, ~670 lines**
