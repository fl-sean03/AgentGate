# 00: Index - Terminal User Interface (TUI)

## DevGuide v0.2.21

**Title:** Terminal User Interface (TUI) Implementation
**Status:** Planning
**Author:** Claude (via TUI research session)
**Date:** 2026-01-02
**Prerequisites:** v0.2.20 (Dashboard Enhancement)
**Triggered By:** Need for terminal-based monitoring and control

---

## Executive Summary

AgentGate currently offers a web-based dashboard for monitoring work orders and runs. This DevGuide introduces a terminal user interface (TUI) using **React + Ink**, following the same architecture as Claude Code and Gemini CLI. The TUI enables developers to monitor and control AgentGate without leaving their terminal.

---

## Problem Statement

### Why a TUI?

1. **DevOps Workflow** - Monitor work orders from SSH sessions, servers, CI/CD
2. **Low Overhead** - No browser needed, works over SSH
3. **Multi-tasking** - tmux users can have AgentGate in one pane, coding in another
4. **Quick Status** - `agentgate status` shows everything at a glance
5. **Keyboard-centric** - Power users prefer vim-style navigation

### Industry Precedent

| Tool | TUI Framework | Language |
|------|---------------|----------|
| Claude Code | React + Ink | TypeScript |
| Gemini CLI | React + Ink | TypeScript |
| OpenCode (SST) | Bubble Tea | Go |
| Aider | prompt_toolkit | Python |

### Our Approach

Follow Claude Code and Gemini CLI's architecture:
- **React + Ink** for component-based TUI
- **TypeScript** for type safety
- **Shared types** from `packages/shared`
- **Same API** as web dashboard

---

## Success Criteria

After v0.2.21:

1. **Monitor work orders** - List, filter, view details from terminal
2. **Stream run output** - Real-time agent activity in terminal
3. **Create work orders** - Interactive form or CLI flags
4. **Keyboard navigation** - vim-like keybindings
5. **Multi-pane view** - Monitor multiple runs simultaneously
6. **Cross-platform** - Works on Linux, macOS, Windows Terminal

---

## Thrust Overview

### Phase 1: Foundation (Thrusts 1-3)

| # | Name | Description | Files |
|---|------|-------------|-------|
| 1 | Package Setup | Create packages/tui with Ink | 8 |
| 2 | API Client | Reusable API client for TUI | 4 |
| 3 | Core Components | Box, Text, Badge, Spinner | 6 |

### Phase 2: Main Views (Thrusts 4-6)

| # | Name | Description | Files |
|---|------|-------------|-------|
| 4 | Dashboard View | Stats, recent work orders | 4 |
| 5 | Work Order List | Navigable work order list | 5 |
| 6 | Run Stream View | Real-time agent output | 5 |

### Phase 3: Interactivity (Thrusts 7-9)

| # | Name | Description | Files |
|---|------|-------------|-------|
| 7 | Keyboard Navigation | vim-like keybindings | 4 |
| 8 | Work Order Creation | Interactive form | 4 |
| 9 | Multi-Pane Mode | Split views (tmux-like) | 5 |

### Phase 4: Polish (Thrust 10)

| # | Name | Description | Files |
|---|------|-------------|-------|
| 10 | CLI Integration | Commands, flags, config | 6 |

---

## Architecture

### Package Structure

```
packages/
├── dashboard/        # Existing React web UI
├── tui/              # NEW: Ink-based Terminal UI
│   ├── src/
│   │   ├── index.tsx           # Entry point
│   │   ├── App.tsx             # Main Ink app
│   │   ├── cli.ts              # CLI argument parsing
│   │   ├── components/
│   │   │   ├── core/           # Primitives (Box, Text, Badge)
│   │   │   ├── views/          # Full-screen views
│   │   │   ├── panels/         # Reusable panels
│   │   │   └── forms/          # Input components
│   │   ├── hooks/
│   │   │   ├── useApi.ts
│   │   │   ├── useKeyboard.ts
│   │   │   ├── useWorkOrders.ts
│   │   │   └── useRunStream.ts
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── store/
│   │   │   └── app-state.ts
│   │   └── utils/
│   │       ├── colors.ts
│   │       └── format.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── shared/           # Shared types (existing)
└── server/           # API server (existing)
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Framework | Ink 5+ | React for terminal |
| Layout | Yoga (via Ink) | Flexbox in terminal |
| Components | @inkjs/ui | Pre-built widgets |
| State | Zustand | Lightweight state management |
| CLI Parsing | Commander.js | Command-line arguments |
| HTTP | ky / fetch | API requests |
| SSE | eventsource | Run streaming |
| Testing | ink-testing-library | Component tests |

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Terminal (stdout/stdin)                   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Ink Renderer                                               │
│  ├── App.tsx (root component)                               │
│  ├── Router (view switching)                                │
│  └── Views (Dashboard, WorkOrders, RunStream)               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Hooks Layer                                                │
│  ├── useWorkOrders() - fetch work orders                    │
│  ├── useRunStream() - SSE connection                        │
│  ├── useKeyboard() - input handling                         │
│  └── useAppState() - Zustand store                          │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  API Client                                                 │
│  ├── HTTP: GET/POST/DELETE work orders, runs                │
│  └── SSE: /api/v1/runs/:id/stream                          │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  AgentGate Server (localhost:3000)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## File Map

### Phase 1: Foundation

| File | Thrust | Purpose |
|------|--------|---------|
| `packages/tui/package.json` | 1 | Package configuration |
| `packages/tui/tsconfig.json` | 1 | TypeScript config |
| `packages/tui/src/index.tsx` | 1 | Entry point |
| `packages/tui/src/App.tsx` | 1 | Main app component |
| `packages/tui/src/cli.ts` | 1 | CLI argument parsing |
| `packages/tui/src/api/client.ts` | 2 | API client |
| `packages/tui/src/components/core/Box.tsx` | 3 | Styled box wrapper |
| `packages/tui/src/components/core/Badge.tsx` | 3 | Status badge |
| `packages/tui/src/components/core/Spinner.tsx` | 3 | Loading indicator |
| `packages/tui/src/components/core/Table.tsx` | 3 | Data table |

### Phase 2: Main Views

| File | Thrust | Purpose |
|------|--------|---------|
| `src/components/views/DashboardView.tsx` | 4 | Main dashboard |
| `src/components/views/WorkOrdersView.tsx` | 5 | Work order list |
| `src/components/views/WorkOrderDetailView.tsx` | 5 | Single work order |
| `src/components/views/RunStreamView.tsx` | 6 | Real-time run view |
| `src/components/panels/StatsPanel.tsx` | 4 | Statistics display |
| `src/components/panels/WorkOrderCard.tsx` | 5 | Work order row |
| `src/components/panels/EventList.tsx` | 6 | Agent events |
| `src/hooks/useWorkOrders.ts` | 5 | Work order data |
| `src/hooks/useRunStream.ts` | 6 | SSE streaming |

### Phase 3: Interactivity

| File | Thrust | Purpose |
|------|--------|---------|
| `src/hooks/useKeyboard.ts` | 7 | Keyboard handling |
| `src/hooks/useNavigation.ts` | 7 | View navigation |
| `src/components/forms/WorkOrderForm.tsx` | 8 | Create form |
| `src/components/forms/TextInput.tsx` | 8 | Text input |
| `src/components/forms/Select.tsx` | 8 | Dropdown select |
| `src/components/views/MultiPaneView.tsx` | 9 | Split view |
| `src/components/panels/PaneManager.tsx` | 9 | Pane management |
| `src/store/panes.ts` | 9 | Pane state |

### Phase 4: CLI Integration

| File | Thrust | Purpose |
|------|--------|---------|
| `src/cli.ts` | 10 | Enhanced CLI |
| `src/commands/status.ts` | 10 | `agentgate status` |
| `src/commands/create.ts` | 10 | `agentgate create` |
| `src/commands/watch.ts` | 10 | `agentgate watch <id>` |
| `src/commands/list.ts` | 10 | `agentgate list` |
| `src/config/settings.ts` | 10 | User config |

---

## UI Mockups

### Dashboard View

```
┌─ AgentGate ─────────────────────────────────────────────────┐
│                                                             │
│  Work Orders          Runs            System                │
│  ┌─────────────┐     ┌─────────────┐  ┌─────────────┐      │
│  │ Total: 47   │     │ Active: 3   │  │ ● Healthy   │      │
│  │ Running: 3  │     │ Today: 12   │  │ Uptime: 4d  │      │
│  │ Failed: 2   │     │ Success: 89%│  │ CPU: 23%    │      │
│  └─────────────┘     └─────────────┘  └─────────────┘      │
│                                                             │
│  Recent Work Orders                                         │
│  ───────────────────────────────────────────────────────── │
│  ● FHC3pJst  running   Phase 3 implementation      2m ago  │
│  ● GZlV380i  running   Fix issue #65               5m ago  │
│  ✓ x3Uir8xH  succeeded Fix sandbox default        12m ago  │
│  ✗ abc12345  failed    Build optimization         1h ago   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [d]ashboard [w]ork-orders [r]uns [n]ew [q]uit   ? for help │
└─────────────────────────────────────────────────────────────┘
```

### Work Order List

```
┌─ Work Orders ─────────────────────────────────── Filter: All ┐
│                                                              │
│  Status    ID          Prompt                     Created    │
│  ──────────────────────────────────────────────────────────  │
│ ▶● running  FHC3pJst   Phase 3 implementation     2m ago    │
│  ● running  GZlV380i   Fix issue #65              5m ago    │
│  ✓ success  x3Uir8xH   Fix sandbox default       12m ago    │
│  ✓ success  VMARSZ6w   Fix empty errors          15m ago    │
│  ✗ failed   abc12345   Build optimization         1h ago    │
│  ✓ success  def67890   Add logging                2h ago    │
│  ● queued   ghi11111   Refactor tests             2h ago    │
│                                                              │
│  Page 1/5                                                    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [↑↓] navigate [enter] view [f]ilter [n]ew [/] search [q]uit │
└──────────────────────────────────────────────────────────────┘
```

### Run Stream View

```
┌─ Run: FHC3pJst ─────────────────────────────────── Iteration 2/5 ┐
│                                                                   │
│  Status: ● building    Branch: agentgate/run-FHC3pJst            │
│  Started: 2m ago       Duration: 2m 34s                          │
│                                                                   │
│  Agent Activity                                                   │
│  ─────────────────────────────────────────────────────────────── │
│  01:45:32 [read]   packages/server/src/orchestrator.ts           │
│  01:45:33 [read]   packages/server/src/types/run.ts              │
│  01:45:35 [edit]   packages/server/src/orchestrator.ts:234       │
│  01:45:36 [output] Adding WorkspaceManager facade...             │
│  01:45:38 [edit]   packages/server/src/workspace/manager.ts      │
│  01:45:40 [bash]   npm run build                                 │
│  01:45:41 [output] Build started...                              │
│  █████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░ 45%           │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│ [o]utput [t]ool-calls [f]iles [e]rrors [←] back [c]ancel [q]uit  │
└───────────────────────────────────────────────────────────────────┘
```

### Multi-Pane View

```
┌─ AgentGate ─────────────────────────────────────────────────────┐
│ ┌─ Run: FHC3pJst ─────────────┐ ┌─ Run: GZlV380i ─────────────┐ │
│ │ Status: ● building          │ │ Status: ● building          │ │
│ │ Iteration: 2/5              │ │ Iteration: 1/3              │ │
│ │                             │ │                             │ │
│ │ [edit] orchestrator.ts:234  │ │ [read] run-executor.ts      │ │
│ │ [output] Adding facade...   │ │ [output] Analyzing bug...   │ │
│ │ [bash] npm run build        │ │ [edit] run-executor.ts:65   │ │
│ │ █████████░░░░░░░░ 45%       │ │ ████░░░░░░░░░░░░░ 20%       │ │
│ └─────────────────────────────┘ └─────────────────────────────┘ │
│ ┌─ Run: x3Uir8xH ─────────────┐ ┌─ System Health ─────────────┐ │
│ │ Status: ✓ succeeded         │ │ ● API: Healthy              │ │
│ │ Duration: 12m 34s           │ │ ● DB: Healthy               │ │
│ │ PR: github.com/...#72       │ │ ● Sandbox: Docker OK        │ │
│ │                             │ │                             │ │
│ │ Verification: L0✓ L1✓ L2✓   │ │ Active: 3/10                │ │
│ └─────────────────────────────┘ └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ [1-4] focus pane [+] add pane [-] remove [=] layout [q]uit      │
└─────────────────────────────────────────────────────────────────┘
```

---

## CLI Commands

```bash
# Interactive mode (full TUI)
agentgate

# Dashboard view
agentgate dashboard
agentgate status

# Work order management
agentgate list [--status running|succeeded|failed]
agentgate create --prompt "Fix the bug" --repo owner/repo
agentgate view <work-order-id>
agentgate cancel <work-order-id>

# Run monitoring
agentgate watch <work-order-id>     # Stream run output
agentgate watch <run-id>            # Stream specific run

# Multi-pane
agentgate watch <id1> <id2> <id3>   # Watch multiple runs

# Configuration
agentgate config set api-url http://localhost:3000
agentgate config set api-key <key>
```

---

## Keyboard Shortcuts

### Global

| Key | Action |
|-----|--------|
| `q` | Quit application |
| `?` | Show help |
| `d` | Go to dashboard |
| `w` | Go to work orders |
| `n` | Create new work order |
| `Ctrl+C` | Force quit |

### Navigation

| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `Enter` | Select / View details |
| `Esc` / `←` | Go back |
| `g` | Go to top |
| `G` | Go to bottom |
| `/` | Search |

### Work Order View

| Key | Action |
|-----|--------|
| `r` | Trigger new run |
| `c` | Cancel work order |
| `p` | View PR |

### Run Stream View

| Key | Action |
|-----|--------|
| `o` | Output tab |
| `t` | Tool calls tab |
| `f` | Files tab |
| `e` | Errors tab |
| `Space` | Pause/resume stream |

### Multi-Pane

| Key | Action |
|-----|--------|
| `1-9` | Focus pane N |
| `Tab` | Next pane |
| `+` | Add pane |
| `-` | Remove pane |
| `=` | Cycle layout |

---

## Dependencies

### Production

```json
{
  "dependencies": {
    "ink": "^5.0.0",
    "ink-spinner": "^5.0.0",
    "@inkjs/ui": "^2.0.0",
    "react": "^18.3.0",
    "zustand": "^4.5.0",
    "commander": "^12.0.0",
    "ky": "^1.2.0",
    "eventsource": "^2.0.0",
    "chalk": "^5.3.0",
    "date-fns": "^3.0.0"
  }
}
```

### Development

```json
{
  "devDependencies": {
    "@types/react": "^18.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "ink-testing-library": "^4.0.0",
    "tsup": "^8.0.0"
  }
}
```

---

## Navigation

| Document | Contents |
|----------|----------|
| [01-overview.md](./01-overview.md) | Research, architecture decisions |
| [02-package-setup.md](./02-package-setup.md) | Thrust 1: Package initialization |
| [03-api-client.md](./03-api-client.md) | Thrust 2: API client layer |
| [04-core-components.md](./04-core-components.md) | Thrust 3: Core components |
| [05-dashboard-view.md](./05-dashboard-view.md) | Thrust 4: Dashboard view |
| [06-work-orders-view.md](./06-work-orders-view.md) | Thrust 5: Work order list |
| [07-run-stream-view.md](./07-run-stream-view.md) | Thrust 6: Run streaming |
| [08-keyboard-nav.md](./08-keyboard-nav.md) | Thrust 7: Keyboard navigation |
| [09-work-order-form.md](./09-work-order-form.md) | Thrust 8: Work order creation |
| [10-multi-pane.md](./10-multi-pane.md) | Thrust 9: Multi-pane mode |
| [11-cli-integration.md](./11-cli-integration.md) | Thrust 10: CLI commands |
| [12-testing.md](./12-testing.md) | Testing strategy |
| [13-appendices.md](./13-appendices.md) | Checklists, references |
| [14-execution-plan.md](./14-execution-plan.md) | Implementation sequence |

---

## Open Questions

1. **Command name?** - `agentgate` vs `ag` vs `agctl`?
2. **Config location?** - `~/.agentgate/config.json` or `~/.config/agentgate/`?
3. **Color themes?** - Support custom color schemes?
4. **Mouse support?** - Ink supports mouse, worth adding?
5. **Notifications?** - Desktop notifications when runs complete?

---

## References

- [Gemini CLI (open source)](https://github.com/google-gemini/gemini-cli)
- [Ink documentation](https://github.com/vadimdemedes/ink)
- [Ink UI components](https://github.com/inkjs/ui)
- [ink-testing-library](https://github.com/vadimdemedes/ink-testing-library)
- [Claude Code architecture](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)

---

## Quick Reference

### Phase 1 Priority (Foundation)

```bash
# Create package and install dependencies
mkdir -p packages/tui/src
cd packages/tui
pnpm init
pnpm add ink react @inkjs/ui zustand commander ky eventsource chalk date-fns
pnpm add -D typescript @types/react vitest ink-testing-library tsup

# Files to create in order:
1. package.json (with bin entry)
2. tsconfig.json
3. src/index.tsx
4. src/App.tsx
5. src/cli.ts
6. src/api/client.ts
```

### Key Component Pattern

```tsx
// Ink component example
import React from 'react';
import { Box, Text } from 'ink';
import { useWorkOrders } from '../hooks/useWorkOrders';

export const WorkOrdersView: React.FC = () => {
  const { data, isLoading, error } = useWorkOrders();

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text color="red">Error: {error.message}</Text>;

  return (
    <Box flexDirection="column">
      <Text bold>Work Orders</Text>
      {data?.map((wo) => (
        <Box key={wo.id}>
          <Text color={wo.status === 'running' ? 'yellow' : 'green'}>
            {wo.status === 'running' ? '●' : '✓'}
          </Text>
          <Text> {wo.id.slice(0, 8)} </Text>
          <Text dimColor>{wo.taskPrompt.slice(0, 40)}...</Text>
        </Box>
      ))}
    </Box>
  );
};
```
