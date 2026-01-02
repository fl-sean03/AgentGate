# 09: Thrust 8 - Advanced Filters

## Objective

Implement comprehensive filtering capabilities for the work order list, including date range selection, multi-status filtering, repository search, and agent type filtering, with filter state persisted in URL query parameters.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F8.1 | Filter by multiple statuses simultaneously | Must Have |
| F8.2 | Filter by date range (created/updated) | Must Have |
| F8.3 | Quick date presets (today, 7d, 30d, custom) | Must Have |
| F8.4 | Filter by repository (text search) | Must Have |
| F8.5 | Filter by agent type | Must Have |
| F8.6 | Free text search (prompt, ID) | Must Have |
| F8.7 | Persist filters in URL query params | Must Have |
| F8.8 | Clear all filters button | Must Have |
| F8.9 | Show active filter count | Should Have |
| F8.10 | Save filter presets | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N8.1 | Filter changes apply within 300ms | Must Have |
| N8.2 | URL remains shareable | Must Have |
| N8.3 | Back/forward respects filter changes | Must Have |
| N8.4 | Works on mobile viewport | Must Have |

---

## Filter Types

### Status Filter (Multi-select)

| Option | Value | Description |
|--------|-------|-------------|
| Queued | queued | Waiting to start |
| Running | running | Currently executing |
| Succeeded | succeeded | Completed successfully |
| Failed | failed | Completed with failure |

### Date Range Filter

**Presets:**
| Preset | Value | Description |
|--------|-------|-------------|
| Today | today | Created today |
| Last 7 days | 7d | Created in last 7 days |
| Last 30 days | 30d | Created in last 30 days |
| This month | month | Created this calendar month |
| Custom | custom | User-defined range |

**Custom Range:**
- Start date picker
- End date picker
- Validates end > start

### Repository Filter (Text)

- Free text input
- Matches against repository name (owner/repo)
- Debounced search (300ms)
- Case-insensitive

### Agent Type Filter (Single/Multi-select)

| Option | Value |
|--------|-------|
| Claude Code (Subscription) | claude-code-subscription |
| Claude Code (API) | claude-code-api |
| OpenCode | opencode |

### Search Filter (Text)

- Searches across: prompt, work order ID
- Debounced (300ms)
- Highlights matches in results (optional)

---

## User Interface Specification

### Filter Bar Design

**Collapsed (default on mobile, optional on desktop):**

```
┌─────────────────────────────────────────────────────────────────┐
│ Work Orders                                                     │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 [Search...                    ] [Filters (3)] [Clear All]   │
├─────────────────────────────────────────────────────────────────┤
│ Active: Status: Running, Failed | Date: Last 7 days            │
├─────────────────────────────────────────────────────────────────┤
│ (work order list)                                               │
└─────────────────────────────────────────────────────────────────┘
```

**Expanded:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Work Orders                                                     │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 [Search prompt or ID...                                    ] │
├─────────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────────────┐  │
│ │ Status    ▼   │ │ Date Range ▼  │ │ Agent Type    ▼       │  │
│ │ ☑ Running     │ │ ○ Today       │ │ ☑ claude-code-sub     │  │
│ │ ☑ Failed      │ │ ● Last 7 days │ │ ☐ claude-code-api     │  │
│ │ ☐ Succeeded   │ │ ○ Last 30 days│ │ ☐ opencode            │  │
│ │ ☐ Queued      │ │ ○ Custom...   │ │                       │  │
│ └───────────────┘ └───────────────┘ └───────────────────────┘  │
│                                                                 │
│ Repository: [owner/repo...                           ]          │
│                                                                 │
│                                        [Clear All] [Apply]      │
├─────────────────────────────────────────────────────────────────┤
│ Showing 15 of 47 work orders                                    │
├─────────────────────────────────────────────────────────────────┤
│ (work order list)                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Filter Components

#### MultiSelect Dropdown

```
┌─────────────────────────────────────┐
│ Status                          ▼   │
├─────────────────────────────────────┤
│ ☑ Running                           │
│ ☑ Failed                            │
│ ☐ Succeeded                         │
│ ☐ Queued                            │
├─────────────────────────────────────┤
│ [Select All] [Clear]                │
└─────────────────────────────────────┘
```

#### Date Range Picker

```
┌─────────────────────────────────────┐
│ Date Range                      ▼   │
├─────────────────────────────────────┤
│ ○ Today                             │
│ ● Last 7 days                       │
│ ○ Last 30 days                      │
│ ○ This month                        │
│ ○ Custom                            │
├─────────────────────────────────────┤
│ Start: [Jan 1, 2026   ] 📅          │
│ End:   [Jan 7, 2026   ] 📅          │
├─────────────────────────────────────┤
│                            [Apply]  │
└─────────────────────────────────────┘
```

### Active Filter Pills

Display active filters as removable pills:

```
┌─────────────────────────────────────────────────────────────────┐
│ Active Filters:                                                 │
│ [Status: Running ×] [Status: Failed ×] [Date: Last 7d ×]       │
│ [Clear All]                                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## URL Query Parameters

### Parameter Mapping

| Filter | Query Param | Example |
|--------|-------------|---------|
| Status | status | ?status=running,failed |
| Date preset | date | ?date=7d |
| Custom start | from | ?from=2026-01-01 |
| Custom end | to | ?to=2026-01-07 |
| Repository | repo | ?repo=owner/repo |
| Agent type | agent | ?agent=claude-code-subscription |
| Search | q | ?q=authentication |

### Example URLs

```
/work-orders?status=running,failed&date=7d
/work-orders?status=failed&from=2026-01-01&to=2026-01-07
/work-orders?q=login&agent=claude-code-subscription
/work-orders?status=running,queued&repo=myorg/myrepo&date=30d
```

### URL Sync Behavior

1. On page load: Parse URL, populate filter state
2. On filter change: Update URL (replace, not push)
3. On browser back: Re-parse URL, update filters
4. Debounce URL updates (300ms) for rapid changes

---

## API Integration

### Query Parameters to API

| UI Filter | API Parameter |
|-----------|---------------|
| status | status (comma-separated) |
| date preset | N/A (calculate from/to) |
| from | createdAfter (ISO date) |
| to | createdBefore (ISO date) |
| repo | repo |
| agent | agentType |
| q | search |

### Example API Call

```
GET /api/v1/work-orders
  ?status=running,failed
  &createdAfter=2026-01-01T00:00:00Z
  &createdBefore=2026-01-07T23:59:59Z
  &repo=myorg/myrepo
  &agentType=claude-code-subscription
  &search=authentication
  &limit=20
  &offset=0
```

---

## Component Hierarchy

```
WorkOrdersPage
├── PageHeader
├── FilterBar
│   ├── SearchInput
│   ├── FilterToggleButton (mobile)
│   └── FilterPanel (collapsible)
│       ├── StatusFilter (MultiSelect)
│       ├── DateRangeFilter
│       │   ├── PresetButtons
│       │   └── CustomDateRange
│       │       ├── DatePicker (start)
│       │       └── DatePicker (end)
│       ├── AgentTypeFilter (MultiSelect)
│       ├── RepositoryInput
│       └── FilterActions
│           ├── ClearAllButton
│           └── ApplyButton (if not auto-apply)
├── ActiveFilterPills
│   └── FilterPill (repeated, removable)
├── ResultsCount
└── WorkOrderList
```

---

## Hook: useFilters

### Purpose

Manage filter state and sync with URL.

### Interface

```
interface FilterState {
  status: WorkOrderStatus[];
  datePreset: DatePreset | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  repo: string;
  agentType: string[];
  search: string;
}

interface UseFiltersReturn {
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  clearFilter: (key: keyof FilterState) => void;
  clearAll: () => void;
  activeCount: number;
  toQueryParams: () => Record<string, string>;
}
```

### Behavior

- Initialize from URL on mount
- Update URL on filter change (debounced)
- Calculate active count
- Convert to API query params

---

## Date Calculations

### Preset Calculations

| Preset | From | To |
|--------|------|-----|
| today | Start of today | End of today |
| 7d | 7 days ago, start | Now |
| 30d | 30 days ago, start | Now |
| month | First of current month | Now |
| custom | User selected | User selected |

### Timezone Handling

- Use browser timezone for display
- Convert to UTC for API calls
- Store dates as ISO strings in URL

---

## Responsive Behavior

### Desktop (1024px+)

- All filters visible in expanded panel
- Auto-apply on change (no Apply button)
- Filter dropdowns inline

### Tablet (768px - 1023px)

- Filters in 2-column grid
- Apply button for batch changes
- Collapsible filter panel

### Mobile (< 768px)

- Filters in slide-out drawer
- Single column layout
- Apply button required
- Active filter pills above list

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC8.1 | Status multi-select works | Select multiple statuses |
| AC8.2 | Date presets filter correctly | Select preset, verify results |
| AC8.3 | Custom date range works | Select custom range |
| AC8.4 | Repo search filters | Enter repo name |
| AC8.5 | Agent type filter works | Select agent type |
| AC8.6 | Text search works | Search by prompt |
| AC8.7 | URL updates on filter | Change filter, check URL |
| AC8.8 | URL loads correct state | Navigate to filtered URL |
| AC8.9 | Back button works | Filter, navigate, go back |
| AC8.10 | Clear all works | Click clear, verify reset |
| AC8.11 | Active count accurate | Apply filters, check count |
| AC8.12 | Filter pills removable | Click X on pill |
| AC8.13 | Mobile drawer works | Test on mobile |
| AC8.14 | Dark mode correct | Toggle theme |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| parseUrlFilters | Parse various URL combinations |
| toQueryParams | Convert state to URL params |
| datePresetCalculation | Verify date calculations |
| activeCount | Count active filters |
| MultiSelect toggle | Toggle options |
| DateRangePicker validation | End > start |

### Integration Tests

| Test | Description |
|------|-------------|
| Filter and fetch | Apply filter, verify API call |
| URL sync | Change filter, verify URL |
| URL restore | Load URL, verify state |
| Clear all | Clear and verify reset |

### E2E Tests

| Test | Description |
|------|-------------|
| Full filter flow | Apply multiple filters |
| Share filtered URL | Copy URL, open in new tab |
| Browser navigation | Use back/forward |
