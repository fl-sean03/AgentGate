# 07: Thrust 6 - Enhanced Error Display

## Objective

Implement rich error display using the structured BuildError format from v0.2.19, showing detailed error information including type, stdout/stderr excerpts, and links to full agent output files.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F6.1 | Display error type with descriptive icon | Must Have |
| F6.2 | Show error message prominently | Must Have |
| F6.3 | Display exit code when available | Must Have |
| F6.4 | Show last N lines of stdout (default: 50) | Must Have |
| F6.5 | Show last N lines of stderr (default: 50) | Must Have |
| F6.6 | Collapsible stdout/stderr sections | Must Have |
| F6.7 | Link to full agent result file | Should Have |
| F6.8 | Copy error details to clipboard | Should Have |
| F6.9 | Syntax highlighting for output | Could Have |
| F6.10 | Search within output | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N6.1 | Large outputs render without lag | Must Have |
| N6.2 | Works on mobile viewport | Must Have |
| N6.3 | Supports dark mode | Must Have |
| N6.4 | Screen reader accessible | Must Have |

---

## BuildError Structure (from v0.2.19)

### Error Type Enum

| Type | Description | Icon |
|------|-------------|------|
| BUILD_ERROR | Compilation or build failure | 🔨 |
| TEST_ERROR | Test suite failure | 🧪 |
| VERIFICATION_ERROR | Verification gate failure | ✓✗ |
| AGENT_ERROR | Agent crashed or timed out | 🤖 |
| WORKSPACE_ERROR | Workspace setup failure | 📁 |
| GITHUB_ERROR | GitHub API failure | 🐙 |
| SNAPSHOT_ERROR | Git snapshot failure | 📸 |
| TIMEOUT_ERROR | Exceeded time limit | ⏱️ |
| SYSTEM_ERROR | Unknown/internal error | ⚠️ |

### BuildError Interface

```
interface BuildError {
  type: BuildErrorType;
  message: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  agentResultFile: string | null;
  iteration: number;
  timestamp: string;
}
```

---

## User Interface Specification

### Error Display on RunDetail Page

**Current location:** ErrorsTab in streaming view

**Enhanced design:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Errors                                                          │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🔨 BUILD_ERROR                              Iteration 2     │ │
│ │ ───────────────────────────────────────────────────────────│ │
│ │                                                             │ │
│ │ Build failed: TypeScript compilation errors                 │ │
│ │                                                             │ │
│ │ Exit Code: 1                                                │ │
│ │ Time: Jan 2, 2026 at 11:45:32 AM                           │ │
│ │                                                             │ │
│ │ ▼ Standard Output (last 50 lines)                          │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ > tsc --noEmit                                         │ │ │
│ │ │ src/index.ts:45:10 - error TS2322: Type 'string'       │ │ │
│ │ │   is not assignable to type 'number'.                   │ │ │
│ │ │                                                         │ │ │
│ │ │ 45   const count: number = "five";                      │ │ │
│ │ │            ~~~~~                                        │ │ │
│ │ │                                                         │ │ │
│ │ │ Found 1 error in src/index.ts:45                        │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ │ ▶ Standard Error (collapsed)                               │ │
│ │                                                             │ │
│ │ [📋 Copy Error] [📄 View Full Output]                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Error Type Header

| Element | Description |
|---------|-------------|
| Icon | Error type icon (emoji or Lucide icon) |
| Type label | Error type in uppercase (e.g., "BUILD_ERROR") |
| Iteration badge | "Iteration N" showing which iteration failed |

### Error Details Section

| Element | Description |
|---------|-------------|
| Message | Main error message, prominent text |
| Exit code | "Exit Code: N" or omitted if null |
| Timestamp | When error occurred |

### Output Sections

**Stdout Section:**
- Collapsible (default: expanded if has content)
- Header: "Standard Output (last N lines)"
- Monospace font
- Horizontal scroll for long lines
- Line numbers (optional)
- Max height with vertical scroll

**Stderr Section:**
- Collapsible (default: collapsed)
- Header: "Standard Error (last N lines)"
- Same styling as stdout
- Red-tinted background in light mode
- Darker background in dark mode

### Action Buttons

| Button | Action |
|--------|--------|
| Copy Error | Copies formatted error to clipboard |
| View Full Output | Opens full agent result file or modal |

---

## Copy Format

When user clicks "Copy Error", clipboard contains:

```
Error Type: BUILD_ERROR
Message: Build failed: TypeScript compilation errors
Exit Code: 1
Iteration: 2
Time: 2026-01-02T11:45:32Z

--- stdout (last 50 lines) ---
> tsc --noEmit
src/index.ts:45:10 - error TS2322: Type 'string'
  is not assignable to type 'number'.
...

--- stderr ---
(empty)
```

---

## Full Output Viewer

### Modal Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Full Agent Output                                         [X]   │
├─────────────────────────────────────────────────────────────────┤
│ Run: run-abc123 | Iteration: 2                                  │
│ File: /runs/run-abc123/iteration-2/agent-result.json           │
├───────────────────────────────────┬─────────────────────────────┤
│ [stdout] [stderr] [tool calls]    │ Search: [____________] 🔍  │
├───────────────────────────────────┴─────────────────────────────┤
│   1 │ > npm run build                                          │
│   2 │ > tsc --noEmit                                           │
│   3 │                                                          │
│   4 │ src/index.ts:45:10 - error TS2322: Type 'string'         │
│   5 │   is not assignable to type 'number'.                    │
│   ...                                                          │
│ 150 │ npm ERR! Exit status 1                                   │
├─────────────────────────────────────────────────────────────────┤
│                              [Download] [Copy All] [Close]      │
└─────────────────────────────────────────────────────────────────┘
```

### Features

- Tab navigation between stdout, stderr, tool calls
- Line numbers
- Search with highlight
- Download full file
- Copy all content

---

## Error in Iteration Cards

### Current IterationCard Enhancement

When iteration has error:

```
┌─────────────────────────────────────────────────────────────────┐
│ Iteration 2                                              failed │
│ Duration: 2m 34s                                                │
│ ─────────────────────────────────────────────────────────────── │
│ 🔨 BUILD_ERROR: TypeScript compilation errors                   │
│ Exit Code: 1                                                    │
│ [View Details]                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
ErrorDisplay (enhanced)
├── ErrorHeader
│   ├── ErrorTypeIcon
│   ├── ErrorTypeLabel
│   └── IterationBadge
├── ErrorDetails
│   ├── ErrorMessage
│   ├── ExitCode
│   └── Timestamp
├── OutputSection (stdout)
│   ├── SectionHeader (collapsible)
│   └── OutputViewer
│       ├── LineNumbers
│       └── OutputContent
├── OutputSection (stderr)
│   ├── SectionHeader (collapsible)
│   └── OutputViewer
├── ActionButtons
│   ├── CopyButton
│   └── ViewFullButton
└── FullOutputModal
    ├── ModalHeader
    ├── TabNavigation
    ├── SearchBar
    ├── OutputContent
    └── ModalActions
```

---

## Error Type Styling

### Light Mode Colors

| Error Type | Background | Border | Icon Color |
|------------|------------|--------|------------|
| BUILD_ERROR | red-50 | red-200 | red-600 |
| TEST_ERROR | orange-50 | orange-200 | orange-600 |
| VERIFICATION_ERROR | yellow-50 | yellow-200 | yellow-600 |
| AGENT_ERROR | purple-50 | purple-200 | purple-600 |
| TIMEOUT_ERROR | blue-50 | blue-200 | blue-600 |
| SYSTEM_ERROR | gray-50 | gray-200 | gray-600 |

### Dark Mode Colors

| Error Type | Background | Border | Icon Color |
|------------|------------|--------|------------|
| BUILD_ERROR | red-900/30 | red-800 | red-400 |
| TEST_ERROR | orange-900/30 | orange-800 | orange-400 |
| (etc.) | | | |

---

## Output Viewer Features

### Line Limiting

- Default: Show last 50 lines
- Configurable via prop
- "Show more" button to load additional lines
- "Show all" for complete output

### Syntax Highlighting

- Detect common patterns:
  - Error messages (red)
  - File paths (blue)
  - Line numbers (cyan)
  - Stack traces (formatted)

### Long Line Handling

- Horizontal scroll
- No word wrap (preserve formatting)
- Visible scrollbar

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC6.1 | Error type icon displayed | Check icon present |
| AC6.2 | Error type label shown | Check label text |
| AC6.3 | Error message prominent | Verify styling |
| AC6.4 | Exit code shown when present | Check exit code |
| AC6.5 | Stdout section works | Expand/collapse |
| AC6.6 | Stderr section works | Expand/collapse |
| AC6.7 | Copy button works | Click, verify clipboard |
| AC6.8 | View full output works | Click, verify modal |
| AC6.9 | Line numbers shown | Count lines |
| AC6.10 | Long lines scroll | Enter long line |
| AC6.11 | Dark mode correct | Toggle theme |
| AC6.12 | Mobile responsive | Test at 375px |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| ErrorTypeIcon renders | Test each error type |
| ErrorHeader layout | Verify icon, label, badge |
| OutputSection collapse | Toggle and verify |
| Copy button formats | Verify clipboard content |
| Line number display | Verify count accurate |

### Integration Tests

| Test | Description |
|------|-------------|
| Render BuildError | Pass mock error, verify display |
| Full output modal | Open modal, verify content |
| Tab navigation | Switch tabs in modal |

### E2E Tests

| Test | Description |
|------|-------------|
| Failed run error display | Create failed run, verify error |
| Copy and paste | Copy error, paste elsewhere |
