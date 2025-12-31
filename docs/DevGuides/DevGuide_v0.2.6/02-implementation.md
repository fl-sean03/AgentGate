# v0.2.6 Implementation: Subscription-Based Agent Driver

## Thrust 1: Subscription Detection

### 1.1 Objective

Create a utility module to detect, parse, and validate Claude subscription credentials.

### 1.2 Background

Claude Code stores OAuth credentials in `~/.claude/.credentials.json`. This module will:
- Locate the credentials file
- Parse and validate the structure
- Check token expiration
- Determine subscription type

### 1.3 Subtasks

#### 1.3.1 Create Subscription Types

Define TypeScript types for subscription credentials:
- `ClaudeCredentials` - Full credentials object
- `ClaudeOAuthCredentials` - OAuth-specific fields
- `SubscriptionType` - Union of subscription types
- `SubscriptionStatus` - Result of validation

#### 1.3.2 Create Credential Locator

Implement function to find credentials file:
- Check `~/.claude/.credentials.json`
- Handle home directory resolution cross-platform
- Return path or null if not found

#### 1.3.3 Create Credential Parser

Implement function to parse credentials:
- Read file contents
- Parse JSON
- Validate structure with type guards
- Return typed credentials or error

#### 1.3.4 Create Subscription Validator

Implement function to validate subscription:
- Check if token is expired
- Check subscription type (pro/max vs free)
- Return validation result with details

#### 1.3.5 Create Main Detection Function

Export a single entry point:
- Locate credentials
- Parse and validate
- Return comprehensive status object

### 1.4 Verification Steps

1. Create test file with mock credentials
2. Run unit tests for all detection functions
3. Verify correct handling of missing/expired/invalid credentials

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/agent/subscription-detector.ts` | Create |
| `src/types/subscription.ts` | Create |
| `src/types/index.ts` | Modify - export subscription types |

---

## Thrust 2: Subscription Driver

### 2.1 Objective

Create `ClaudeCodeSubscriptionDriver` that uses subscription credentials instead of API key.

### 2.2 Background

This driver extends the existing `ClaudeCodeDriver` pattern but:
- Validates subscription before execution
- Excludes API key variables from environment
- Logs billing method used

### 2.3 Subtasks

#### 2.3.1 Create Driver Class

Implement `ClaudeCodeSubscriptionDriver`:
- Implement `AgentDriver` interface
- Add subscription validation in constructor or `isAvailable()`
- Store subscription status for logging

#### 2.3.2 Create Clean Environment Builder

Implement function to create subprocess environment:
- Clone `process.env`
- Remove `ANTHROPIC_API_KEY`
- Remove `CLAUDE_API_KEY`
- Remove `ANTHROPIC_API_BASE`
- Add `NO_COLOR` and `FORCE_COLOR` for clean output

#### 2.3.3 Override Execute Method

Implement execute with subscription handling:
- Check subscription validity before execution
- Use clean environment (no API keys)
- Log subscription tier and billing method
- Delegate to parent logic for subprocess handling

#### 2.3.4 Add Subscription Info to Capabilities

Extend `getCapabilities()`:
- Return subscription type
- Return rate limit tier
- Indicate this is subscription-based

#### 2.3.5 Create Factory Function

Export `createClaudeCodeSubscriptionDriver()`:
- Validate subscription on creation
- Throw clear error if subscription unavailable
- Return configured driver instance

### 2.4 Verification Steps

1. Run with valid subscription - should use subscription
2. Run with expired token - should fail with clear error
3. Verify `ANTHROPIC_API_KEY` is not passed to subprocess
4. Check logs show subscription billing method

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/agent/claude-code-subscription-driver.ts` | Create |
| `src/agent/defaults.ts` | Modify - add subscription capabilities |

---

## Thrust 3: Driver Registration

### 3.1 Objective

Register the new driver in the agent module and CLI.

### 3.2 Background

The agent module exports available drivers. The CLI uses agent type to select drivers.

### 3.3 Subtasks

#### 3.3.1 Export from Agent Module

Update `src/agent/index.ts`:
- Export `ClaudeCodeSubscriptionDriver`
- Export `createClaudeCodeSubscriptionDriver`
- Export subscription detector functions

#### 3.3.2 Update Agent Type Enum

If using enum for agent types, add new type:
- Add `'claude-code-subscription'` to valid agent types
- Update type definitions

#### 3.3.3 Update CLI Submit Command

Modify submit command to accept new agent type:
- Add to `--agent` option choices
- Handle driver creation for subscription type

#### 3.3.4 Update Orchestrator

Ensure orchestrator can use new driver:
- Add case for `claude-code-subscription` agent type
- Create appropriate driver instance

#### 3.3.5 Add CLI Feedback

When using subscription driver:
- Log subscription type (Pro/Max)
- Log rate limit tier
- Indicate API credits will NOT be used

### 3.4 Verification Steps

1. Run `agentgate submit --agent claude-code-subscription --help`
2. Submit work order with subscription agent
3. Verify logs show subscription billing
4. Verify API key is not used

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `src/agent/index.ts` | Modify |
| `src/control-plane/commands/submit.ts` | Modify |
| `src/orchestrator/orchestrator.ts` | Modify |
| `src/types/work-order.ts` | Modify (if agent type enum exists) |

---

## Thrust 4: Testing

### 4.1 Objective

Add comprehensive tests for subscription detection and driver.

### 4.2 Background

Tests should cover:
- Credential file parsing
- Token expiration handling
- Environment variable exclusion
- Driver execution flow

### 4.3 Subtasks

#### 4.3.1 Subscription Detector Tests

Create `test/subscription-detector.test.ts`:
- Test credential file parsing
- Test expired token detection
- Test missing file handling
- Test invalid JSON handling
- Test subscription type detection

#### 4.3.2 Subscription Driver Tests

Create `test/claude-code-subscription-driver.test.ts`:
- Test environment exclusion
- Test subscription validation
- Test capability reporting
- Test error handling

#### 4.3.3 Integration Test

Add integration test that:
- Mocks credential file
- Creates subscription driver
- Verifies execution without API key

### 4.4 Verification Steps

1. Run `pnpm test` - all tests pass
2. Run `pnpm typecheck` - no type errors
3. Run `pnpm lint` - no lint errors
4. Check test coverage for new files

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `test/subscription-detector.test.ts` | Create |
| `test/claude-code-subscription-driver.test.ts` | Create |

---

## Implementation Order

Execute thrusts in order:
1. **Thrust 1** - Foundation (types and detection)
2. **Thrust 2** - Driver implementation
3. **Thrust 3** - Integration with CLI/orchestrator
4. **Thrust 4** - Testing and validation

Each thrust should be verified before proceeding to the next.
