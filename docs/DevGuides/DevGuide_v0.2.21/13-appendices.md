# 13: Appendices

## A. API Schema Reference

### Work Order Schema

```
WorkOrder {
  id: string (nanoid, 8 chars)
  taskPrompt: string (10-2000 chars)
  repoUrl: string (valid GitHub URL)
  status: WorkOrderStatus
  profileName: string
  createdAt: ISO8601 timestamp
  updatedAt: ISO8601 timestamp
  prUrl: string | null
  runs: Run[]
}

WorkOrderStatus:
  "queued" | "running" | "succeeded" | "failed" | "cancelled"
```

### Run Schema

```
Run {
  id: string
  workOrderId: string
  number: number (1-based)
  status: RunStatus
  profileName: string
  startedAt: ISO8601 timestamp
  completedAt: ISO8601 timestamp | null
  iterations: Iteration[]
  currentIteration: number
  maxIterations: number
  branchName: string | null
}

RunStatus:
  "queued" | "starting" | "building" | "testing" |
  "verifying" | "succeeded" | "failed" | "cancelled"
```

### Iteration Schema

```
Iteration {
  number: number
  status: IterationStatus
  startedAt: ISO8601 timestamp
  completedAt: ISO8601 timestamp | null
  verification: VerificationResult
  metrics: IterationMetrics
}

IterationStatus:
  "running" | "succeeded" | "failed"

VerificationResult {
  l0Passed: boolean | null
  l1Passed: boolean | null
  l2Passed: boolean | null
  l3Passed: boolean | null
  overallPassed: boolean
}

IterationMetrics {
  durationMs: number
  tokensUsed: { input: number, output: number } | null
  toolCallCount: number
  fileChanges: number
}
```

### Health Schema

```
HealthStatus {
  status: "healthy" | "degraded" | "unhealthy"
  version: string
  uptime: number (seconds)
  timestamp: ISO8601
  limits: {
    maxConcurrentWorkOrders: number
    activeWorkOrders: number
  }
  drivers: {
    [driverName]: {
      available: boolean
      configured: boolean
      lastUsed: ISO8601 | null
    }
  }
  sandbox: {
    enabled: boolean
    provider: "docker" | "local" | "none"
    healthy: boolean
  }
}
```

### SSE Event Schemas

```
RunStatusEvent {
  type: "run:status"
  status: RunStatus
  iteration: number | null
  timestamp: ISO8601
}

AgentToolEvent {
  type: "agent:event"
  eventType: "tool_call"
  tool: "Read" | "Edit" | "Bash" | "Glob" | "Grep"
  target: string
  durationMs: number | null
  timestamp: ISO8601
}

AgentOutputEvent {
  type: "agent:event"
  eventType: "output"
  content: string
  timestamp: ISO8601
}

ErrorEvent {
  type: "error"
  code: string
  message: string
  details: unknown | null
  timestamp: ISO8601
}
```

---

## B. Component Inventory

### Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Box | components/core/ | Styled container |
| Badge | components/core/ | Status indicator |
| Spinner | components/core/ | Loading animation |
| Table | components/core/ | Data table |
| KeyHint | components/core/ | Shortcut display |
| ProgressBar | components/core/ | Progress indicator |
| ErrorBox | components/core/ | Error display |

### View Components

| Component | Location | Purpose |
|-----------|----------|---------|
| DashboardView | components/views/ | Main dashboard |
| WorkOrdersView | components/views/ | Work order list |
| WorkOrderDetailView | components/views/ | Single work order |
| RunStreamView | components/views/ | Run streaming |
| CreateWorkOrderView | components/views/ | Create form |
| MultiPaneView | components/views/ | Multi-pane mode |
| HelpPanel | components/panels/ | Help overlay |

### Panel Components

| Component | Location | Purpose |
|-----------|----------|---------|
| StatsCard | components/panels/ | Stat display |
| StatsRow | components/panels/ | Stats layout |
| WorkOrderRow | components/panels/ | Work order item |
| RunHeader | components/panels/ | Run info header |
| EventList | components/panels/ | Event stream |
| ToolCallList | components/panels/ | Tool call list |
| FileDiff | components/panels/ | Diff display |
| FilterPanel | components/panels/ | Filter overlay |
| Pane | components/panels/ | Multi-pane item |

### Form Components

| Component | Location | Purpose |
|-----------|----------|---------|
| TextInput | components/forms/ | Text input |
| TextArea | components/forms/ | Multi-line input |
| Select | components/forms/ | Dropdown |
| Button | components/forms/ | Button |
| FormField | components/forms/ | Field wrapper |

---

## C. Hooks Inventory

| Hook | Purpose | File |
|------|---------|------|
| useApi | API client access | hooks/useApi.ts |
| useWorkOrders | Fetch work orders | hooks/useWorkOrders.ts |
| useWorkOrder | Fetch single work order | hooks/useWorkOrder.ts |
| useHealth | Fetch health status | hooks/useHealth.ts |
| useRunStream | SSE streaming | hooks/useRunStream.ts |
| useKeyboard | Keyboard input | hooks/useKeyboard.ts |
| useGlobalKeys | Global shortcuts | hooks/useGlobalKeys.ts |
| useNavigation | View navigation | hooks/useNavigation.ts |
| useCreateWorkOrder | Create mutation | hooks/useCreateWorkOrder.ts |
| useProfiles | Fetch profiles | hooks/useProfiles.ts |

---

## D. Keyboard Shortcuts Reference

### Global Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| q | Quit | Everywhere |
| ? | Help | Everywhere |
| d | Dashboard | Everywhere |
| w | Work orders | Everywhere |
| n | New work order | Everywhere |
| Ctrl+C | Force quit | Everywhere |
| Esc | Back/Cancel | Everywhere |

### Navigation Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| j / ↓ | Move down | Lists |
| k / ↑ | Move up | Lists |
| g | Go to top | Lists |
| G | Go to bottom | Lists |
| Enter | Select/Open | Lists |
| [ / ] | Prev/Next page | Paginated lists |

### View-Specific Shortcuts

| Key | Action | View |
|-----|--------|------|
| r | Refresh | Dashboard |
| f | Filter | Work Orders |
| / | Search | Work Orders |
| t | Trigger run | Work Order Detail |
| c | Cancel | Work Order Detail, Run Stream |
| p | Open PR | Work Order Detail |
| o | Output tab | Run Stream |
| Space | Pause/Resume | Run Stream |
| 1-4 | Focus pane | Multi-Pane |
| + | Add pane | Multi-Pane |
| - | Remove pane | Multi-Pane |
| = | Cycle layout | Multi-Pane |

---

## E. Color Palette

### Status Colors

| Status | Color | Chalk | Icon |
|--------|-------|-------|------|
| running | yellow | chalk.yellow | ● |
| succeeded | green | chalk.green | ✓ |
| failed | red | chalk.red | ✗ |
| queued | gray | chalk.gray | ○ |
| cancelled | gray (dim) | chalk.dim | ○ |

### UI Colors

| Element | Light Terminal | Dark Terminal |
|---------|----------------|---------------|
| Text | white | white |
| Muted text | gray | gray |
| Border | white | white |
| Focus border | cyan | cyan |
| Error border | red | red |
| Success | green | green |
| Warning | yellow | yellow |
| Primary | blue | blue |

---

## F. Terminal Compatibility

### Supported Terminals

| Terminal | Support Level |
|----------|---------------|
| iTerm2 | Full |
| Terminal.app | Full |
| GNOME Terminal | Full |
| Konsole | Full |
| Windows Terminal | Full |
| VS Code Terminal | Full |
| Alacritty | Full |
| Hyper | Full |
| tmux | Full (with proper TERM) |
| SSH sessions | Full |

### Minimum Requirements

| Feature | Requirement |
|---------|-------------|
| Columns | 80 minimum |
| Rows | 24 minimum |
| Colors | 256 color support |
| Unicode | UTF-8 support |
| ANSI | Standard escape sequences |

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| TERM | Terminal type | xterm-256color |
| NO_COLOR | Disable colors | (unset) |
| FORCE_COLOR | Force colors | (unset) |
| COLUMNS | Override width | auto-detect |
| LINES | Override height | auto-detect |

---

## G. Error Codes

### CLI Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Command-specific error |
| 3 | Connection error |
| 4 | Authentication error |
| 5 | Validation error |
| 130 | Interrupted (Ctrl+C) |

### API Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| VALIDATION_ERROR | 400 | Invalid input |
| UNAUTHORIZED | 401 | Missing/invalid API key |
| FORBIDDEN | 403 | Not permitted |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Already exists/running |
| RATE_LIMITED | 429 | Too many requests |
| SERVER_ERROR | 500 | Server error |

---

## H. Configuration Reference

### Config File Location

```
Linux/macOS: ~/.agentgate/config.json
Windows: %APPDATA%\agentgate\config.json
Override: AGENTGATE_CONFIG_DIR
```

### Config Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| apiUrl | string | http://localhost:3000 | Server URL |
| apiKey | string | null | API authentication key |
| defaultProfile | string | "default" | Default profile |
| color | boolean | true | Enable colors |
| jsonOutput | boolean | false | Default to JSON |
| timeout | number | 30000 | Request timeout (ms) |

### Environment Variables

| Variable | Config Key | Priority |
|----------|------------|----------|
| AGENTGATE_API_URL | apiUrl | 2 |
| AGENTGATE_API_KEY | apiKey | 2 |
| AGENTGATE_TIMEOUT | timeout | 2 |
| NO_COLOR | color (false) | 2 |

Priority: 1 = CLI flags, 2 = Env vars, 3 = Config file, 4 = Defaults

---

## I. Glossary

| Term | Definition |
|------|------------|
| Work Order | A request for AgentGate to perform a task |
| Run | A single execution attempt for a work order |
| Iteration | One agent loop within a run |
| Profile | Named configuration for harness settings |
| Driver | Agent implementation (e.g., Claude Code) |
| SSE | Server-Sent Events for real-time streaming |
| TUI | Terminal User Interface |
| Pane | Individual window in multi-pane mode |
| Verification | L0-L3 checks that validate agent output |

---

## J. Related Documents

| Document | Description |
|----------|-------------|
| DevGuide v0.2.19 | Observability & Reliability |
| DevGuide v0.2.20 | Dashboard Enhancement |
| API Documentation | Full API reference |
| packages/shared | Shared TypeScript types |

---

## K. Reference Links

| Resource | URL |
|----------|-----|
| Ink GitHub | https://github.com/vadimdemedes/ink |
| Ink Docs | https://github.com/vadimdemedes/ink#readme |
| Ink UI | https://github.com/inkjs/ui |
| ink-testing-library | https://github.com/vadimdemedes/ink-testing-library |
| Gemini CLI (reference) | https://github.com/google-gemini/gemini-cli |
| Commander.js | https://github.com/tj/commander.js |
| Zustand | https://github.com/pmndrs/zustand |
| ky HTTP client | https://github.com/sindresorhus/ky |

---

## L. Changelog Template

```
## v0.2.21 Changelog

### Added
- Terminal User Interface (TUI) with React + Ink
- Dashboard view with stats and recent work orders
- Work order list with filtering and search
- Real-time run streaming via SSE
- Vim-style keyboard navigation
- Interactive work order creation form
- Multi-pane mode for monitoring multiple runs
- CLI commands: status, list, watch, create, cancel, trigger
- Configuration management with config command
- JSON output option for scripting

### Dependencies
- ink ^5.0.0
- @inkjs/ui ^2.0.0
- zustand ^4.5.0
- commander ^12.0.0
- ky ^1.2.0
- eventsource ^2.0.0
```

---

## M. Quick Start Guide

### Installation

```bash
# Install globally
npm install -g @agentgate/tui

# Or run with npx
npx @agentgate/tui
```

### Configuration

```bash
# Set server URL
agentgate config set api-url http://localhost:3000

# Set API key
agentgate config set api-key sk-your-key

# Verify configuration
agentgate config show
```

### Basic Usage

```bash
# Launch interactive TUI
agentgate

# Check status
agentgate status

# List work orders
agentgate list

# Watch a run
agentgate watch FHC3pJst

# Create work order
agentgate create --prompt "Fix bug" --repo owner/repo
```

### Keyboard Navigation

```
Global:  q=quit  ?=help  d=dashboard  w=work-orders  n=new
Lists:   j/k=up/down  g/G=top/bottom  Enter=select  Esc=back
Run:     o=output  t=tools  f=files  e=errors  Space=pause
Panes:   1-4=focus  +=add  -=remove  ==layout
```
