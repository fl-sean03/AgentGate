# 04: Thrust 3 - Core Components

## Objective

Build the foundational UI components for the TUI: styled containers, status badges, loading spinners, data tables, and keyboard hint displays. These components form the building blocks for all views.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F3.1 | Box component with borders | Must Have |
| F3.2 | Badge for status display | Must Have |
| F3.3 | Spinner for loading states | Must Have |
| F3.4 | Table for data lists | Must Have |
| F3.5 | KeyHint for shortcuts | Must Have |
| F3.6 | Consistent color theming | Must Have |
| F3.7 | Error display component | Should Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N3.1 | Render in < 16ms | Should Have |
| N3.2 | Memory efficient | Must Have |
| N3.3 | Support narrow terminals (80 cols) | Must Have |

---

## Component Specifications

### Box Component

**Location:** `src/components/core/Box.tsx`

```
Purpose: Styled container with optional border and title

Props:
{
  title?: string,
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'classic',
  borderColor?: string,
  padding?: number,
  width?: number | string,
  height?: number | string,
  flexDirection?: 'row' | 'column',
  children: React.ReactNode,
}

Variants:
- Default: Single border
- Panel: With title in top border
- Section: No border, just padding
- Card: Rounded corners (if supported)

Example Output:
┌─ Work Orders ───────────────────────────────────────────┐
│                                                         │
│  Content goes here                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Badge Component

**Location:** `src/components/core/Badge.tsx`

```
Purpose: Colored status indicator with text

Props:
{
  status: 'running' | 'succeeded' | 'failed' | 'queued' | 'cancelled',
  showIcon?: boolean, // Default: true
  showText?: boolean, // Default: true
  size?: 'sm' | 'md', // Default: 'md'
}

Status Icons:
- running:   ● (yellow)
- succeeded: ✓ (green)
- failed:    ✗ (red)
- queued:    ○ (gray)
- cancelled: ○ (gray, dimmed)

Status Colors:
| Status | Icon | Text Color |
|--------|------|------------|
| running | yellow | yellow |
| succeeded | green | green |
| failed | red | red |
| queued | gray | gray |
| cancelled | gray dim | gray dim |

Example Output:
● running      (yellow text)
✓ succeeded    (green text)
✗ failed       (red text)
```

### Spinner Component

**Location:** `src/components/core/Spinner.tsx`

```
Purpose: Animated loading indicator

Props:
{
  type?: 'dots' | 'line' | 'arc' | 'bouncingBar',
  label?: string,
  color?: string,
}

Behavior:
- Uses ink-spinner under the hood
- Cycles through frames at 80ms interval
- Optional label appears next to spinner

Example Output:
⠋ Loading work orders...
⠙ Loading work orders...
⠹ Loading work orders...
```

### Table Component

**Location:** `src/components/core/Table.tsx`

```
Purpose: Tabular data display with columns

Props:
{
  columns: Column[],
  data: Row[],
  selectedIndex?: number,
  onSelect?: (index: number) => void,
  maxHeight?: number,
  showHeader?: boolean, // Default: true
}

Column Definition:
{
  key: string,
  header: string,
  width?: number | string, // Fixed or percentage
  align?: 'left' | 'center' | 'right',
  render?: (value, row) => React.ReactNode,
}

Features:
- Column headers with separator line
- Row highlighting for selection
- Horizontal scrolling if too wide
- Custom cell renderers

Example Output:
Status    ID          Prompt                     Created
──────────────────────────────────────────────────────────
● running FHC3pJst   Phase 3 implementation     2m ago
✓ success x3Uir8xH   Fix sandbox default       12m ago
✗ failed  abc12345   Build optimization         1h ago
```

### KeyHint Component

**Location:** `src/components/core/KeyHint.tsx`

```
Purpose: Display keyboard shortcuts

Props:
{
  hints: Hint[],
  separator?: string, // Default: ' '
}

Hint Definition:
{
  key: string,    // e.g., 'q', 'Enter', '↑↓'
  action: string, // e.g., 'quit', 'select'
}

Formatting:
- Key in brackets: [q]
- Action follows: [q]uit
- Multiple hints separated by spaces

Example Output:
[↑↓] navigate [enter] select [f]ilter [n]ew [/] search [q]uit
```

### ProgressBar Component

**Location:** `src/components/core/ProgressBar.tsx`

```
Purpose: Show progress percentage

Props:
{
  percent: number, // 0-100
  width?: number,  // Default: 30
  showPercent?: boolean, // Default: true
  color?: string,
  backgroundColor?: string,
}

Characters:
- Filled: █
- Empty: ░

Example Output:
████████████░░░░░░░░░░░░░░░░░░ 45%
```

### ErrorBox Component

**Location:** `src/components/core/ErrorBox.tsx`

```
Purpose: Display error messages

Props:
{
  title?: string,  // Default: 'Error'
  message: string,
  details?: string,
  onRetry?: () => void,
}

Styling:
- Red border
- Error icon (✗)
- Title in bold
- Message in normal text
- Details in dimmed text
- Optional [r]etry hint

Example Output:
┌─ Error ─────────────────────────────────────────────────┐
│ ✗ Cannot connect to server                              │
│                                                         │
│ Check that AgentGate server is running at:              │
│ http://localhost:3000                                   │
│                                                         │
│ [r]etry                                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Color System

### Color Palette

```
Primary Colors:
| Name | Chalk | Hex | Usage |
|------|-------|-----|-------|
| primary | blue | #3b82f6 | Links, selected items |
| success | green | #10b981 | Success status |
| warning | yellow | #f59e0b | Running status |
| error | red | #ef4444 | Failed status |
| muted | gray | #6b7280 | Secondary text |

Text Colors:
| Name | Chalk | Usage |
|------|-------|-------|
| default | white | Primary text |
| dimmed | gray | Secondary text |
| inverse | black on white | Selected item |

Border Colors:
| Name | Chalk | Usage |
|------|-------|-------|
| default | white | Normal borders |
| focused | cyan | Focused element |
| error | red | Error state |
```

### src/utils/colors.ts

```
Purpose: Centralized color definitions

Exports:
- colors: Object with all color names
- statusColor(status): Returns color for status
- textColor(variant): Returns text color
- borderColor(state): Returns border color

Usage:
import { colors, statusColor } from '../utils/colors';

<Text color={statusColor('running')}>●</Text>
<Text color={colors.muted}>Secondary text</Text>
```

---

## Layout Utilities

### src/utils/layout.ts

```
Purpose: Helper functions for layout calculations

Functions:
- getTerminalWidth(): number
- getTerminalHeight(): number
- truncateText(text, maxWidth): string
- padText(text, width, align): string
- wrapText(text, width): string[]

Usage:
const width = getTerminalWidth();
const truncated = truncateText(longPrompt, 40);
```

### Responsive Breakpoints

```
| Name | Width | Behavior |
|------|-------|----------|
| narrow | < 80 | Single column, abbreviated |
| normal | 80-120 | Standard layout |
| wide | > 120 | Multi-column possible |
```

---

## Component Hierarchy

```
Core Components (this thrust)
├── Box
│   └── Ink's Box + custom styling
├── Badge
│   └── Text with color
├── Spinner
│   └── ink-spinner wrapper
├── Table
│   ├── TableHeader
│   ├── TableRow
│   └── TableCell
├── KeyHint
│   └── Text with formatting
├── ProgressBar
│   └── Text characters
└── ErrorBox
    └── Box with error styling
```

---

## Accessibility Considerations

### Screen Reader Support

```
For terminal screen readers (e.g., JAWS, NVDA in terminal):
- Use semantic text structure
- Avoid purely visual indicators
- Include text alternatives for symbols

Example:
Instead of just: ●
Use: ● running

Instead of just: ████░░░░
Use: ████░░░░ 45%
```

### Color Blindness

```
Don't rely solely on color:
- ● for running (yellow) - also use "running" text
- ✓ for success (green) - checkmark indicates success
- ✗ for failed (red) - X indicates failure

Symbols provide meaning independent of color.
```

---

## Performance Considerations

### Memoization

```
Memoize expensive components:
- Table rows (only re-render changed rows)
- Formatted text (cache truncation results)

Use React.memo() for pure components.
Use useMemo() for expensive calculations.
```

### Render Optimization

```
Ink re-renders on every state change.
Minimize state updates:
- Batch updates where possible
- Debounce rapid updates (SSE events)
- Use refs for non-rendered values
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC3.1 | Box renders with border | Visual check |
| AC3.2 | Box shows title | Title in border |
| AC3.3 | Badge shows correct icon | Each status tested |
| AC3.4 | Badge shows correct color | Color visible |
| AC3.5 | Spinner animates | Frames change |
| AC3.6 | Table renders columns | All columns visible |
| AC3.7 | Table highlights selection | Selected row inverse |
| AC3.8 | KeyHint formats correctly | Brackets around keys |
| AC3.9 | ProgressBar fills correctly | 50% = half filled |
| AC3.10 | ErrorBox shows retry | Retry hint visible |
| AC3.11 | Colors consistent | Match color palette |
| AC3.12 | Works at 80 columns | No overflow |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| Box renders | Basic render |
| Box with title | Title in border |
| Badge running | Yellow with dot |
| Badge succeeded | Green with check |
| Badge failed | Red with X |
| Spinner renders | Shows frame |
| Table columns | Headers render |
| Table selection | Correct row highlighted |
| KeyHint format | [k]ey format |
| ProgressBar 0% | Empty bar |
| ProgressBar 50% | Half filled |
| ProgressBar 100% | Full bar |

### Snapshot Tests

```
For each component, create snapshot test:
1. Render component with ink-testing-library
2. Capture output with lastFrame()
3. Compare against saved snapshot

This catches unintended visual changes.
```

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `src/components/core/Box.tsx` | 60 | Styled container |
| `src/components/core/Badge.tsx` | 40 | Status badge |
| `src/components/core/Spinner.tsx` | 25 | Loading spinner |
| `src/components/core/Table.tsx` | 100 | Data table |
| `src/components/core/KeyHint.tsx` | 30 | Shortcut hints |
| `src/components/core/ProgressBar.tsx` | 35 | Progress bar |
| `src/components/core/ErrorBox.tsx` | 50 | Error display |
| `src/components/core/index.ts` | 10 | Re-exports |
| `src/utils/colors.ts` | 40 | Color definitions |
| `src/utils/layout.ts` | 50 | Layout helpers |
| `tests/components/core/` | 150 | Component tests |

**Total: ~11 files, ~590 lines**

---

## Usage Examples

### Dashboard Panel

```
Compose core components:

<Box title="Work Orders">
  <Table
    columns={[
      { key: 'status', header: 'Status', render: (s) => <Badge status={s} /> },
      { key: 'id', header: 'ID' },
      { key: 'prompt', header: 'Prompt' },
    ]}
    data={workOrders}
    selectedIndex={selectedIndex}
  />
</Box>
<KeyHint hints={[
  { key: '↑↓', action: 'navigate' },
  { key: 'Enter', action: 'select' },
  { key: 'q', action: 'quit' },
]} />
```

### Loading State

```
<Box title="Work Orders">
  <Spinner label="Loading work orders..." />
</Box>
```

### Error State

```
<ErrorBox
  message="Cannot connect to server"
  details="Check that AgentGate is running at http://localhost:3000"
  onRetry={() => refetch()}
/>
```
