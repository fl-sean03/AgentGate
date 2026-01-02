# 01: Overview - Terminal User Interface

## Research Summary

### Industry Analysis

| Tool | Language | Framework | Open Source |
|------|----------|-----------|-------------|
| **Claude Code** | TypeScript | React + Ink | No |
| **Gemini CLI** | TypeScript | React + Ink 6 | **Yes** |
| **OpenCode (SST)** | Go | Bubble Tea | **Yes** |
| **Aider** | Python | prompt_toolkit | **Yes** |

### Our Decision: React + Ink

**Rationale:**
- Dashboard already uses React + TypeScript
- Same team can work on both UIs
- Shared types from `packages/shared`
- Gemini CLI is open source reference

---

## Architecture Design

### Package Structure

```
packages/tui/
├── src/
│   ├── index.tsx           # Entry point
│   ├── App.tsx             # Root component
│   ├── cli.ts              # Commander.js CLI
│   ├── api/
│   │   ├── client.ts       # HTTP client
│   │   └── sse.ts          # SSE streaming
│   ├── store/
│   │   ├── app.ts          # Zustand state
│   │   └── navigation.ts   # View history
│   ├── hooks/
│   │   ├── useWorkOrders.ts
│   │   ├── useRunStream.ts
│   │   └── useKeyboard.ts
│   ├── components/
│   │   ├── core/           # Box, Badge, Spinner
│   │   ├── views/          # Full-screen views
│   │   ├── panels/         # Reusable panels
│   │   └── forms/          # Input components
│   └── commands/
│       ├── status.ts
│       ├── list.ts
│       └── watch.ts
├── package.json
└── tsconfig.json
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI | Ink 5+ | React for terminal |
| Layout | Yoga | Flexbox |
| Components | @inkjs/ui | Pre-built widgets |
| State | Zustand | UI state |
| CLI | Commander.js | Arguments |
| HTTP | ky | API requests |
| SSE | eventsource | Streaming |

---

## Data Flow

```
Terminal (TTY)
    │
    ▼
Ink Renderer
    │ ├── App.tsx
    │ └── Views (Dashboard, WorkOrders, RunStream)
    ▼
State Layer
    │ ├── Zustand (UI state)
    │ ├── React Query (Server data)
    │ └── useKeyboard (Input)
    ▼
API Layer
    │ ├── HTTP Client
    │ └── SSE Client
    ▼
AgentGate Server (localhost:3000)
```

---

## Key Components

### Core Components
- `Box` - Styled container with borders
- `Badge` - Status indicator (running, succeeded, failed)
- `Spinner` - Loading animation
- `Table` - Data table with columns
- `KeyHint` - Keyboard shortcut display

### View Components
- `DashboardView` - Stats + recent work orders
- `WorkOrdersView` - Navigable list
- `RunStreamView` - Real-time agent output
- `MultiPaneView` - Split screen (tmux-like)

---

## Keyboard Shortcuts

### Global
| Key | Action |
|-----|--------|
| `q` | Quit |
| `?` | Help |
| `d` | Dashboard |
| `w` | Work orders |
| `n` | New work order |

### Navigation
| Key | Action |
|-----|--------|
| `j/↓` | Move down |
| `k/↑` | Move up |
| `Enter` | Select |
| `Esc/←` | Back |

---

## CLI Commands

```bash
agentgate                    # Interactive TUI
agentgate status             # Dashboard view
agentgate list               # Work order list
agentgate watch <id>         # Stream run output
agentgate create --prompt "" # Create work order
```

---

## Dependencies

```json
{
  "dependencies": {
    "ink": "^5.0.0",
    "@inkjs/ui": "^2.0.0",
    "react": "^18.3.0",
    "zustand": "^4.5.0",
    "commander": "^12.0.0",
    "ky": "^1.2.0",
    "eventsource": "^2.0.0"
  }
}
```

---

## References

- [Gemini CLI (open source)](https://github.com/google-gemini/gemini-cli)
- [Ink documentation](https://github.com/vadimdemedes/ink)
- [Claude Code architecture](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
