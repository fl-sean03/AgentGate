# 14: Execution Plan - Terminal User Interface

## Phase Overview

| Phase | Thrusts | Description |
|-------|---------|-------------|
| 1 | 1-3 | Foundation (Package, API, Core) |
| 2 | 4-6 | Main Views |
| 3 | 7-9 | Interactivity |
| 4 | 10 | CLI Integration |

---

## Phase 1: Foundation (Thrusts 1-3)

### Thrust 1: Package Setup

**Files to Create:**
- `packages/tui/package.json`
- `packages/tui/tsconfig.json`
- `packages/tui/src/index.tsx`
- `packages/tui/src/App.tsx`
- `packages/tui/src/cli.ts`

**Commands:**
```bash
mkdir -p packages/tui/src
cd packages/tui
pnpm init
pnpm add ink react @inkjs/ui zustand commander ky eventsource chalk
pnpm add -D typescript @types/react vitest ink-testing-library tsup
```

**Acceptance Criteria:**
- [ ] Package builds with tsup
- [ ] `agentgate` command runs
- [ ] Basic App renders in terminal

### Thrust 2: API Client

**Files to Create:**
- `src/api/client.ts`
- `src/api/sse.ts`
- `src/hooks/useApi.ts`

**Acceptance Criteria:**
- [ ] Can fetch work orders
- [ ] Can connect to SSE stream
- [ ] Error handling works

### Thrust 3: Core Components

**Files to Create:**
- `src/components/core/Box.tsx`
- `src/components/core/Badge.tsx`
- `src/components/core/Spinner.tsx`
- `src/components/core/Table.tsx`
- `src/components/core/KeyHint.tsx`

**Acceptance Criteria:**
- [ ] Components render correctly
- [ ] Status colors work
- [ ] Unit tests pass

---

## Phase 2: Main Views (Thrusts 4-6)

### Thrust 4: Dashboard View

**Files to Create:**
- `src/components/views/DashboardView.tsx`
- `src/components/panels/StatsPanel.tsx`
- `src/hooks/useWorkOrders.ts`

**Acceptance Criteria:**
- [ ] Shows stats (total, running, failed)
- [ ] Lists recent work orders
- [ ] Keyboard shortcuts work

### Thrust 5: Work Order List

**Files to Create:**
- `src/components/views/WorkOrdersView.tsx`
- `src/components/views/WorkOrderDetailView.tsx`
- `src/components/panels/WorkOrderCard.tsx`
- `src/store/navigation.ts`

**Acceptance Criteria:**
- [ ] Navigate with j/k arrows
- [ ] Enter opens detail view
- [ ] Filter by status

### Thrust 6: Run Stream View

**Files to Create:**
- `src/components/views/RunStreamView.tsx`
- `src/components/panels/EventList.tsx`
- `src/components/panels/OutputPanel.tsx`
- `src/hooks/useRunStream.ts`

**Acceptance Criteria:**
- [ ] SSE connection established
- [ ] Events render in real-time
- [ ] Status updates live

---

## Phase 3: Interactivity (Thrusts 7-9)

### Thrust 7: Keyboard Navigation

**Files to Create:**
- `src/hooks/useKeyboard.ts`
- `src/hooks/useNavigation.ts`
- `src/components/panels/HelpPanel.tsx`

**Acceptance Criteria:**
- [ ] Global shortcuts (q, d, w, n)
- [ ] Vim navigation (j, k, g, G)
- [ ] ? shows help panel

### Thrust 8: Work Order Creation

**Files to Create:**
- `src/components/views/CreateWorkOrderView.tsx`
- `src/components/forms/TextInput.tsx`
- `src/components/forms/Select.tsx`
- `src/components/forms/WorkOrderForm.tsx`

**Acceptance Criteria:**
- [ ] Form with prompt, repo fields
- [ ] Tab navigation between fields
- [ ] Submit creates work order

### Thrust 9: Multi-Pane Mode

**Files to Create:**
- `src/components/views/MultiPaneView.tsx`
- `src/components/panels/PaneManager.tsx`
- `src/store/panes.ts`

**Acceptance Criteria:**
- [ ] Split screen (2-4 panes)
- [ ] Focus switching with 1-4 keys
- [ ] + to add pane, - to remove

---

## Phase 4: CLI Integration (Thrust 10)

### Thrust 10: CLI Commands

**Files to Create:**
- `src/commands/status.ts`
- `src/commands/list.ts`
- `src/commands/watch.ts`
- `src/commands/create.ts`
- `src/config/settings.ts`

**Acceptance Criteria:**
- [ ] `agentgate status` works
- [ ] `agentgate list --status running` works
- [ ] `agentgate watch <id>` streams
- [ ] Config persists in ~/.agentgate/

---

## Work Order Prompts

### Phase 1
```
Create packages/tui with Ink-based terminal UI for AgentGate (v0.2.21 Thrusts 1-3).

Set up package with React + Ink, create API client, and build core components
(Box, Badge, Spinner, Table). Use Zustand for state, Commander for CLI.

Reference: docs/DevGuides/DevGuide_v0.2.21/
Reference: https://github.com/google-gemini/gemini-cli for patterns
```

### Phase 2
```
Implement main views for AgentGate TUI (v0.2.21 Thrusts 4-6).

Create DashboardView with stats, WorkOrdersView with navigation,
and RunStreamView with SSE streaming. Use vim-like keybindings.

Reference: docs/DevGuides/DevGuide_v0.2.21/
```

### Phase 3
```
Add interactivity to AgentGate TUI (v0.2.21 Thrusts 7-9).

Implement keyboard navigation, work order creation form, and multi-pane
mode for monitoring multiple runs simultaneously.

Reference: docs/DevGuides/DevGuide_v0.2.21/
```

### Phase 4
```
Complete CLI integration for AgentGate TUI (v0.2.21 Thrust 10).

Add subcommands: status, list, watch, create. Support config file
at ~/.agentgate/config.json for api-url and api-key.

Reference: docs/DevGuides/DevGuide_v0.2.21/
```

---

## UI Mockups

### Dashboard
```
┌─ AgentGate ─────────────────────────────────────┐
│  Work Orders     Runs          System           │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ Total: 47 │  │ Active: 3 │  │ ● Healthy │   │
│  │ Running: 3│  │ Today: 12 │  │ Uptime: 4d│   │
│  └───────────┘  └───────────┘  └───────────┘   │
│                                                 │
│  Recent Work Orders                             │
│  ● FHC3pJst  running   Phase 3...      2m ago  │
│  ✓ x3Uir8xH  succeeded Fix sandbox... 12m ago  │
│  ✗ abc12345  failed    Build opt...    1h ago  │
├─────────────────────────────────────────────────┤
│ [d]ashboard [w]ork-orders [n]ew [q]uit  ?=help │
└─────────────────────────────────────────────────┘
```

### Run Stream
```
┌─ Run: FHC3pJst ─────────────── Iteration 2/5 ──┐
│  Status: ● building    Branch: agentgate/...   │
│  Started: 2m ago       Duration: 2m 34s        │
│                                                 │
│  Agent Activity                                 │
│  01:45:32 [read]   orchestrator.ts             │
│  01:45:35 [edit]   orchestrator.ts:234         │
│  01:45:38 [bash]   npm run build               │
│  ████████████░░░░░░░░░░░░░░░░░░ 45%            │
├─────────────────────────────────────────────────┤
│ [o]utput [t]ool-calls [←] back [c]ancel [q]uit │
└─────────────────────────────────────────────────┘
```

---

## Verification Checklist

### Phase 1 Complete When:
- [ ] `pnpm build` succeeds in packages/tui
- [ ] `agentgate` command shows empty dashboard
- [ ] Core components have unit tests

### Phase 2 Complete When:
- [ ] Dashboard shows real data from API
- [ ] Can navigate work order list
- [ ] Run streaming works

### Phase 3 Complete When:
- [ ] All keyboard shortcuts work
- [ ] Can create work order from TUI
- [ ] Multi-pane mode works

### Phase 4 Complete When:
- [ ] All CLI subcommands work
- [ ] Config file persists settings
- [ ] Can run non-interactively
