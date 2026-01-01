# 05: Configuration & Testing

## Thrust 7: Configuration

### 7.1 Objective

Add SDK-specific configuration options to the config system.

### 7.2 Background

The SDK driver needs configuration for:
- Timeout settings
- Sandbox enablement
- Hook configuration
- Default tool restrictions

### 7.3 Subtasks

#### 7.3.1 Update Configuration Schema

Modify `packages/server/src/config/index.ts`:

**Add SDK configuration fields:**

```typescript
// SDK Driver configuration
sdkTimeoutMs: z.coerce.number().min(10000).max(3600000).default(300000),
sdkEnableSandbox: z.boolean().default(true),
sdkLogToolUse: z.boolean().default(true),
sdkTrackFileChanges: z.boolean().default(true),
sdkMaxTurns: z.coerce.number().min(1).max(500).default(100),
```

**Environment variable mapping:**
- `AGENTGATE_SDK_TIMEOUT_MS`
- `AGENTGATE_SDK_ENABLE_SANDBOX`
- `AGENTGATE_SDK_LOG_TOOL_USE`
- `AGENTGATE_SDK_TRACK_FILE_CHANGES`
- `AGENTGATE_SDK_MAX_TURNS`

#### 7.3.2 Update .env.example

Add SDK configuration examples:

```bash
# =============================================================================
# Claude Agent SDK Configuration
# =============================================================================

# API key for SDK (required for SDK driver)
ANTHROPIC_API_KEY=sk-ant-api-...

# SDK query timeout in milliseconds (default: 300000 = 5 minutes)
AGENTGATE_SDK_TIMEOUT_MS=300000

# Enable SDK built-in sandboxing (default: true)
AGENTGATE_SDK_ENABLE_SANDBOX=true

# Log all tool invocations (default: true)
AGENTGATE_SDK_LOG_TOOL_USE=true

# Track file changes for verification (default: true)
AGENTGATE_SDK_TRACK_FILE_CHANGES=true

# Maximum conversation turns (default: 100)
AGENTGATE_SDK_MAX_TURNS=100
```

#### 7.3.3 Create SDK Config Builder

Create utility to build SDK driver config from environment:

```typescript
function buildSDKDriverConfig(config: AgentGateConfig): ClaudeAgentSDKDriverConfig {
  return {
    timeoutMs: config.sdkTimeoutMs,
    enableSandbox: config.sdkEnableSandbox,
    hooks: {
      logToolUse: config.sdkLogToolUse,
      trackFileChanges: config.sdkTrackFileChanges,
    },
  };
}
```

#### 7.3.4 Add Billing Info to Health Endpoint

Update health endpoint to show SDK availability:

```typescript
{
  status: 'healthy',
  components: {
    // ...existing...
    sdk: {
      available: true,
      apiKeySet: true,
      sandboxEnabled: true,
    },
  },
}
```

### 7.4 Verification Steps

1. Config loads SDK settings correctly
2. Environment variables override defaults
3. SDK driver uses config values
4. Health endpoint shows SDK status

### 7.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/config/index.ts` | Modified |
| `.env.example` | Modified |
| `packages/server/src/server/routes/health.ts` | Modified |

---

## Thrust 8: Testing

### 8.1 Objective

Create comprehensive tests for SDK driver integration.

### 8.2 Background

Testing the SDK driver requires:
- Unit tests with mocked SDK
- Integration tests with real SDK (CI with API key)
- Comparison tests between drivers

### 8.3 Subtasks

#### 8.3.1 Create SDK Mock

Create `packages/server/test/mocks/sdk-mock.ts`:

```typescript
function createMockQuery() {
  return vi.fn().mockImplementation(async function* ({ prompt, options }) {
    // Yield system message
    yield {
      type: 'system',
      session_id: 'mock-session-123',
      model: 'claude-sonnet-4-5-20250929',
      tools: ['Read', 'Write', 'Edit', 'Bash'],
    };

    // Yield assistant message
    yield {
      type: 'assistant',
      content: 'I will help you with that task.',
    };

    // Yield result
    yield {
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
      cost: 0.01,
      result: 'success',
    };
  });
}
```

#### 8.3.2 Unit Tests - SDK Driver

Create `packages/server/test/claude-agent-sdk-driver.test.ts`:

**Test cases:**
1. Constructor with default config
2. Constructor with custom config
3. isAvailable() with API key
4. isAvailable() without API key
5. getCapabilities() returns SDK capabilities
6. execute() with simple prompt
7. execute() with session resume
8. execute() with timeout
9. execute() with tool restrictions
10. Error handling
11. Message collection
12. Cost extraction
13. Session ID extraction

#### 8.3.3 Unit Tests - Message Parser

Create `packages/server/test/sdk-message-parser.test.ts`:

**Test cases:**
1. Type guards for each message type
2. MessageCollector tracks messages
3. Session ID extraction
4. Cost extraction
5. Usage extraction
6. Tool call recording
7. Turn counting

#### 8.3.4 Unit Tests - Hooks

Create `packages/server/test/sdk-hooks.test.ts`:

**Test cases:**
1. Tool logger hook logs correctly
2. File change tracker records changes
3. Dangerous tool blocker blocks patterns
4. Multiple hooks compose correctly
5. Hook errors don't break execution

#### 8.3.5 Integration Tests

Create `packages/server/test/sdk-integration.test.ts`:

**Test cases (require API key):**
1. Real query execution
2. Session resume works
3. File operations tracked
4. Tool calls recorded
5. Cost reported

Mark with `describe.runIf(process.env.ANTHROPIC_API_KEY)`.

#### 8.3.6 Comparison Tests

Create `packages/server/test/driver-comparison.test.ts`:

**Test cases:**
- Same prompt produces similar results across drivers
- Both drivers handle errors similarly
- Session resume works on both

### 8.4 Verification Steps

1. All unit tests pass
2. Integration tests pass with API key
3. Integration tests skip without API key
4. Coverage > 80% for SDK module
5. No regressions in existing tests

### 8.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/test/mocks/sdk-mock.ts` | Created |
| `packages/server/test/claude-agent-sdk-driver.test.ts` | Created |
| `packages/server/test/sdk-message-parser.test.ts` | Created |
| `packages/server/test/sdk-hooks.test.ts` | Created |
| `packages/server/test/sdk-integration.test.ts` | Created |
| `packages/server/test/driver-comparison.test.ts` | Created |

---

## Test Matrix

### Unit Test Coverage

| Component | Tests | Coverage |
|-----------|-------|----------|
| claude-agent-sdk-driver.ts | 15 | 90% |
| sdk-message-parser.ts | 10 | 95% |
| sdk-options-builder.ts | 8 | 90% |
| sdk-hooks.ts | 12 | 85% |

### Integration Test Matrix

| Test | Requires API Key | CI |
|------|-----------------|-----|
| Basic query | Yes | With secret |
| Session resume | Yes | With secret |
| Tool execution | Yes | With secret |
| Error handling | No | Always |
| Config loading | No | Always |

### CI Configuration

Add API key to CI for integration tests:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: pnpm test
```
