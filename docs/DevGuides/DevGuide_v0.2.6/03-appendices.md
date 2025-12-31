# v0.2.6 Appendices

## A. File Reference

### New Files

| File | Purpose |
|------|---------|
| `src/types/subscription.ts` | TypeScript types for subscription credentials |
| `src/agent/subscription-detector.ts` | Credential detection and validation |
| `src/agent/claude-code-subscription-driver.ts` | Subscription-based agent driver |
| `test/subscription-detector.test.ts` | Unit tests for detector |
| `test/claude-code-subscription-driver.test.ts` | Unit tests for driver |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/index.ts` | Export subscription types |
| `src/agent/index.ts` | Export subscription driver and detector |
| `src/agent/defaults.ts` | Add subscription capabilities constant |
| `src/control-plane/commands/submit.ts` | Add `claude-code-subscription` agent option |
| `src/orchestrator/orchestrator.ts` | Handle new agent type |
| `docs/DevGuides/README.md` | Add v0.2.6 to table |

---

## B. Implementation Checklist

### Thrust 1: Subscription Detection
- [ ] Create `src/types/subscription.ts` with type definitions
- [ ] Create `src/agent/subscription-detector.ts`
- [ ] Implement `getCredentialsPath()` function
- [ ] Implement `parseCredentials()` function
- [ ] Implement `validateSubscription()` function
- [ ] Implement `detectSubscription()` main function
- [ ] Export types from `src/types/index.ts`
- [ ] Verify with manual test

### Thrust 2: Subscription Driver
- [ ] Create `src/agent/claude-code-subscription-driver.ts`
- [ ] Implement `ClaudeCodeSubscriptionDriver` class
- [ ] Implement `createCleanEnvironment()` helper
- [ ] Implement `isAvailable()` with subscription check
- [ ] Implement `execute()` with clean environment
- [ ] Implement `getCapabilities()` with subscription info
- [ ] Add factory function `createClaudeCodeSubscriptionDriver()`
- [ ] Add `SUBSCRIPTION_CAPABILITIES` to defaults

### Thrust 3: Driver Registration
- [ ] Export from `src/agent/index.ts`
- [ ] Update `--agent` option in submit command
- [ ] Add driver creation logic in submit command
- [ ] Update orchestrator to handle new agent type
- [ ] Add logging for subscription billing method
- [ ] Test CLI with `--agent claude-code-subscription`

### Thrust 4: Testing
- [ ] Create `test/subscription-detector.test.ts`
- [ ] Test credential parsing
- [ ] Test expiration detection
- [ ] Test missing file handling
- [ ] Create `test/claude-code-subscription-driver.test.ts`
- [ ] Test environment exclusion
- [ ] Test driver creation
- [ ] Run `pnpm typecheck` - passes
- [ ] Run `pnpm lint` - passes
- [ ] Run `pnpm test` - all pass

---

## C. Environment Variables

### Excluded from Subscription Driver

| Variable | Reason |
|----------|--------|
| `ANTHROPIC_API_KEY` | Primary API key - forces API billing |
| `CLAUDE_API_KEY` | Alternative API key name |
| `ANTHROPIC_API_BASE` | Custom API endpoint - not needed for subscription |

### Preserved

All other environment variables are passed through, including:
- `PATH` - Required for subprocess execution
- `HOME` - Required for credential file location
- `NO_COLOR`, `FORCE_COLOR` - Set by driver for clean output

---

## D. Credential File Schema

### Location
```
~/.claude/.credentials.json
```

### Schema
```typescript
interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;  // Unix timestamp in milliseconds
    scopes: string[];
    subscriptionType: 'free' | 'pro' | 'max';
    rateLimitTier: string;
  };
}
```

### Example
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

---

## E. Error Messages

### SubscriptionNotFound
```
Claude subscription credentials not found.

To use subscription-based billing:
  1. Run: claude login
  2. Sign in with your Claude Pro or Max account
  3. Retry this command

To use API credits instead:
  agentgate submit --agent claude-code ...
```

### SubscriptionExpired
```
Claude subscription token has expired.

Run 'claude login' to refresh your credentials.
```

### NoActiveSubscription
```
No active Claude subscription found (type: free).

Subscription-based billing requires Claude Pro or Max.
Either:
  1. Upgrade at https://claude.ai/settings/subscription
  2. Use API credits: --agent claude-code
```

---

## F. CLI Usage Examples

### Using Subscription Driver
```bash
# Submit with subscription billing
agentgate submit \
  --prompt "Implement feature X" \
  --github owner/repo \
  --agent claude-code-subscription

# Check subscription status
agentgate auth subscription --status
```

### Using API Driver (existing)
```bash
# Submit with API billing (default)
agentgate submit \
  --prompt "Implement feature X" \
  --github owner/repo \
  --agent claude-code
```

---

## G. Verification Commands

```bash
# Full validation
pnpm typecheck && pnpm lint && pnpm test

# Test subscription detection (manual)
node -e "
  const { detectSubscription } = require('./dist/agent/index.js');
  detectSubscription().then(console.log);
"

# Test with subscription agent
agentgate submit \
  --prompt "Add a comment to README.md" \
  --path . \
  --agent claude-code-subscription \
  --max-iterations 1
```

---

## H. Success Criteria Checklist

- [ ] `agentgate submit --agent claude-code-subscription` works
- [ ] Subscription credentials are detected from `~/.claude/`
- [ ] `ANTHROPIC_API_KEY` is NOT passed to Claude Code subprocess
- [ ] Clear error if no subscription found
- [ ] Clear error if subscription expired
- [ ] Logs indicate subscription billing method
- [ ] All existing tests pass
- [ ] New tests for subscription features pass
- [ ] `pnpm typecheck && pnpm lint && pnpm test` all green
