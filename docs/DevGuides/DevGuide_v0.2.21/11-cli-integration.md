# 11: Thrust 10 - CLI Integration

## Objective

Complete the command-line interface with subcommands for non-interactive use, configuration management, and integration with shell workflows.

---

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F10.1 | Interactive TUI on bare command | Must Have |
| F10.2 | status subcommand | Must Have |
| F10.3 | list subcommand | Must Have |
| F10.4 | watch subcommand | Must Have |
| F10.5 | create subcommand | Must Have |
| F10.6 | config subcommand | Must Have |
| F10.7 | JSON output option | Should Have |
| F10.8 | Quiet/verbose modes | Should Have |
| F10.9 | Shell completions | Could Have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N10.1 | Fast startup (< 500ms) | Should Have |
| N10.2 | Works in non-TTY environments | Must Have |
| N10.3 | Exit codes for scripting | Must Have |

---

## Command Structure

### Command Tree

```
agentgate
├── (no subcommand)    # Launch interactive TUI
├── status             # Show dashboard summary
├── list               # List work orders
├── watch              # Stream run output
├── create             # Create work order
├── cancel             # Cancel work order
├── trigger            # Trigger new run
├── config             # Manage configuration
│   ├── get            # Get config value
│   ├── set            # Set config value
│   └── show           # Show all config
├── version            # Show version
└── help               # Show help
```

---

## Command Specifications

### Base Command

```
agentgate [options]

Options:
  --api-url <url>      Server URL (default: http://localhost:3000)
  --api-key <key>      API key for authentication
  --no-color           Disable colored output
  --json               Output as JSON (for applicable commands)
  -v, --verbose        Verbose output
  -q, --quiet          Quiet mode (errors only)
  -h, --help           Show help
  -V, --version        Show version

Behavior:
  - No subcommand: Launch interactive TUI
  - With subcommand: Run command and exit
```

### status

```
agentgate status [options]

Description:
  Show dashboard summary with work order stats, run stats, and health.

Options:
  --json               Output as JSON

Output (default):
  AgentGate Status
  ================

  Work Orders
    Total:    47
    Running:   3
    Failed:    2
    Queued:    1

  Runs
    Active:    3
    Today:    12
    Success:  89%

  System
    Status:   healthy
    Uptime:   4d 2h 15m
    Capacity: 3/10

Output (--json):
  {
    "workOrders": { "total": 47, "running": 3, "failed": 2, "queued": 1 },
    "runs": { "active": 3, "today": 12, "successRate": 0.89 },
    "health": { "status": "healthy", "uptime": 360900, "capacity": { "active": 3, "max": 10 } }
  }

Exit Codes:
  0 - Success
  1 - Connection error
  2 - Unhealthy status
```

### list

```
agentgate list [options]

Description:
  List work orders with optional filtering.

Options:
  --status <status>    Filter by status (running, succeeded, failed, queued, cancelled)
  --limit <n>          Limit results (default: 20)
  --offset <n>         Offset for pagination (default: 0)
  --sort <field>       Sort by field (created, updated, status)
  --order <dir>        Sort direction (asc, desc, default: desc)
  --json               Output as JSON

Output (default):
  ID          Status     Created      Prompt
  ─────────────────────────────────────────────────────────────────
  FHC3pJst    running    2m ago       Phase 3 implementation
  GZlV380i    running    5m ago       Fix issue #65
  x3Uir8xH    succeeded  12m ago      Fix sandbox default
  abc12345    failed     1h ago       Build optimization

  Showing 1-4 of 47

Output (--json):
  {
    "data": [
      { "id": "FHC3pJst", "status": "running", "createdAt": "...", "taskPrompt": "..." },
      ...
    ],
    "total": 47,
    "limit": 20,
    "offset": 0
  }

Exit Codes:
  0 - Success
  1 - Connection error
```

### watch

```
agentgate watch <id> [options]

Description:
  Stream run output in real-time.

Arguments:
  id                   Work order ID or run ID

Options:
  --follow             Follow after completion (wait for next run)
  --no-output          Show status only, no agent output
  --json               Output events as JSON lines

Output (default):
  Watching run FHC3pJst...
  Status: building (iteration 2/5)

  10:45:32 [read]   packages/server/src/orchestrator.ts
  10:45:33 [edit]   packages/server/src/orchestrator.ts:234
  10:45:35 [bash]   npm run build
  10:45:38 [output] Build started...
  ...

Output (--json):
  {"type":"status","status":"building","iteration":2}
  {"type":"event","eventType":"tool_call","tool":"read","target":"..."}
  {"type":"event","eventType":"output","content":"Build started..."}
  ...

Exit Codes:
  0 - Run succeeded
  1 - Run failed
  2 - Run cancelled
  3 - Connection error
```

### create

```
agentgate create [options]

Description:
  Create a new work order.

Options:
  --prompt <text>      Task prompt (required)
  --repo <url>         Repository URL (required)
  --profile <name>     Profile name (default: default)
  --watch              Watch run after creation
  --json               Output as JSON

Interactive Mode:
  If --prompt or --repo not provided, prompt interactively.

Output (default):
  Created work order FHC3pJst
  Status: queued

  Run: agentgate watch FHC3pJst

Output (--json):
  { "id": "FHC3pJst", "status": "queued", "createdAt": "..." }

Exit Codes:
  0 - Created successfully
  1 - Validation error
  2 - Server error
```

### cancel

```
agentgate cancel <id> [options]

Description:
  Cancel a work order or run.

Arguments:
  id                   Work order ID or run ID

Options:
  --force              Skip confirmation
  --json               Output as JSON

Output:
  Cancelled work order FHC3pJst

Exit Codes:
  0 - Cancelled successfully
  1 - Cannot cancel (completed)
  2 - Not found
```

### trigger

```
agentgate trigger <id> [options]

Description:
  Trigger a new run for an existing work order.

Arguments:
  id                   Work order ID

Options:
  --profile <name>     Override profile
  --watch              Watch run after triggering
  --json               Output as JSON

Output:
  Triggered run #3 for work order FHC3pJst
  Status: queued

Exit Codes:
  0 - Triggered successfully
  1 - Work order not found
  2 - Already running
```

### config

```
agentgate config <action> [key] [value]

Description:
  Manage CLI configuration.

Subcommands:
  get <key>            Get a config value
  set <key> <value>    Set a config value
  show                 Show all config
  reset                Reset to defaults

Config Keys:
  api-url              Server URL
  api-key              API key (stored securely)
  default-profile      Default profile name
  color                Enable colors (true/false)
  json-output          Default to JSON output (true/false)

Examples:
  agentgate config set api-url http://localhost:3000
  agentgate config set api-key sk-abc123
  agentgate config get api-url
  agentgate config show

Config File Location:
  ~/.agentgate/config.json
```

---

## Configuration System

### Config File Structure

```json
{
  "apiUrl": "http://localhost:3000",
  "apiKey": "sk-...",
  "defaultProfile": "default",
  "color": true,
  "jsonOutput": false,
  "recentWorkOrders": ["FHC3pJst", "GZlV380i"]
}
```

### Config File Location

```
Linux/macOS:  ~/.agentgate/config.json
Windows:      %APPDATA%\agentgate\config.json

Environment variable override:
  AGENTGATE_CONFIG_DIR=/path/to/config
```

### Config Priority

```
Priority (highest to lowest):
1. CLI flags (--api-url, --api-key)
2. Environment variables (AGENTGATE_API_URL)
3. Config file
4. Defaults
```

### Secure API Key Storage

```
Options:
1. Environment variable (recommended for CI)
   AGENTGATE_API_KEY=sk-...

2. Config file (encrypted in future versions)
   agentgate config set api-key sk-...

3. CLI flag (not recommended, visible in history)
   agentgate --api-key sk-... list
```

---

## Exit Codes

### Standard Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Command-specific error |
| 3 | Connection error |
| 4 | Authentication error |
| 5 | Validation error |
| 130 | Interrupted (Ctrl+C) |

### Per-Command Codes

| Command | 0 | 1 | 2 | 3 |
|---------|---|---|---|---|
| status | OK | Connection | Unhealthy | - |
| list | OK | Connection | - | - |
| watch | Succeeded | Failed | Cancelled | Connection |
| create | Created | Validation | Server | - |
| cancel | Cancelled | Cannot | Not found | - |
| trigger | Triggered | Not found | Already running | - |

---

## Non-TTY Behavior

### Detection

```
Check if stdout is TTY:
  process.stdout.isTTY

If not TTY:
  - Disable colors
  - Disable spinners/animations
  - Use simple text output
  - No interactive prompts
```

### Pipeline Usage

```bash
# List failed work orders and parse with jq
agentgate list --status failed --json | jq '.[].id'

# Watch and log to file
agentgate watch FHC3pJst --json >> run.log

# Create from script
agentgate create --prompt "Fix bug #123" --repo owner/repo --json
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Create work order
  run: |
    WO_ID=$(agentgate create \
      --prompt "Deploy to production" \
      --repo ${{ github.repository }} \
      --json | jq -r '.id')
    echo "WORK_ORDER_ID=$WO_ID" >> $GITHUB_ENV

- name: Wait for completion
  run: |
    agentgate watch ${{ env.WORK_ORDER_ID }}
```

---

## Shell Completions

### Bash

```bash
# agentgate completion bash > /etc/bash_completion.d/agentgate
_agentgate_completions() {
  local cur=${COMP_WORDS[COMP_CWORD]}
  local cmd=${COMP_WORDS[1]}

  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=($(compgen -W "status list watch create cancel trigger config help version" -- $cur))
  elif [[ $cmd == "list" ]]; then
    COMPREPLY=($(compgen -W "--status --limit --offset --json" -- $cur))
  fi
}
complete -F _agentgate_completions agentgate
```

### Zsh

```zsh
# agentgate completion zsh > ~/.zsh/completions/_agentgate
#compdef agentgate

_agentgate() {
  local -a commands
  commands=(
    'status:Show dashboard summary'
    'list:List work orders'
    'watch:Stream run output'
    'create:Create work order'
    'cancel:Cancel work order'
    'trigger:Trigger new run'
    'config:Manage configuration'
  )
  _describe 'command' commands
}
```

### Fish

```fish
# agentgate completion fish > ~/.config/fish/completions/agentgate.fish
complete -c agentgate -n __fish_use_subcommand -a status -d 'Show dashboard summary'
complete -c agentgate -n __fish_use_subcommand -a list -d 'List work orders'
complete -c agentgate -n __fish_use_subcommand -a watch -d 'Stream run output'
```

---

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC10.1 | Bare command launches TUI | `agentgate` shows TUI |
| AC10.2 | status works | Shows stats |
| AC10.3 | list works | Shows work orders |
| AC10.4 | list --status works | Filters correctly |
| AC10.5 | watch streams | Events appear |
| AC10.6 | create works | Work order created |
| AC10.7 | create interactive | Prompts for missing |
| AC10.8 | --json outputs JSON | Valid JSON |
| AC10.9 | config set works | Value persisted |
| AC10.10 | config get works | Value retrieved |
| AC10.11 | Exit codes correct | Per specification |
| AC10.12 | Works without TTY | No errors in pipe |

---

## Test Cases

### Unit Tests

| Test | Description |
|------|-------------|
| Parse --api-url | Correct URL parsed |
| Parse --json flag | Flag detected |
| Config load | Reads from file |
| Config save | Writes to file |
| Exit code mapping | Correct codes returned |

### Integration Tests

| Test | Description |
|------|-------------|
| status command | Fetches and displays |
| list with filter | Correct filtering |
| watch streaming | SSE connection works |
| create command | API called correctly |
| config persistence | Survives restart |

### E2E Tests

| Test | Description |
|------|-------------|
| Full workflow | Create, watch, complete |
| Pipeline usage | Works with jq |
| Script usage | Exit codes work |

---

## Files to Create

| File | Lines (est.) | Description |
|------|--------------|-------------|
| `src/cli.ts` | 150 | Main CLI setup |
| `src/commands/status.ts` | 80 | Status command |
| `src/commands/list.ts` | 100 | List command |
| `src/commands/watch.ts` | 120 | Watch command |
| `src/commands/create.ts` | 100 | Create command |
| `src/commands/cancel.ts` | 50 | Cancel command |
| `src/commands/trigger.ts` | 60 | Trigger command |
| `src/commands/config.ts` | 80 | Config command |
| `src/config/settings.ts` | 100 | Config management |
| `src/utils/output.ts` | 60 | Output formatting |
| `tests/commands/` | 200 | Command tests |

**Total: ~11 files, ~1100 lines**
