# 07: Appendices - Reference Materials

## A. Complete File Map

### Package Structure

```
packages/tui/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .eslintrc.cjs
│
├── src/
│   ├── index.tsx                    # Render entry point
│   ├── cli.ts                       # CLI argument parsing
│   ├── App.tsx                      # Root component with router
│   │
│   ├── api/
│   │   ├── client.ts                # HTTP API client
│   │   ├── types.ts                 # API type definitions
│   │   ├── stream.ts                # SSE streaming client
│   │   └── auth.ts                  # Token management
│   │
│   ├── screens/
│   │   ├── Login.tsx                # Login screen
│   │   ├── Home.tsx                 # Repository selection
│   │   ├── TaskInput.tsx            # Task entry
│   │   ├── Running.tsx              # Agent activity stream
│   │   ├── Verifying.tsx            # Verification progress
│   │   ├── Success.tsx              # Success result
│   │   ├── Failure.tsx              # Failure result
│   │   ├── Canceled.tsx             # Canceled result
│   │   ├── Iteration.tsx            # Iteration transition
│   │   ├── RunsList.tsx             # Runs history list
│   │   └── RunDetail.tsx            # Single run detail
│   │
│   ├── components/
│   │   ├── Box.tsx                  # Styled box with borders
│   │   ├── Header.tsx               # Screen header
│   │   ├── Footer.tsx               # Keyboard hints footer
│   │   ├── Spinner.tsx              # Loading spinner
│   │   ├── StatusBadge.tsx          # Status indicator
│   │   ├── RepoList.tsx             # Repository list
│   │   ├── TextInput.tsx            # Single-line input
│   │   ├── TextArea.tsx             # Multi-line input
│   │   ├── ActivityLog.tsx          # Agent activity stream
│   │   ├── VerificationStatus.tsx   # L0-L3 display
│   │   ├── HelpOverlay.tsx          # Help shortcuts overlay
│   │   ├── ErrorBoundary.tsx        # Error boundary
│   │   └── ConfirmDialog.tsx        # Confirmation dialog
│   │
│   ├── hooks/
│   │   ├── useApi.ts                # API request hook
│   │   ├── useAuth.ts               # Authentication state
│   │   ├── useRepos.ts              # Repository list
│   │   ├── useRun.ts                # Run state and streaming
│   │   ├── useRuns.ts               # Runs history
│   │   ├── useWorkOrder.ts          # Work order submission
│   │   └── useKeyboard.ts           # Keyboard handling
│   │
│   ├── store/
│   │   └── app.ts                   # Zustand app state
│   │
│   └── utils/
│       ├── config.ts                # Configuration management
│       ├── format.ts                # Time/size formatters
│       └── colors.ts                # Theme colors
│
└── test/
    ├── api/
    │   └── client.test.ts
    ├── screens/
    │   ├── Login.test.tsx
    │   ├── Home.test.tsx
    │   └── ...
    ├── components/
    │   └── ...
    └── hooks/
        └── ...
```

**Total: ~43 source files + ~20 test files**

---

## B. Implementation Checklist

### Phase 1: Foundation (Thrusts 1-3)

#### Thrust 1: Package Setup
- [ ] Create packages/tui directory
- [ ] Create package.json with dependencies
- [ ] Create tsconfig.json extending root
- [ ] Create vitest.config.ts
- [ ] Create tsup.config.ts
- [ ] Create src/index.tsx entry point
- [ ] Create src/cli.ts with Commander
- [ ] Create src/App.tsx root component
- [ ] Add to pnpm-workspace.yaml
- [ ] Verify pnpm install works
- [ ] Verify pnpm build produces dist/

#### Thrust 2: API Client
- [ ] Create src/api/types.ts
- [ ] Create src/api/client.ts
- [ ] Create src/api/stream.ts
- [ ] Create src/api/auth.ts
- [ ] Write unit tests for API client
- [ ] Verify API calls work with mock server

#### Thrust 3: Authentication
- [ ] Create src/screens/Login.tsx
- [ ] Create src/hooks/useAuth.ts
- [ ] Add auth routing to App.tsx
- [ ] Add logout command to cli.ts
- [ ] Test login flow end-to-end
- [ ] Verify token persistence

### Phase 2: Core Screens (Thrusts 4-6)

#### Thrust 4: Home Screen
- [ ] Create src/hooks/useRepos.ts
- [ ] Create src/components/RepoList.tsx
- [ ] Create src/components/TextInput.tsx
- [ ] Create src/screens/Home.tsx
- [ ] Test repo loading and filtering
- [ ] Test keyboard navigation

#### Thrust 5: Task Input
- [ ] Create src/components/TextArea.tsx
- [ ] Create src/screens/TaskInput.tsx
- [ ] Create src/hooks/useWorkOrder.ts
- [ ] Test task submission
- [ ] Verify work order creation

#### Thrust 6: Result Screens
- [ ] Create src/screens/Success.tsx
- [ ] Create src/screens/Failure.tsx
- [ ] Create src/screens/Canceled.tsx
- [ ] Create src/screens/Iteration.tsx
- [ ] Test all result states
- [ ] Verify PR link opening

### Phase 3: Streaming (Thrusts 7-8)

#### Thrust 7: Running Screen
- [ ] Create src/hooks/useRun.ts
- [ ] Create src/components/ActivityLog.tsx
- [ ] Create src/components/Spinner.tsx
- [ ] Create src/screens/Running.tsx
- [ ] Implement detach/reattach
- [ ] Test SSE streaming
- [ ] Test cancel flow

#### Thrust 8: Verification Display
- [ ] Create src/components/VerificationStatus.tsx
- [ ] Create src/screens/Verifying.tsx
- [ ] Add verification routing
- [ ] Test verification progress
- [ ] Test iteration transitions

### Phase 4: History & Polish (Thrusts 9-10)

#### Thrust 9: Runs History
- [ ] Create src/hooks/useRuns.ts
- [ ] Create src/screens/RunsList.tsx
- [ ] Create src/screens/RunDetail.tsx
- [ ] Add runs routing
- [ ] Test pagination
- [ ] Test run details

#### Thrust 10: Polish
- [ ] Create src/hooks/useKeyboard.ts
- [ ] Create src/components/HelpOverlay.tsx
- [ ] Create src/components/ErrorBoundary.tsx
- [ ] Create src/components/ConfirmDialog.tsx
- [ ] Create src/utils/config.ts
- [ ] Create src/utils/colors.ts
- [ ] Create src/components/Box.tsx
- [ ] Create src/components/Footer.tsx
- [ ] Visual polish pass
- [ ] Cross-platform testing

---

## C. API Endpoints Reference

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/auth/device` | POST | Start device auth | - | `{ deviceCode, verificationUrl, expiresIn }` |
| `/auth/device/:code` | GET | Poll auth status | - | `{ status, token?, user? }` |
| `/api/v1/repos` | GET | List user repos | - | `{ repos: Repository[] }` |
| `/api/v1/work-orders` | POST | Submit work order | `{ taskPrompt, workspaceSource, ... }` | `{ workOrder }` |
| `/api/v1/work-orders/:id` | GET | Get work order | - | `{ workOrder }` |
| `/api/v1/work-orders/:id` | DELETE | Cancel work order | - | `{ success }` |
| `/api/v1/runs` | GET | List runs | `?status=&limit=&offset=` | `{ runs, total }` |
| `/api/v1/runs/:id` | GET | Get run details | - | `{ run }` |
| `/api/v1/runs/:id/stream` | SSE | Stream activity | - | Event stream |

### SSE Event Types

| Event | Description | Data |
|-------|-------------|------|
| `agent:activity` | Agent tool use | `{ tool, file?, output? }` |
| `verification:start` | Verification began | `{ level }` |
| `verification:progress` | Level progress | `{ level, status, progress? }` |
| `verification:complete` | Level finished | `{ level, result }` |
| `run:completed` | Run finished | `{ result, prUrl?, error? }` |

---

## D. Keyboard Shortcuts Reference

### Global (All Screens)

| Key | Action |
|-----|--------|
| `q` | Quit (with confirmation if run active) |
| `?` | Toggle help overlay |
| `Ctrl+C` | Force quit |

### Home Screen

| Key | Action |
|-----|--------|
| `↑/k` | Move selection up |
| `↓/j` | Move selection down |
| `Enter` | Select repository |
| `r` | View runs history |
| `v` | View running task (if any) |
| Type | Filter repositories |
| `Esc` | Clear search |

### Task Input Screen

| Key | Action |
|-----|--------|
| `Enter` | Submit task (at end) |
| `Esc` | Go back to home |
| Arrow keys | Navigate within text |

### Running Screen

| Key | Action |
|-----|--------|
| `c` | Cancel run |
| `d` | Detach (run in background) |

### Result Screens

| Key | Action |
|-----|--------|
| `Enter` | Done, return to home |
| `o` | Open PR in browser (Success) |
| `r` | Retry with more iterations (Failure) |

### Runs List Screen

| Key | Action |
|-----|--------|
| `↑/k` | Move selection up |
| `↓/j` | Move selection down |
| `Enter` | View run details |
| `Esc` | Return to home |

### Run Detail Screen

| Key | Action |
|-----|--------|
| `o` | Open PR in browser |
| `Esc` | Return to runs list |

---

## E. Color Reference

### Status Colors

| Status | Color | Hex |
|--------|-------|-----|
| Success | Green | `#22C55E` |
| Error | Red | `#EF4444` |
| Warning | Yellow | `#EAB308` |
| Running | Cyan | `#06B6D4` |
| Waiting | Gray | `#6B7280` |

### Tool Type Colors

| Tool | Color | Hex |
|------|-------|-----|
| Read | Cyan | `#06B6D4` |
| Edit | Orange | `#F97316` |
| Write | Green | `#22C55E` |
| Bash | Magenta | `#A855F7` |
| Error | Red | `#EF4444` |

### UI Colors

| Element | Color | Hex |
|---------|-------|-----|
| Border | Dim | `#4B5563` |
| Background | Dark | `#1F2937` |
| Text Primary | White | `#F9FAFB` |
| Text Secondary | Gray | `#9CA3AF` |
| Text Dim | Dark Gray | `#6B7280` |

---

## F. Testing Strategy

### Unit Tests

- API client methods (mocked HTTP)
- Hooks in isolation (mocked dependencies)
- Utility functions

### Component Tests

Using ink-testing-library:
- Render components in isolation
- Simulate keyboard input
- Assert on rendered output

### Integration Tests

- Full screen flows with mock server
- Navigation between screens
- State management across screens

### Manual Testing Checklist

- [ ] macOS Terminal.app
- [ ] macOS iTerm2
- [ ] Linux GNOME Terminal
- [ ] Linux Konsole
- [ ] Windows Terminal
- [ ] VS Code integrated terminal
- [ ] SSH session
- [ ] tmux session
- [ ] Screen session
- [ ] Minimum size (80x24)
- [ ] Large size (200x50)

---

## G. Dependencies

### Production

```json
{
  "ink": "^5.0.0",
  "react": "^18.3.0",
  "@inkjs/ui": "^2.0.0",
  "zustand": "^4.5.0",
  "commander": "^12.0.0",
  "ky": "^1.2.0",
  "eventsource": "^2.0.0",
  "chalk": "^5.3.0",
  "open": "^10.0.0",
  "date-fns": "^3.0.0"
}
```

### Development

```json
{
  "@types/react": "^18.3.0",
  "@types/eventsource": "^1.1.0",
  "typescript": "^5.6.0",
  "vitest": "^2.0.0",
  "ink-testing-library": "^4.0.0",
  "tsup": "^8.0.0"
}
```

---

## H. Dog Fooding Work Orders

### Thrust 1: Package Setup
```
Create the packages/tui package for the AgentGate terminal UI.
Set up package.json with ink, react, zustand, commander, ky, chalk.
Create tsconfig.json extending the root config.
Create a basic entry point that renders "AgentGate TUI" to the terminal.
Add the package to pnpm-workspace.yaml.
Ensure pnpm install and pnpm build work.
```

### Thrust 4: Home Screen
```
Create the Home screen for packages/tui.
It should display a list of repositories fetched from /api/v1/repos.
Include a search box that filters repositories as the user types.
Use keyboard navigation (up/down arrows, j/k keys).
Pressing Enter should trigger a callback with the selected repo.
Pressing 'r' should trigger a callback to view runs.
```

### Full TUI Implementation
```
Implement the AgentGate TUI in packages/tui following the design spec in docs/DevGuides/DevGuide_v0.2.28.
Start with the package setup, then implement screens in order:
Login, Home, TaskInput, Running, Verifying, Success, Failure.
Use React + Ink for the terminal UI.
Use Zustand for state management.
Use ky for HTTP requests and eventsource for SSE streaming.
Follow the screen designs in the DevGuide.
```

---

**End of DevGuide v0.2.28**
