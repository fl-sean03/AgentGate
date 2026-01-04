# DevGuide v0.2.28: Terminal User Interface (TUI)

**Version**: 0.2.28
**Title**: Terminal User Interface (TUI)
**Status**: Planning
**Prerequisites**: v0.2.27 (Dog Fooding Readiness)
**Depends On**: Website authentication (v0.2.29) for OAuth flow

---

## Executive Summary

This DevGuide implements a **terminal user interface (TUI)** for AgentGate using React + Ink, following the patterns established by Claude Code and Gemini CLI. The TUI provides a beautiful, focused interface for submitting work orders, watching agent execution, and viewing results—all from the terminal.

**Key Principle**: The TUI is for **doing**, not **managing**. All account setup, billing, and configuration happens on the website (v0.2.29). The TUI is a streamlined tool for developers who want to submit tasks and watch agents work.

---

## Problem Statement

Developers want to:
1. Submit AI coding tasks without leaving their terminal
2. Watch agent activity in real-time with a clean, aesthetic interface
3. See verification progress and results immediately
4. Get PR links when tasks complete successfully
5. Check on past runs quickly

They don't want to:
- Open a browser for every task
- Use a complex dashboard with many options
- Manage billing/settings in the terminal
- Learn many commands

---

## Success Criteria

After v0.2.28 implementation:

1. **First-time login** takes under 30 seconds (browser OAuth)
2. **Task submission** takes 3 steps: select repo → type task → press Enter
3. **Real-time streaming** shows agent activity beautifully
4. **Verification progress** is visible with clear pass/fail indicators
5. **Success screen** displays PR link, one keypress opens browser
6. **Runs list** shows recent history with status indicators
7. **Keyboard-driven** - mouse optional, vim-style navigation
8. **Cross-platform** - Works on macOS, Linux, Windows Terminal

---

## Thrust Overview

| Phase | Thrust | Name | Description | Files |
|-------|--------|------|-------------|-------|
| 1 | 1 | Package Setup | Create packages/tui with React + Ink | 6 |
| 1 | 2 | API Client | HTTP client for server communication | 4 |
| 1 | 3 | Authentication | Browser-based OAuth flow | 5 |
| 2 | 4 | Home Screen | Repository list with search | 4 |
| 2 | 5 | Task Input | Multi-line task entry | 3 |
| 2 | 6 | Result Screens | Success, failure, canceled states | 4 |
| 3 | 7 | Running Screen | Real-time agent activity stream | 5 |
| 3 | 8 | Verification Display | L0-L3 progress indicators | 3 |
| 4 | 9 | Runs History | List and detail views | 4 |
| 4 | 10 | Polish | Keyboard nav, animations, errors | 5 |

**Total Files**: ~43 new files

---

## Architecture Overview

### Package Structure

```
packages/
├── tui/                      # NEW: Terminal UI package
│   ├── src/
│   │   ├── index.tsx         # Entry point
│   │   ├── App.tsx           # Root component with router
│   │   ├── cli.ts            # CLI argument parsing
│   │   │
│   │   ├── api/
│   │   │   ├── client.ts     # API client (ky-based)
│   │   │   ├── types.ts      # API response types
│   │   │   └── auth.ts       # Auth token management
│   │   │
│   │   ├── screens/
│   │   │   ├── Login.tsx     # First-time authentication
│   │   │   ├── Home.tsx      # Repository selection
│   │   │   ├── TaskInput.tsx # Task entry
│   │   │   ├── Running.tsx   # Agent activity stream
│   │   │   ├── Verifying.tsx # Verification progress
│   │   │   ├── Success.tsx   # Task completed
│   │   │   ├── Failure.tsx   # Task failed
│   │   │   ├── Canceled.tsx  # Task canceled
│   │   │   ├── RunsList.tsx  # History list
│   │   │   └── RunDetail.tsx # Single run view
│   │   │
│   │   ├── components/
│   │   │   ├── Box.tsx       # Styled box with borders
│   │   │   ├── Header.tsx    # Screen header
│   │   │   ├── Footer.tsx    # Keyboard hints
│   │   │   ├── Spinner.tsx   # Loading indicator
│   │   │   ├── StatusBadge.tsx # Status indicators
│   │   │   ├── RepoList.tsx  # Repository list
│   │   │   ├── TextInput.tsx # Text input field
│   │   │   ├── TextArea.tsx  # Multi-line input
│   │   │   ├── ActivityLog.tsx # Agent activity stream
│   │   │   └── VerificationStatus.tsx # L0-L3 display
│   │   │
│   │   ├── hooks/
│   │   │   ├── useApi.ts     # API request hook
│   │   │   ├── useAuth.ts    # Authentication state
│   │   │   ├── useRepos.ts   # Repository list
│   │   │   ├── useRun.ts     # Run state and streaming
│   │   │   └── useKeyboard.ts # Keyboard handling
│   │   │
│   │   ├── store/
│   │   │   └── app.ts        # Zustand app state
│   │   │
│   │   └── utils/
│   │       ├── config.ts     # Config file (~/.agentgate)
│   │       ├── format.ts     # Time, size formatters
│   │       └── colors.ts     # Theme colors
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── server/                   # Existing server
└── shared/                   # Shared types
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Framework | Ink 5.x | React for terminal |
| React | React 18.x | Component model |
| State | Zustand | Lightweight state management |
| HTTP | ky | HTTP client |
| SSE | eventsource | Real-time streaming |
| CLI | Commander.js | Argument parsing |
| Styling | chalk | Terminal colors |
| Spinners | ora / ink-spinner | Loading states |

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Terminal (stdout/stdin)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Ink Renderer                                               │
│  ├── App.tsx (root + screen router)                         │
│  └── Screens (Login, Home, Running, etc.)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Hooks Layer                                                │
│  ├── useAuth() - token management                           │
│  ├── useRepos() - fetch GitHub repos                        │
│  ├── useRun() - work order + run state                      │
│  └── useKeyboard() - input handling                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  API Client                                                 │
│  ├── HTTP: REST endpoints                                   │
│  └── SSE: /api/v1/runs/:id/stream                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  AgentGate Server (https://api.agentgate.dev)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Screen Flow

```
                    ┌──────────────┐
                    │    Login     │ (first time only)
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
            ┌───────│     Home     │◄──────────────┐
            │       │ (repo list)  │               │
            │       └──────┬───────┘               │
            │              │                       │
            │    [Enter]   │ select repo           │
            │              ▼                       │
            │       ┌──────────────┐               │
            │       │  Task Input  │               │
            │       └──────┬───────┘               │
            │              │                       │
            │    [Enter]   │ submit                │
            │              ▼                       │
            │       ┌──────────────┐               │
            │       │   Running    │───[c]cancel───┤
            │       │  (streaming) │               │
            │       └──────┬───────┘               │
            │              │                       │
            │              ▼                       │
            │       ┌──────────────┐               │
            │       │  Verifying   │               │
            │       └──────┬───────┘               │
            │              │                       │
            │              ▼                       │
            │       ┌──────────────┐               │
            │       │    Result    │───[Enter]─────┘
            │       │(success/fail)│
            │       └──────────────┘
            │
   [r] runs │
            ▼
     ┌──────────────┐
     │   Runs List  │───[Enter]───► Run Detail
     └──────────────┘
```

---

## Document Navigation

| File | Contents |
|------|----------|
| [01-overview.md](./01-overview.md) | Detailed architecture, design decisions |
| [02-foundation.md](./02-foundation.md) | Thrusts 1-3: Package, API, Auth |
| [03-core-screens.md](./03-core-screens.md) | Thrusts 4-6: Home, Input, Results |
| [04-streaming.md](./04-streaming.md) | Thrusts 7-8: Running, Verification |
| [05-history.md](./05-history.md) | Thrust 9: Runs list and detail |
| [06-polish.md](./06-polish.md) | Thrust 10: Final polish |
| [07-appendices.md](./07-appendices.md) | File map, checklists, reference |

---

## Quick Reference

### Commands

```bash
# Start TUI (interactive mode)
agentgate

# Direct task submission (opens TUI at task input)
agentgate run owner/repo

# Check runs without TUI
agentgate runs

# Logout
agentgate logout
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit |
| `Esc` | Back / Cancel |
| `Enter` | Select / Confirm |
| `↑/↓` or `j/k` | Navigate |
| `r` | View runs (from Home) |
| `v` | View running task (from Home) |
| `c` | Cancel (during run) |
| `d` | Detach (during run) |
| `o` | Open PR in browser |

---

## Dependencies on v0.2.29 (Website)

The TUI depends on website infrastructure for:

1. **OAuth Endpoints** - `/auth/device` for device code flow
2. **Token Validation** - API validates tokens issued by website
3. **GitHub Connection** - Website connects user's GitHub account
4. **Repository API** - `/api/v1/repos` returns user's connected repos

Until the website is implemented, these can be mocked or use direct API key authentication as a fallback.

---

## Implementation Notes

### No Code in DevGuide

This guide describes **what** to build, not **how**. Implementation details:
- Follow existing patterns in `packages/server`
- Use Ink documentation for component patterns
- Reference Claude Code/Gemini CLI for inspiration

### Phased Implementation

1. **Phase 1 (Foundation)**: Can submit work orders via CLI flags
2. **Phase 2 (Core Screens)**: Full interactive flow works
3. **Phase 3 (Streaming)**: Real-time updates visible
4. **Phase 4 (Polish)**: Production-ready experience

### Testing Strategy

- Unit tests for hooks and utilities
- Component tests with ink-testing-library
- Integration tests against mock server
- Manual testing on macOS, Linux, Windows
