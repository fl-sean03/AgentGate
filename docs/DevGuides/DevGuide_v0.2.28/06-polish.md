# 06: Polish - Final Refinements

This document covers Thrust 10, the final polish and refinements.

---

## Thrust 10: Polish and Refinements

### 10.1 Objective

Add final polish including error handling, keyboard shortcuts, configuration, and visual refinements.

### 10.2 Background

The final thrust focuses on:
- Comprehensive error handling
- Keyboard shortcut consistency
- Configuration file support
- Visual polish and animations
- Edge case handling

### 10.3 Subtasks

#### 10.3.1 Create Unified Keyboard Handler

Implement consistent keyboard handling across screens.

**Files to create:**
- `packages/tui/src/hooks/useKeyboard.ts` - Centralized keyboard handling

**Requirements:**
- Global shortcuts (q to quit)
- Screen-specific shortcuts
- Help overlay toggle (?)
- Vim-style navigation (h/j/k/l)
- Prevent conflicts between screens

**Dog Food Work Order:**
```
Create packages/tui/src/hooks/useKeyboard.ts:

Create a useKeyboard hook that:
- Takes a keymap object mapping keys to handlers
- Provides global shortcuts that always work:
  - q: quit (with confirmation if run active)
  - ?: toggle help overlay
  - Ctrl+C: force quit
- Provides vim-style navigation helpers:
  - j/Down: move down
  - k/Up: move up
  - h/Left or Esc: go back
  - l/Right or Enter: select
  - g: go to top
  - G: go to bottom
- Returns { registerKey, unregisterKey } for dynamic binding
- Handles modifier keys (Ctrl, Alt, Shift)

Use Ink's useInput hook internally.
Prevent key conflicts by checking current screen context.
```

#### 10.3.2 Create Help Overlay

Display keyboard shortcuts overlay.

**Files to create:**
- `packages/tui/src/components/HelpOverlay.tsx` - Help overlay component

**Requirements:**
- Modal overlay on top of current screen
- Show all available shortcuts
- Context-aware (show relevant shortcuts)
- Dismiss with ? or Escape

**Dog Food Work Order:**
```
Create packages/tui/src/components/HelpOverlay.tsx:

Create a HelpOverlay component that:
- Takes currentScreen prop to show relevant shortcuts
- Renders as a centered overlay box
- Shows two columns: Key and Action
- Groups shortcuts by category:
  - Navigation (arrows, j/k, Enter, Esc)
  - Actions (n for new, r for runs, etc.)
  - Screen-specific (c for cancel, o for open PR, etc.)
- Footer: [?] or [Esc] to close

Use absolute positioning to overlay the current content.
Use a semi-transparent background or solid box with border.
Keep the help concise - only most important shortcuts.
```

#### 10.3.3 Create Error Boundary

Handle unexpected errors gracefully.

**Files to create:**
- `packages/tui/src/components/ErrorBoundary.tsx` - Error boundary

**Requirements:**
- Catch React errors
- Display friendly error message
- Offer retry option
- Log error details

**Dog Food Work Order:**
```
Create packages/tui/src/components/ErrorBoundary.tsx:

Create an ErrorBoundary class component that:
- Implements componentDidCatch to log errors
- Maintains error state in state
- Renders children normally when no error
- On error, renders:
  - "Something went wrong" header
  - Simplified error message
  - [r] Retry button to reset state
  - [q] Quit button
- resetError() method clears error state

Also create a useErrorHandler hook for functional components:
- Returns { error, setError, clearError }
- For wrapping async operations with try/catch
```

#### 10.3.4 Create Configuration System

Support user configuration file.

**Files to create:**
- `packages/tui/src/utils/config.ts` - Configuration management

**Requirements:**
- Load config from ~/.agentgate/config.json
- Support: apiUrl, theme preferences
- Merge with defaults
- Save config changes

**Dog Food Work Order:**
```
Create packages/tui/src/utils/config.ts:

Create a configuration system that:
- Loads from ~/.agentgate/config.json
- Has sensible defaults:
  - apiUrl: 'https://api.agentgate.dev'
  - theme: 'dark'
- Provides:
  - loadConfig(): Config - load and merge with defaults
  - saveConfig(config): void - save to file
  - getConfig(): Config - get current config (cached)
  - setConfigValue(key, value): void - update single value
- Creates config directory if it doesn't exist
- Handles file not found gracefully (use defaults)
- Validates config values

The token should still be stored separately (already in auth.ts).
```

#### 10.3.5 Add Visual Polish

Refine visual elements.

**Files to modify:**
- Various component files for visual improvements

**Requirements:**
- Consistent spacing and padding
- Smooth transitions between screens
- Loading states for all async operations
- Empty states with helpful messages

**Dog Food Work Order:**
```
Add visual polish across the TUI:

1. Create src/utils/colors.ts with color constants:
   - Define theme colors for success, error, warning, info
   - Define dim colors for secondary text
   - Support for different terminal capabilities

2. Create src/components/Box.tsx wrapper:
   - Styled box with consistent padding
   - Border style options (rounded, sharp, none)
   - Header prop for titled boxes

3. Create src/components/Footer.tsx:
   - Consistent footer for keyboard hints
   - Auto-generated from keymap

4. Add empty states:
   - "No repositories found" with suggestion
   - "No runs yet" with suggestion
   - "Waiting for data..." loading states

5. Add transitions:
   - Brief fade or slide between screens (if Ink supports)
   - Or clear console between screens for clean transitions

Keep animations subtle - terminals have limited capability.
```

#### 10.3.6 Add Confirmation Dialogs

Confirm destructive actions.

**Files to create:**
- `packages/tui/src/components/ConfirmDialog.tsx` - Confirmation dialog

**Requirements:**
- Modal dialog for confirmations
- Yes/No options
- Keyboard support (y/n or Enter/Esc)
- Used for: cancel, quit during run

**Dog Food Work Order:**
```
Create packages/tui/src/components/ConfirmDialog.tsx:

Create a ConfirmDialog component that:
- Takes message, onConfirm, onCancel props
- Renders as centered overlay box
- Shows message and options:
  - [y] Yes  [n] No
  - Or: [Enter] Confirm  [Esc] Cancel
- Handles keyboard:
  - y or Enter: call onConfirm()
  - n or Esc: call onCancel()

Integrate into:
- Cancel action during running (confirm before canceling)
- Quit action during running (warn run will be detached)
```

### 10.4 Verification Steps

1. Help overlay appears with '?' key
2. Error boundary catches and displays errors
3. Configuration loads from file
4. All screens have consistent styling
5. Confirmation dialogs work correctly
6. Vim-style navigation works everywhere

### 10.5 Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `packages/tui/src/hooks/useKeyboard.ts` | Created | Keyboard handler |
| `packages/tui/src/components/HelpOverlay.tsx` | Created | Help overlay |
| `packages/tui/src/components/ErrorBoundary.tsx` | Created | Error boundary |
| `packages/tui/src/components/ConfirmDialog.tsx` | Created | Confirm dialog |
| `packages/tui/src/utils/config.ts` | Created | Config management |
| `packages/tui/src/utils/colors.ts` | Created | Color constants |
| `packages/tui/src/components/Box.tsx` | Created | Styled box |
| `packages/tui/src/components/Footer.tsx` | Created | Footer component |

---

## Final Completion Checklist

After completing Thrust 10, the TUI should be production-ready:

### Functionality
- [ ] Login flow works end-to-end
- [ ] Repository list loads and filters
- [ ] Task submission creates work orders
- [ ] Running screen streams activity
- [ ] Verification progress updates
- [ ] Result screens show correct info
- [ ] Runs history works
- [ ] Cancel and detach work
- [ ] PR links open in browser

### User Experience
- [ ] Keyboard navigation is intuitive
- [ ] Help overlay shows all shortcuts
- [ ] Errors display friendly messages
- [ ] Loading states prevent confusion
- [ ] Confirmations prevent accidents

### Code Quality
- [ ] All files have tests
- [ ] No lint errors
- [ ] TypeScript strict mode passes
- [ ] ESM imports use .js extension
- [ ] No console.log statements

### Cross-Platform
- [ ] Works on macOS Terminal
- [ ] Works on Linux terminals
- [ ] Works on Windows Terminal
- [ ] Works over SSH
- [ ] Works in tmux

---

## Dog Fooding the TUI

Once the TUI is complete, it can be used to improve itself:

```bash
# Use the TUI to add a feature to the TUI
agentgate
# Select: agentgate/agentgate
# Task: "Add support for filtering runs by status in the runs list.
#        Add a 'f' key to cycle through: all, running, succeeded, failed.
#        Show current filter in the header."
```

The TUI becomes a first-class citizen in the AgentGate ecosystem, enabling rapid iteration on both AgentGate and the TUI itself.
