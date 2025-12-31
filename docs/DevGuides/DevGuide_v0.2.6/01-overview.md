# v0.2.6 Overview: Subscription-Based Agent Driver

## Current State

AgentGate currently has a single `claude-code` driver that:
- Spawns Claude Code CLI as a subprocess
- Passes the full `process.env` to the subprocess
- Relies on whatever authentication Claude Code finds

### The Problem

When `ANTHROPIC_API_KEY` is present in the environment:
1. Claude Code uses API credits (pay-per-token billing)
2. The user's Pro/Max subscription quota goes unused
3. Heavy agent workloads can result in significant API charges

### Claude Code Authentication Priority

Claude Code authenticates in this order:
1. `ANTHROPIC_API_KEY` environment variable (API credits)
2. OAuth credentials in `~/.claude/.credentials.json` (subscription)
3. Interactive login prompt

---

## Target State

A subscription-aware driver that:
1. **Detects** subscription credentials before execution
2. **Excludes** `ANTHROPIC_API_KEY` from the subprocess environment
3. **Validates** subscription is active and has quota
4. **Reports** billing method in logs

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Orchestrator                            │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │         Agent Module          │
              └───────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│ claude-code  │    │ claude-code-sub  │    │  other       │
│   (API)      │    │ (Subscription)   │    │  drivers     │
└──────────────┘    └──────────────────┘    └──────────────┘
        │                     │
        ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│ Uses API key │    │ Uses OAuth creds │
│ from env     │    │ from ~/.claude/  │
└──────────────┘    └──────────────────┘
```

---

## Design Decisions

### 1. Separate Driver vs Configuration Option

**Decision**: Create a separate driver (`claude-code-subscription`)

**Rationale**:
- Clear distinction between billing methods
- No risk of accidentally using wrong billing
- Easier to test and maintain
- Users explicitly choose their billing method

**Alternative Considered**: Add a `--use-subscription` flag to existing driver
- Rejected: Mixes concerns, harder to reason about

### 2. Credential Detection Location

**Decision**: Read from `~/.claude/.credentials.json`

**Rationale**:
- This is where Claude Code stores OAuth tokens
- Standard location across all platforms
- Already populated by `claude login`

### 3. Environment Handling

**Decision**: Create clean environment excluding API key variables

**Rationale**:
- Explicitly remove `ANTHROPIC_API_KEY`
- Also remove `CLAUDE_API_KEY` and similar variants
- Pass all other environment variables through

### 4. Subscription Validation

**Decision**: Check for valid credentials before execution

**Rationale**:
- Fail fast if subscription not available
- Clear error message guiding user to `claude login`
- Prevent wasted time on doomed executions

---

## Subscription Credentials Format

Location: `~/.claude/.credentials.json`

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1767183439595,
    "scopes": ["user:inference", "user:profile", "user:sessions:claude_code"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x"
  }
}
```

Key fields:
- `accessToken`: OAuth access token for Claude.ai
- `expiresAt`: Token expiration timestamp (ms since epoch)
- `subscriptionType`: `"pro"` | `"max"` | `"free"`
- `rateLimitTier`: Rate limit tier (e.g., `default_claude_max_20x`)

---

## API Key Environment Variables to Exclude

When using subscription mode, these variables must be excluded:
- `ANTHROPIC_API_KEY`
- `CLAUDE_API_KEY`
- `ANTHROPIC_API_BASE` (optional, but cleaner to exclude)

---

## Error Handling

### No Credentials Found
```
Error: Claude subscription credentials not found.
Run 'claude login' to authenticate with your Pro/Max subscription.
```

### Expired Token
```
Error: Claude subscription token expired.
Run 'claude login' to refresh your credentials.
```

### No Subscription
```
Error: No active subscription found (subscriptionType: free).
Upgrade to Claude Pro or Max, or use --agent claude-code for API billing.
```

---

## Testing Strategy

1. **Unit Tests**: Mock file system for credential detection
2. **Integration Tests**: Verify environment exclusion
3. **Manual E2E**: Run actual agent task with subscription

---

## Migration Path

Existing users:
- Default behavior unchanged (`claude-code` uses API)
- Opt-in to subscription with `--agent claude-code-subscription`
- Clear documentation on when to use each
