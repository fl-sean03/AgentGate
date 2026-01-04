# 01: Overview - TUI Architecture

## Current State

AgentGate currently operates via:
1. **HTTP API** - Submit work orders, check status
2. **Web Dashboard** - Monitor runs (packages/dashboard)
3. **CLI Commands** - Basic `agentgate submit`, `agentgate status`

Developers who want a terminal-native experience must cobble together curl commands or use the basic CLI, which lacks the aesthetic and real-time feedback that modern developer tools provide.

---

## Target State

A beautiful, focused TUI that:
- Feels like Claude Code or Gemini CLI
- Shows real-time agent activity with clear visual hierarchy
- Requires minimal keystrokes to submit tasks
- Provides instant feedback on verification status
- Links directly to PRs on completion

---

## Design Principles

### 1. Aesthetic Minimalism

The TUI uses box-drawing characters and careful spacing to create a calm, professional appearance:

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│  Content goes here with generous padding                   │
│                                                            │
╰────────────────────────────────────────────────────────────╯
```

- **Rounded corners** (`╭╮╰╯`) for a softer look
- **Consistent 60-80 character width** for readability
- **Vertical breathing room** - never cramped
- **Muted colors** - pastels over neons

### 2. Progressive Disclosure

Show only what's relevant:
- Home screen: repos + search, nothing else
- Running screen: agent activity, nothing else
- Result screen: outcome + PR link, nothing else

No sidebars, no status bars, no tabs. One focused view at a time.

### 3. Keyboard-First

Every action is one or two keystrokes:
- `Enter` to confirm
- `Esc` to go back
- Single letters for actions (`c` cancel, `r` runs)
- Arrow keys for navigation

Mouse support is optional—power users shouldn't need it.

### 4. Graceful Degradation

The TUI adapts to different terminal capabilities:
- Falls back to ASCII if Unicode unavailable
- Uses fewer colors if terminal doesn't support 256
- Works in 80x24 minimum terminal size
- Handles resize events gracefully

---

## Screen Designs

### Login Screen

First-time experience. Clean and welcoming.

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│                                                            │
│                      Welcome to AgentGate                  │
│                                                            │
│           AI-powered code changes, verified & delivered    │
│                                                            │
│                                                            │
│                                                            │
│                  Press Enter to login                      │
│                                                            │
│            (Opens browser for authentication)              │
│                                                            │
│                                                            │
│                                                            │
╰────────────────────────────────────────────────────────────╯
```

After pressing Enter, shows waiting state:

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│                                                            │
│                                                            │
│                                                            │
│                 ◐ Waiting for authentication...            │
│                                                            │
│          Complete login in your browser to continue        │
│                                                            │
│                                                            │
│                                                            │
│                                                            │
│                                                            │
│                                                            │
╰────────────────────────────────────────────────────────────╯
```

### Home Screen

Primary screen after login. Repository list with search.

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│  Search repositories...                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │                                                    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  Your Repositories                                         │
│                                                            │
│  ▸ anthropic/claude-code                       updated 2h  │
│    anthropic/claude-sdk                        updated 1d  │
│    mycompany/backend-api                       updated 1d  │
│    mycompany/frontend                          updated 3d  │
│    mycompany/shared-utils                      updated 1w  │
│    mycompany/mobile-app                        updated 2w  │
│                                                            │
│                                                            │
│  [↑↓] Select  [Enter] Choose  [r] Runs  [q] Quit           │
╰────────────────────────────────────────────────────────────╯
```

With active search:

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│  Search repositories...                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │ backend                                            │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  Matching                                                  │
│                                                            │
│  ▸ mycompany/backend-api                       updated 1d  │
│    mycompany/backend-worker                    updated 3d  │
│    mycompany/backend-common                    updated 1w  │
│                                                            │
│                                                            │
│                                                            │
│                                                            │
│                                                            │
│  [↑↓] Select  [Enter] Choose  [Esc] Clear  [q] Quit        │
╰────────────────────────────────────────────────────────────╯
```

With running task banner:

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│  ● Running: mycompany/backend-api "Add rate limiting" 3m   │
│                                                            │
│  ───────────────────────────────────────────────────────   │
│                                                            │
│  Search repositories...                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │                                                    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  ▸ anthropic/claude-code                       updated 2h  │
│    anthropic/claude-sdk                        updated 1d  │
│    mycompany/backend-api                       updated 1d  │
│                                                            │
│  [↑↓] Select  [Enter] Choose  [v] View running  [q] Quit   │
╰────────────────────────────────────────────────────────────╯
```

### Task Input Screen

Simple multi-line text entry:

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│  mycompany/backend-api                                     │
│                                                            │
│  ───────────────────────────────────────────────────────   │
│                                                            │
│  What would you like to do?                                │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Add rate limiting to the /api/users endpoint.     │    │
│  │ Limit to 100 requests per minute per API key.     │    │
│  │ Return 429 status when exceeded with a            │    │
│  │ Retry-After header._                              │    │
│  │                                                    │    │
│  │                                                    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                            │
│  [Enter] Start  [Esc] Back                                 │
╰────────────────────────────────────────────────────────────╯
```

### Running Screen

Real-time agent activity with iteration counter and elapsed time:

```
╭─ AgentGate ──────────────────────────────── iter 1 · 1m 23s ╮
│                                                             │
│  mycompany/backend-api                                      │
│  Add rate limiting to the /api/users endpoint               │
│                                                             │
│  ────────────────────────────────────────────────────────   │
│                                                             │
│  Read   src/routes/users.ts                                 │
│         Found /api/users endpoint at line 45                │
│                                                             │
│  Read   src/middleware/index.ts                             │
│         Checking existing middleware                        │
│                                                             │
│  Write  src/middleware/rate-limit.ts                        │
│         Created rate limiting middleware                    │
│                                                             │
│  Edit   src/routes/users.ts:12                              │
│         Added rate limit middleware import                  │
│                                                             │
│  ● Agent working...                                         │
│                                                             │
│  [c] Cancel  [d] Detach                                     │
╰─────────────────────────────────────────────────────────────╯
```

Tool type colors:
- **Read** - Cyan/blue
- **Edit** - Yellow/orange
- **Write** - Green
- **Bash** - Magenta
- **Error** - Red

### Verifying Screen

After agent completes, show verification progress:

```
╭─ AgentGate ──────────────────────────────── iter 1 · 3m 12s ╮
│                                                             │
│  mycompany/backend-api                                      │
│  Add rate limiting to the /api/users endpoint               │
│                                                             │
│  ────────────────────────────────────────────────────────   │
│                                                             │
│  Agent completed. Verifying changes...                      │
│                                                             │
│  ✓ L0 Contracts       Passed                                │
│  ● L1 Tests           Running (12/18)                       │
│  ○ L2 Integration     Waiting                               │
│  ○ L3 Build           Waiting                               │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│  [c] Cancel                                                 │
╰─────────────────────────────────────────────────────────────╯
```

Status indicators:
- `✓` - Passed (green)
- `●` - Running (yellow, animated)
- `○` - Waiting (dim)
- `✗` - Failed (red)

### Success Screen

Clean completion with PR link:

```
╭─ AgentGate ─────────────────────────────────────── SUCCESS ─╮
│                                                             │
│  ✓ Task completed                                           │
│                                                             │
│  mycompany/backend-api                                      │
│  Add rate limiting to the /api/users endpoint               │
│                                                             │
│  ────────────────────────────────────────────────────────   │
│                                                             │
│  Duration       4m 32s                                      │
│  Iterations     2                                           │
│  Files changed  4                                           │
│                                                             │
│  Verification   All passed                                  │
│    L0 Contracts ✓  L1 Tests ✓  L2 Integration ✓  L3 Build ✓ │
│                                                             │
│  Pull Request                                               │
│  github.com/mycompany/backend-api/pull/127                  │
│                                                             │
│  [Enter] Done  [o] Open PR in browser                       │
╰─────────────────────────────────────────────────────────────╯
```

### Failure Screen

Clear failure with actionable options:

```
╭─ AgentGate ──────────────────────────────────────── FAILED ─╮
│                                                             │
│  ✗ Task failed after 3 iterations                           │
│                                                             │
│  mycompany/backend-api                                      │
│  Add rate limiting to the /api/users endpoint               │
│                                                             │
│  ────────────────────────────────────────────────────────   │
│                                                             │
│  L1 Tests still failing:                                    │
│                                                             │
│    rate-limit.test.ts:45                                    │
│    Retry-After header value incorrect                       │
│    Expected: 60, Got: 3600                                  │
│                                                             │
│  The agent couldn't resolve this issue automatically.       │
│  You may need to fix this manually or adjust the task.      │
│                                                             │
│                                                             │
│  [Enter] Done  [r] Retry with more iterations               │
╰─────────────────────────────────────────────────────────────╯
```

### Iteration Screen

When verification fails but iterations remain:

```
╭─ AgentGate ─────────────────────────────── iter 1 · FAILED ─╮
│                                                             │
│  mycompany/backend-api                                      │
│  Add rate limiting to the /api/users endpoint               │
│                                                             │
│  ────────────────────────────────────────────────────────   │
│                                                             │
│  ✓ L0 Contracts       Passed                                │
│  ✗ L1 Tests           2 failing                             │
│                                                             │
│    rate-limit.test.ts:23                                    │
│    Expected 429 status, got 500                             │
│                                                             │
│    rate-limit.test.ts:45                                    │
│    Retry-After header missing                               │
│                                                             │
│  ────────────────────────────────────────────────────────   │
│                                                             │
│  Starting iteration 2 of 3...                               │
│                                                             │
│  [c] Cancel                                                 │
╰─────────────────────────────────────────────────────────────╯
```

### Runs List Screen

History of recent runs:

```
╭─ AgentGate ──────────────────────────────────────── Runs ───╮
│                                                             │
│                                                             │
│  ● mycompany/backend-api                            3m ago  │
│    Add rate limiting to the /api/users endpoint             │
│                                                             │
│  ✓ anthropic/claude-code                           1h ago   │
│    Fix authentication bug in login.ts                       │
│                                                             │
│  ✓ mycompany/frontend                              2h ago   │
│    Add dark mode toggle to settings                         │
│                                                             │
│  ✗ mycompany/backend-api                           5h ago   │
│    Refactor database connection pooling                     │
│                                                             │
│  ✓ anthropic/claude-sdk                           1d ago    │
│    Update TypeScript definitions                            │
│                                                             │
│                                                             │
│  [↑↓] Select  [Enter] View details  [Esc] Back              │
╰─────────────────────────────────────────────────────────────╯
```

### Run Detail Screen

Single run details:

```
╭─ AgentGate ─────────────────────────────────── Run Details ─╮
│                                                             │
│  ✓ anthropic/claude-code                                    │
│    Fix authentication bug in login.ts                       │
│                                                             │
│  ────────────────────────────────────────────────────────   │
│                                                             │
│  Status         Succeeded                                   │
│  Started        Today at 2:34 PM                            │
│  Duration       4m 32s                                      │
│  Iterations     2                                           │
│                                                             │
│  Files Changed                                              │
│    src/auth/login.ts                                        │
│    src/auth/session.ts                                      │
│    src/tests/auth.test.ts                                   │
│                                                             │
│  Pull Request                                               │
│  github.com/anthropic/claude-code/pull/127                  │
│                                                             │
│  [o] Open PR  [Esc] Back                                    │
╰─────────────────────────────────────────────────────────────╯
```

### Canceled Screen

Clean cancellation message:

```
╭─ AgentGate ─────────────────────────────────────── CANCELED ╮
│                                                             │
│  Task canceled                                              │
│                                                             │
│  mycompany/backend-api                                      │
│  Add rate limiting to the /api/users endpoint               │
│                                                             │
│  ────────────────────────────────────────────────────────   │
│                                                             │
│  The task was canceled after 2m 15s.                        │
│  No changes were pushed.                                    │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│  [Enter] Done                                               │
╰─────────────────────────────────────────────────────────────╯
```

---

## Color Palette

Using muted, professional colors:

| Element | Color | Hex |
|---------|-------|-----|
| Border | Dim white | `#888888` |
| Header text | Bright white | `#FFFFFF` |
| Body text | White | `#CCCCCC` |
| Dim text | Gray | `#666666` |
| Success | Green | `#22C55E` |
| Error | Red | `#EF4444` |
| Warning | Yellow | `#EAB308` |
| Running | Cyan | `#06B6D4` |
| Read tool | Cyan | `#06B6D4` |
| Edit tool | Orange | `#F97316` |
| Write tool | Green | `#22C55E` |
| Bash tool | Magenta | `#A855F7` |

---

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/device` | POST | Initiate device auth flow |
| `/auth/device/:code` | GET | Poll for auth completion |
| `/api/v1/repos` | GET | List user's GitHub repos |
| `/api/v1/work-orders` | POST | Submit work order |
| `/api/v1/work-orders/:id` | GET | Get work order status |
| `/api/v1/work-orders/:id` | DELETE | Cancel work order |
| `/api/v1/runs` | GET | List runs |
| `/api/v1/runs/:id` | GET | Get run details |
| `/api/v1/runs/:id/stream` | SSE | Stream run activity |

---

## Configuration

Config stored in `~/.agentgate/config.json`:

```json
{
  "apiUrl": "https://api.agentgate.dev",
  "token": "eyJ...",
  "refreshToken": "eyJ...",
  "tokenExpiresAt": "2024-01-15T00:00:00Z"
}
```

CLI flags override config:
- `--api-url` - Override API URL
- `--token` - Use specific token

Environment variables:
- `AGENTGATE_API_URL` - API URL
- `AGENTGATE_TOKEN` - Auth token

---

## Error Handling

### Network Errors

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│  Connection Error                                          │
│                                                            │
│  Could not connect to AgentGate server.                    │
│                                                            │
│  • Check your internet connection                          │
│  • Server may be temporarily unavailable                   │
│                                                            │
│  [r] Retry  [q] Quit                                       │
│                                                            │
╰────────────────────────────────────────────────────────────╯
```

### Auth Errors

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│  Session Expired                                           │
│                                                            │
│  Your session has expired. Please log in again.            │
│                                                            │
│  [Enter] Login  [q] Quit                                   │
│                                                            │
╰────────────────────────────────────────────────────────────╯
```

### Rate Limit Errors

```
╭─ AgentGate ────────────────────────────────────────────────╮
│                                                            │
│  Rate Limited                                              │
│                                                            │
│  Too many requests. Please wait 30 seconds.                │
│                                                            │
│  Retrying automatically in 28s...                          │
│                                                            │
╰────────────────────────────────────────────────────────────╯
```

---

## Accessibility

- All colors have sufficient contrast
- Status never conveyed by color alone (icons + text)
- Screen reader compatible (semantic structure)
- Keyboard-only navigation is fully supported
- No flashing or rapid animations
