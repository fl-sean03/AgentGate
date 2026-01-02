# 12: Testing Strategy

## Overview

This document defines the testing strategy for v0.2.21 Terminal User Interface, covering unit tests, integration tests, end-to-end tests, and terminal-specific testing considerations.

---

## Testing Stack

| Tool | Purpose |
|------|---------|
| Vitest | Unit and integration test runner |
| ink-testing-library | Ink component testing |
| MSW (Mock Service Worker) | API mocking |
| @vitest/coverage-v8 | Code coverage |
| expect-type | Type testing |

---

## Test Categories

### Unit Tests

Test individual components and functions in isolation.

**Coverage Target:** 80%+

**What to Test:**
- Component rendering
- Hook logic
- Utility functions
- State transformations
- Keyboard handling

**What NOT to Test:**
- Ink internals
- Terminal rendering details
- Third-party library behavior

### Integration Tests

Test component interactions and API integration.

**Coverage Target:** Key user flows

**What to Test:**
- View navigation
- API request/response
- SSE streaming
- State management
- Form submission

### End-to-End Tests

Test complete user journeys through the application.

**Coverage Target:** Critical paths

**What to Test:**
- Full TUI flows
- CLI commands
- Configuration persistence

---

## Test File Structure

```
packages/tui/
├── src/
│   ├── components/
│   │   ├── core/
│   │   │   ├── Box.tsx
│   │   │   └── __tests__/
│   │   │       └── Box.test.tsx
│   │   └── views/
│   │       ├── DashboardView.tsx
│   │       └── __tests__/
│   │           └── DashboardView.test.tsx
│   ├── hooks/
│   │   ├── useKeyboard.ts
│   │   └── __tests__/
│   │       └── useKeyboard.test.ts
│   └── commands/
│       ├── list.ts
│       └── __tests__/
│           └── list.test.ts
└── tests/
    ├── setup.ts           # Test setup
    ├── mocks/
    │   ├── handlers.ts    # MSW handlers
    │   └── data.ts        # Mock data
    ├── integration/
    │   ├── navigation.test.tsx
    │   └── api.test.tsx
    └── e2e/
        └── cli.test.ts
```

---

## ink-testing-library Usage

### Basic Component Test

```
Pattern for testing Ink components:

1. Import render from ink-testing-library
2. Render component
3. Get lastFrame() for output
4. Assert on output content

Test Structure:
- Arrange: Set up props and mocks
- Act: Render component or trigger action
- Assert: Check lastFrame() output
```

### Keyboard Input Testing

```
Pattern for testing keyboard input:

1. Render component with render()
2. Get stdin from render result
3. Write key to stdin
4. Assert on state change or output

Key Codes:
- '\x1B' - Escape
- '\r' - Enter
- '\x1B[A' - Up arrow
- '\x1B[B' - Down arrow
- 'j', 'k' - Vim navigation
```

### Async Component Testing

```
Pattern for async operations:

1. Render component
2. Wait for loading state
3. Resolve mock promise
4. Assert on final state

Use waitFor() or flushSync() for async updates.
```

---

## Unit Test Examples

### Component Test: Badge

```
File: Badge.test.tsx

Test Cases:
1. renders running status
   - Input: status="running"
   - Expected: yellow dot, "running" text

2. renders succeeded status
   - Input: status="succeeded"
   - Expected: green checkmark, "succeeded" text

3. renders failed status
   - Input: status="failed"
   - Expected: red X, "failed" text

4. hides text when showText=false
   - Input: status="running", showText=false
   - Expected: dot only, no text
```

### Hook Test: useKeyboard

```
File: useKeyboard.test.ts

Test Cases:
1. calls handler on key press
   - Register handler for 'q'
   - Send 'q' to stdin
   - Expected: handler called

2. respects priority
   - Register two handlers for 'q'
   - Higher priority wins
   - Expected: only high priority called

3. handles escape key
   - Register handler for Escape
   - Send '\x1B' to stdin
   - Expected: handler called

4. handles arrow keys
   - Register handler for ArrowDown
   - Send '\x1B[B' to stdin
   - Expected: handler called
```

### Utility Test: formatDuration

```
File: format.test.ts

Test Cases:
1. formats seconds
   - Input: 45
   - Expected: "45s"

2. formats minutes and seconds
   - Input: 125
   - Expected: "2m 5s"

3. formats hours
   - Input: 3661
   - Expected: "1h 1m"

4. formats days
   - Input: 86400
   - Expected: "1d"
```

---

## Integration Test Examples

### Navigation Flow

```
File: navigation.test.tsx

Test: Dashboard to WorkOrder to Run

Steps:
1. Render App component
2. Verify dashboard displayed
3. Press 'w' key
4. Verify work orders view displayed
5. Press 'j' to select
6. Press Enter to open detail
7. Verify detail view displayed
8. Press 'j' to select run
9. Press Enter to stream
10. Verify stream view displayed
11. Press Escape to go back
12. Verify back at detail
```

### API Integration

```
File: api.test.tsx

Test: Fetch and display work orders

Setup:
- MSW handler for GET /api/v1/work-orders
- Returns 3 mock work orders

Steps:
1. Render WorkOrdersView
2. Verify loading state
3. Wait for data
4. Verify 3 work orders displayed
5. Verify status badges correct
6. Verify dates formatted
```

### SSE Integration

```
File: sse.test.tsx

Test: Stream run events

Setup:
- Mock SSE endpoint
- Send events at intervals

Steps:
1. Render RunStreamView with runId
2. Verify connecting state
3. Send connected event
4. Verify status updated
5. Send agent events
6. Verify events in list
7. Send complete event
8. Verify final state
```

---

## E2E Test Examples

### CLI Commands

```
File: cli.test.ts

Test: agentgate list command

Steps:
1. Execute 'agentgate list --json'
2. Parse JSON output
3. Verify work order array
4. Verify exit code 0

Test: agentgate create command

Steps:
1. Execute 'agentgate create --prompt "Test" --repo owner/repo --json'
2. Parse JSON output
3. Verify work order ID returned
4. Verify exit code 0
```

### Interactive TUI

```
File: interactive.test.ts

Test: Create work order flow

Steps:
1. Launch TUI process
2. Press 'n' to create
3. Type prompt text
4. Press Tab
5. Type repo URL
6. Press Tab
7. Press Enter to submit
8. Verify success message
9. Exit with 'q'
```

---

## Mock Setup

### MSW Handlers

```
File: handlers.ts

Handlers:
1. GET /api/v1/work-orders
   - Returns mock work order list
   - Supports status filter
   - Supports pagination

2. GET /api/v1/work-orders/:id
   - Returns specific work order
   - Returns 404 for "nonexistent"

3. POST /api/v1/work-orders
   - Returns created work order
   - Returns 400 for invalid data

4. DELETE /api/v1/work-orders/:id
   - Returns 204 on success
   - Returns 404 for nonexistent

5. GET /api/v1/runs/:id/stream
   - SSE stream mock
   - Sends events at intervals

6. GET /health
   - Returns health status
```

### Mock Data

```
File: data.ts

Mock Work Orders:
- mockRunningWorkOrder: Status running, 2 runs
- mockSucceededWorkOrder: Status succeeded, PR created
- mockFailedWorkOrder: Status failed, with error
- mockQueuedWorkOrder: Status queued, no runs

Mock Runs:
- mockBuildingRun: In progress, iteration 2/5
- mockSucceededRun: Completed successfully
- mockFailedRun: Failed with build error

Mock Events:
- mockToolCallEvent: Read file
- mockOutputEvent: Agent output
- mockErrorEvent: Build error
```

---

## Coverage Requirements

### Per-Thrust Coverage

| Thrust | Unit | Integration | E2E |
|--------|------|-------------|-----|
| 1. Package Setup | 70% | - | Build test |
| 2. API Client | 90% | API flows | - |
| 3. Core Components | 85% | - | - |
| 4. Dashboard View | 80% | Navigation | - |
| 5. Work Orders View | 80% | CRUD flow | - |
| 6. Run Stream View | 80% | SSE flow | - |
| 7. Keyboard Nav | 85% | Full navigation | - |
| 8. Work Order Form | 80% | Submit flow | - |
| 9. Multi-Pane | 75% | Pane management | - |
| 10. CLI Integration | 80% | - | CLI commands |

### Coverage Thresholds

```
Global:
- Statements: 75%
- Branches: 70%
- Functions: 75%
- Lines: 75%

Critical Files (90%+):
- src/api/client.ts
- src/hooks/useKeyboard.ts
- src/commands/*.ts
```

---

## Test Commands

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch

# Run specific file
pnpm test src/components/core/__tests__/Badge.test.tsx

# Run specific pattern
pnpm test --grep "keyboard"

# Run integration tests only
pnpm test tests/integration/

# Run E2E tests
pnpm test:e2e

# Update snapshots
pnpm test -u
```

---

## CI/CD Integration

### Test Pipeline

```yaml
name: TUI Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install
      - run: pnpm --filter @agentgate/tui build
      - run: pnpm --filter @agentgate/tui test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: packages/tui/coverage/lcov.info
```

---

## Terminal Testing Considerations

### Terminal Emulation

```
Tests run in non-TTY environment.
Consider:
- No colors by default
- No cursor positioning
- Fixed terminal size

Mock terminal dimensions:
process.stdout.columns = 80
process.stdout.rows = 24
```

### Snapshot Testing

```
Use lastFrame() for snapshots.
Normalize:
- Remove ANSI codes if needed
- Consistent width padding
- Stable timestamps

Example:
expect(lastFrame()).toMatchSnapshot()
```

### Timing Considerations

```
Ink uses requestAnimationFrame.
In tests:
- Use fakeTimers
- Advance timers manually
- Wait for renders with act()
```

---

## Debugging Tests

### Debug Mode

```bash
# Run with debug output
DEBUG=agentgate:* pnpm test

# Run specific test with verbose
pnpm test --reporter=verbose Badge.test.tsx
```

### Common Issues

```
Issue: Test hangs
Solution: Check for unresolved promises, missing act() wrapper

Issue: lastFrame() is undefined
Solution: Wait for render with await or use act()

Issue: Keyboard events not captured
Solution: Check stdin.write() is after render

Issue: Colors in snapshots
Solution: Set NO_COLOR=1 or strip ANSI codes
```

---

## Test Data Management

### Fixtures

```
tests/fixtures/
├── workOrders.json     # Work order fixtures
├── runs.json           # Run fixtures
├── events.json         # SSE event fixtures
└── config.json         # Config fixtures
```

### Factory Functions

```
createMockWorkOrder(overrides?: Partial<WorkOrder>): WorkOrder
createMockRun(overrides?: Partial<Run>): Run
createMockEvent(type: string, data?: any): RunEvent
```

---

## Acceptance Test Checklist

### Before Release

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Coverage thresholds met
- [ ] No console errors in tests
- [ ] Snapshots up to date
- [ ] Manual smoke test on real terminal
- [ ] Test on Linux, macOS, Windows Terminal
