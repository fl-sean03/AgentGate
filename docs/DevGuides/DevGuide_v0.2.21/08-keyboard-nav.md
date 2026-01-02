# 08: Thrust 7 - Keyboard Navigation

## Objective

Implement comprehensive vim-style keyboard navigation across all views, including global shortcuts, view-specific bindings, and a help panel showing all available commands.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F7.1 | Global keyboard shortcuts | Must Have |
| F7.2 | Vim-style navigation (j/k/g/G) | Must Have |
| F7.3 | View-specific shortcuts | Must Have |
| F7.4 | Help panel on ? | Must Have |
| F7.5 | Modal shortcuts (Esc to close) | Must Have |
| F7.6 | Focus management | Must Have |
| F7.7 | Keyboard shortcut hints | Should Have |
| F7.8 | Customizable bindings | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N7.1 | No key conflicts between views | Must Have |
| N7.2 | Responsive key handling | Must Have |
| N7.3 | Works with all terminal emulators | Should Have |

---

## Keyboard System Architecture

### Hook Structure

```
useKeyboard (base hook)
├── Captures all stdin input
├── Parses key sequences
└── Invokes registered handlers

useGlobalKeys (global shortcuts)
├── Uses useKeyboard
├── Handles q, ?, d, w, n
└── Always active

useNavigationKeys (vim-style)
├── Uses useKeyboard
├── Handles j, k, g, G, Enter, Esc
└── Context-dependent

useViewKeys (view-specific)
├── Uses useKeyboard
├── Handles view-specific actions
└── Only active in specific views
```

### Key Event Flow

```
stdin
  │
  ▼
ink useInput()
  │
  ▼
useKeyboard() - parses key
  │
  ▼
Check modal overlay
  │ (if modal open, only modal keys)
  ▼
Check focused element
  │ (input fields capture keys)
  ▼
Check view-specific keys
  │
  ▼
Check global keys
  │
  ▼
Execute handler
```

---

## Global Shortcuts

### Always Available

| Key | Action | Description |
|-----|--------|-------------|
| `q` | Quit | Exit application (confirm if work in progress) |
| `?` | Help | Show help panel |
| `Ctrl+C` | Force Quit | Exit immediately |

### Navigation Shortcuts

| Key | Action | Description |
|-----|--------|-------------|
| `d` | Dashboard | Go to dashboard view |
| `w` | Work Orders | Go to work orders list |
| `n` | New | Create new work order |
| `Esc` | Back/Cancel | Go back or cancel current action |

---

## Vim-Style Navigation

### List Navigation

| Key | Action | Description |
|-----|--------|-------------|
| `j` / `↓` | Move down | Select next item |
| `k` / `↑` | Move up | Select previous item |
| `g` | Go to top | Select first item |
| `G` | Go to bottom | Select last item |
| `Enter` | Select | Open/activate selected item |

### Page Navigation

| Key | Action | Description |
|-----|--------|-------------|
| `[` | Previous page | Go to previous page |
| `]` | Next page | Go to next page |
| `{` | First page | Go to first page |
| `}` | Last page | Go to last page |
| `Ctrl+U` | Half page up | Scroll up half page |
| `Ctrl+D` | Half page down | Scroll down half page |

### Text Navigation

| Key | Action | Description |
|-----|--------|-------------|
| `0` | Line start | Move to start of line |
| `$` | Line end | Move to end of line |
| `/` | Search | Start search input |
| `n` | Next match | Go to next search match |
| `N` | Prev match | Go to previous search match |

---

## View-Specific Shortcuts

### Dashboard View

| Key | Action |
|-----|--------|
| `r` | Refresh data |
| `Enter` | View selected work order |

### Work Orders View

| Key | Action |
|-----|--------|
| `f` | Open filter panel |
| `/` | Search work orders |
| `c` | Clear search/filter |
| `Enter` | View work order detail |

### Work Order Detail View

| Key | Action |
|-----|--------|
| `t` | Trigger new run |
| `c` | Cancel work order |
| `p` | Open PR in browser |
| `Enter` | Stream selected run |

### Run Stream View

| Key | Action |
|-----|--------|
| `o` | Output tab |
| `t` | Tool calls tab |
| `f` | Files tab |
| `e` | Errors tab |
| `Space` | Pause/resume |
| `c` | Cancel run |

### Multi-Pane View

| Key | Action |
|-----|--------|
| `1-9` | Focus pane N |
| `Tab` | Next pane |
| `Shift+Tab` | Previous pane |
| `+` | Add pane |
| `-` | Remove current pane |
| `=` | Cycle layout |

---

## Help Panel

### UI Specification

```
┌─ Keyboard Shortcuts ─────────────────────────────────────────────┐
│                                                                   │
│  GLOBAL                                                           │
│  ────────────────────────────────────────────────────────────── │
│  q         Quit application                                      │
│  ?         Show this help                                        │
│  d         Go to dashboard                                       │
│  w         Go to work orders                                     │
│  n         Create new work order                                 │
│  Esc       Go back / cancel                                      │
│                                                                   │
│  NAVIGATION                                                       │
│  ────────────────────────────────────────────────────────────── │
│  j / ↓     Move down                                             │
│  k / ↑     Move up                                               │
│  g         Go to top                                             │
│  G         Go to bottom                                          │
│  Enter     Select / Open                                         │
│  [ / ]     Previous / Next page                                  │
│                                                                   │
│  CURRENT VIEW: Work Orders                                        │
│  ────────────────────────────────────────────────────────────── │
│  f         Open filter                                           │
│  /         Search                                                │
│  c         Clear search                                          │
│                                                                   │
│                                             Press Esc to close   │
└───────────────────────────────────────────────────────────────────┘
```

### Help Panel Structure

```
Sections:
1. Global - Always shown
2. Navigation - Vim-style keys
3. Current View - View-specific keys

Dynamic Content:
- Current view name changes
- View-specific keys change
```

---

## Component Specifications

### useKeyboard Hook

**Location:** `src/hooks/useKeyboard.ts`

```
Purpose: Low-level keyboard input handling

Returns:
{
  registerHandler: (key: string, handler: () => void) => unsubscribe,
  isPressed: (key: string) => boolean,
  lastKey: string | null,
}

Features:
- Key sequence detection (e.g., 'gg')
- Modifier key support (Ctrl, Alt, Shift)
- Debouncing for rapid input
- Priority levels for handlers
```

### useGlobalKeys Hook

**Location:** `src/hooks/useGlobalKeys.ts`

```
Purpose: Handle global shortcuts

Parameters:
{
  onQuit?: () => void,
  onHelp?: () => void,
  onNavigate?: (view: string) => void,
}

Registered Keys:
- q -> onQuit
- ? -> onHelp
- d -> navigate('dashboard')
- w -> navigate('work-orders')
- n -> navigate('create')
```

### useNavigationKeys Hook

**Location:** `src/hooks/useNavigation.ts`

```
Purpose: Handle vim-style list navigation

Parameters:
{
  items: any[],
  selectedIndex: number,
  onSelect: (index: number) => void,
  onActivate: (item: any) => void,
  onBack?: () => void,
}

Registered Keys:
- j, ArrowDown -> selectNext
- k, ArrowUp -> selectPrev
- g -> selectFirst
- G -> selectLast
- Enter -> activate
- Esc -> back
```

### HelpPanel Component

**Location:** `src/components/panels/HelpPanel.tsx`

```
Props:
{
  currentView: string,
  onClose: () => void,
}

Behavior:
- Overlay on top of current view
- Shows global, navigation, view-specific sections
- Closes on Esc or any other key press
```

---

## Key Conflict Resolution

### Priority Levels

```
1. Modal overlays (highest priority)
   - Help panel, filter panel, dialogs
   - Only modal keys work

2. Input fields
   - Text input, search
   - All keys go to input

3. View-specific keys
   - Context-dependent actions
   - Checked after focus elements

4. Navigation keys
   - j/k/g/G/Enter/Esc
   - Work in lists/tables

5. Global keys (lowest priority)
   - q, ?, d, w, n
   - Fallback handlers
```

### Conflict Prevention

```
Rules:
- Global keys must not conflict with vim navigation
- View keys must not conflict with navigation
- Modal keys override all others

Conflicts to Avoid:
- 'n' is global (new) - don't use in views
- 'g' is navigation (top) - don't use for go-to
- 'q' is global (quit) - never override
```

---

## Input Field Handling

### Text Input Mode

```
When TextInput is focused:
- All printable keys go to input
- Backspace deletes
- Enter submits
- Esc cancels (blur input)
- Tab moves to next field
- Ctrl+U clears input
```

### Focus Indicators

```
Focused TextInput:
┌─ Search ─────────────────────────────────────────────────────────┐
│ [/] Query: auth error█                                           │
└──────────────────────────────────────────────────────────────────┘

Unfocused (shows hint):
┌─ Search ─────────────────────────────────────────────────────────┐
│ Press / to search...                                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Terminal Compatibility

### Key Codes

```
Standard keys work everywhere:
- Letters (a-z, A-Z)
- Numbers (0-9)
- Enter, Escape, Backspace, Tab
- Arrow keys

May vary by terminal:
- Ctrl+Arrow (some terminals)
- Alt combinations
- Function keys (F1-F12)
```

### Fallback Keys

```
Primary -> Fallback
Ctrl+C  -> q (if quit is intended)
Arrow   -> j/k (vim users prefer this anyway)
PgUp    -> Ctrl+U
PgDn    -> Ctrl+D
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC7.1 | q quits application | Press q, app exits |
| AC7.2 | ? shows help | Press ?, panel appears |
| AC7.3 | d goes to dashboard | Press d, view changes |
| AC7.4 | j/k navigates list | Selection moves |
| AC7.5 | Enter activates item | Item opens/activates |
| AC7.6 | Esc goes back | Previous view shown |
| AC7.7 | View keys work | Tab-specific keys function |
| AC7.8 | Input captures keys | Text entry works |
| AC7.9 | Help shows context | Current view keys shown |
| AC7.10 | No key conflicts | All keys work as expected |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| useKeyboard fires handler | Handler called on key |
| useNavigationKeys moves selection | j/k changes index |
| Priority ordering | Higher priority wins |
| Modal blocks global | Global keys disabled in modal |

### Integration Tests

| Test | Description |
|------|-------------|
| Global navigation | d/w keys change view |
| List navigation | Full vim navigation flow |
| Input focus | Keys go to input when focused |
| Help panel | Opens, shows context, closes |

### E2E Tests

| Test | Description |
|------|-------------|
| Full navigation flow | Navigate app with only keyboard |
| Create work order | Fill form with keyboard |
| Search and filter | Use / and f for search/filter |

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `src/hooks/useKeyboard.ts` | 100 | Base keyboard hook |
| `src/hooks/useGlobalKeys.ts` | 50 | Global shortcuts |
| `src/hooks/useNavigation.ts` | 80 | Navigation keys |
| `src/components/panels/HelpPanel.tsx` | 120 | Help overlay |
| `src/utils/keys.ts` | 40 | Key utilities |
| `tests/hooks/useKeyboard.test.ts` | 100 | Hook tests |

**Total: ~6 files, ~490 lines**
