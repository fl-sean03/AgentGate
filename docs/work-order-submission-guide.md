# Work Order Submission Guide

Standard preferences for submitting work orders via the AgentGate API.

## Standard Submission Template

```bash
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "taskPrompt": "<task description>",
    "workspaceSource": {
      "type": "github",
      "repo": "fl-sean03/AgentGate"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "harness": {
      "verification": {
        "waitForCI": true,
        "skipLevels": []
      }
    }
  }'
```

## Preferred Settings

| Setting | Value | Reason |
|---------|-------|--------|
| `workspaceSource.type` | `github` | Clone from GitHub, create PRs |
| `workspaceSource.owner` | `fl-sean03` | Default GitHub owner |
| `workspaceSource.repo` | `AgentGate` | Target repository |
| `agentType` | `claude-code-subscription` | Uses Claude Code with subscription |
| `maxIterations` | `10` | Enough iterations for complex tasks |
| `waitForCI` | `true` | Wait for GitHub Actions to pass |
| `skipLevels` | `[]` | Run ALL verification levels (L0-L3) |

---

## All Available Types

### Workspace Source Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `local` | Use existing local directory | `path` |
| `github` | Clone existing GitHub repo | `owner`, `repo`, `branch?` |
| `github-new` | Create new GitHub repo | `owner`, `repoName`, `private?`, `template?` |
| `git` | Clone from git URL (deprecated) | `url`, `branch?` |
| `fresh` | Create new local workspace (deprecated) | `destPath`, `template?` |

**Example - Local:**
```json
{
  "type": "local",
  "path": "/home/user/my-project"
}
```

**Example - GitHub (preferred):**
```json
{
  "type": "github",
  "repo": "fl-sean03/AgentGate",
  "branch": "main"
}
```

> **Note:** Due to a current API bug, use `repo: "owner/repo"` format instead of separate `owner` and `repo` fields. This will be fixed in v0.2.23.

**Example - GitHub New:**
```json
{
  "type": "github-new",
  "owner": "fl-sean03",
  "repoName": "new-project",
  "private": true,
  "template": "typescript"
}
```

### Agent Types

| Type | Description |
|------|-------------|
| `claude-code-subscription` | Claude Code with Anthropic subscription (recommended) |
| `claude-agent-sdk` | Claude Agent SDK driver |
| `claude-code-api` | Claude Code with API key |

### Verification Levels

| Level | Description | Skippable |
|-------|-------------|-----------|
| `L0` | Build/Typecheck | Yes |
| `L1` | Unit/Integration Tests | Yes |
| `L2` | Blackbox Verification | Yes |
| `L3` | CI Pipeline (GitHub Actions) | Yes |

**To skip specific levels:**
```json
"harness": {
  "verification": {
    "skipLevels": ["L2", "L3"]
  }
}
```

**To run all levels (default):**
```json
"harness": {
  "verification": {
    "skipLevels": []
  }
}
```

### Gate Plan Sources

| Source | Description |
|--------|-------------|
| `auto` | Auto-detect from verify.yaml or CI (default) |
| `verify-profile` | Use verify.yaml |
| `ci-workflow` | Use GitHub Actions workflow |
| `default` | Use built-in defaults |

### Loop Strategy Modes

| Mode | Description |
|------|-------------|
| `fixed` | Fixed number of iterations |
| `hybrid` | Adaptive based on progress |
| `ralph` | Advanced RALPH strategy |
| `custom` | Custom strategy |

### Work Order Statuses

| Status | Description |
|--------|-------------|
| `queued` | Waiting to start |
| `running` | Currently executing |
| `waiting_for_children` | Waiting for spawned work orders |
| `integrating` | Integrating child results |
| `succeeded` | Completed successfully |
| `failed` | Failed |
| `canceled` | Manually canceled |

---

## Full Example with All Options

```bash
curl -X POST http://localhost:3001/api/v1/work-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "taskPrompt": "Implement feature X following docs/DevGuides/DevGuide_vX.X/",
    "workspaceSource": {
      "type": "github",
      "owner": "fl-sean03",
      "repo": "AgentGate",
      "branch": "main"
    },
    "agentType": "claude-code-subscription",
    "maxIterations": 10,
    "maxTime": 3600,
    "harness": {
      "profile": "default",
      "loopStrategy": {
        "mode": "hybrid",
        "maxIterations": 10
      },
      "verification": {
        "waitForCI": true,
        "skipLevels": [],
        "gatePlanSource": "auto"
      }
    }
  }'
```

---

## Quick Reference

**Minimum required fields:**
```json
{
  "taskPrompt": "...",
  "workspaceSource": { "type": "...", ... }
}
```

**Recommended for production:**
```json
{
  "taskPrompt": "...",
  "workspaceSource": {
    "type": "github",
    "owner": "fl-sean03",
    "repo": "AgentGate"
  },
  "agentType": "claude-code-subscription",
  "maxIterations": 10,
  "harness": {
    "verification": {
      "waitForCI": true,
      "skipLevels": []
    }
  }
}
```
