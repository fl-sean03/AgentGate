# 03: Driver Implementation

## Thrust 3: Message Parser

### 3.1 Objective

Create utilities to parse and process SDK message streams into AgentGate-compatible formats.

### 3.2 Background

The SDK returns an async generator of messages. We need to:
- Iterate through messages
- Extract relevant information
- Build AgentResult from collected data
- Track tool calls and costs

### 3.3 Subtasks

#### 3.3.1 Create Message Type Guards

Create `packages/server/src/agent/sdk-message-parser.ts`:

**Type guards for each message type:**

```typescript
function isSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return msg.type === 'system';
}

function isAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === 'assistant';
}

function isToolUseMessage(msg: SDKMessage): msg is SDKToolUseMessage {
  return msg.type === 'tool_use';
}

function isToolResultMessage(msg: SDKMessage): msg is SDKToolResultMessage {
  return msg.type === 'tool_result';
}

function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === 'result';
}
```

#### 3.3.2 Create MessageCollector Class

Collects messages during streaming and builds final result:

```typescript
class MessageCollector {
  private messages: SDKMessage[] = [];
  private systemMessage: SDKSystemMessage | null = null;
  private resultMessage: SDKResultMessage | null = null;
  private toolCalls: ToolCallRecord[] = [];
  private currentToolStart: number | null = null;

  add(message: SDKMessage): void {
    this.messages.push(message);

    if (isSystemMessage(message)) {
      this.systemMessage = message;
    } else if (isResultMessage(message)) {
      this.resultMessage = message;
    } else if (isToolUseMessage(message)) {
      this.currentToolStart = Date.now();
    } else if (isToolResultMessage(message)) {
      // Record tool call with duration
    }
  }

  getSessionId(): string | null {
    return this.systemMessage?.session_id ?? null;
  }

  getModel(): string | null {
    return this.systemMessage?.model ?? null;
  }

  getCost(): number | null {
    return this.resultMessage?.cost ?? null;
  }

  getUsage(): TokenUsage | null {
    if (!this.resultMessage?.usage) return null;
    return {
      input: this.resultMessage.usage.input_tokens,
      output: this.resultMessage.usage.output_tokens,
    };
  }

  getToolCalls(): ToolCallRecord[] {
    return this.toolCalls;
  }

  getAllMessages(): SDKMessage[] {
    return this.messages;
  }

  getTurnCount(): number {
    return this.messages.filter(isAssistantMessage).length;
  }
}
```

#### 3.3.3 Create Result Builder

Build AgentResult from collected messages:

```typescript
function buildAgentResult(
  collector: MessageCollector,
  success: boolean,
  durationMs: number,
  error?: string
): AgentResult {
  return {
    success,
    exitCode: success ? 0 : 1,
    stdout: '', // SDK doesn't use stdout
    stderr: error ?? '',
    structuredOutput: collector.getAllMessages(),
    sessionId: collector.getSessionId(),
    tokensUsed: collector.getUsage(),
    durationMs,
    // SDK-specific
    totalCostUsd: collector.getCost() ?? undefined,
    toolCalls: collector.getToolCalls(),
    model: collector.getModel() ?? undefined,
    turns: collector.getTurnCount(),
  };
}
```

### 3.4 Verification Steps

1. Type guards correctly identify message types
2. MessageCollector tracks all messages
3. Session ID extracted from system message
4. Cost extracted from result message
5. Tool calls recorded with duration
6. buildAgentResult produces valid AgentResult

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/sdk-message-parser.ts` | Created |

---

## Thrust 4: SDK Driver Implementation

### 4.1 Objective

Implement `ClaudeAgentSDKDriver` using the SDK's `query()` function.

### 4.2 Background

The driver must:
- Implement AgentDriver interface
- Use SDK query() for execution
- Handle streaming messages
- Support session resume
- Manage timeout via AbortController

### 4.3 Subtasks

#### 4.3.1 Create Options Builder

Create `packages/server/src/agent/sdk-options-builder.ts`:

**Build SDK options from AgentRequest:**

```typescript
function buildSDKOptions(request: AgentRequest, config: ClaudeAgentSDKDriverConfig): Options {
  const options: Options = {};

  // Max turns
  if (request.constraints?.maxTurns) {
    options.maxTurns = request.constraints.maxTurns;
  }

  // Session resume
  if (request.sessionId) {
    options.resume = request.sessionId;
  }

  // System prompt (gate plan, engineering standards)
  const systemPrompt = buildSystemPromptAppend(request);
  if (systemPrompt) {
    options.systemPrompt = systemPrompt;
  }

  // Tool restrictions
  if (request.allowedTools) {
    options.allowedTools = request.allowedTools;
  }
  if (request.disallowedTools) {
    options.disallowedTools = request.disallowedTools;
  }

  // Hooks
  if (config.hooks) {
    options.hooks = buildHooksConfig(config.hooks);
  }

  return options;
}
```

#### 4.3.2 Create Driver Class

Create `packages/server/src/agent/claude-agent-sdk-driver.ts`:

**Class structure:**

```typescript
class ClaudeAgentSDKDriver implements AgentDriver {
  readonly name = 'claude-agent-sdk';
  readonly version = '1.0.0';

  private config: Required<ClaudeAgentSDKDriverConfig>;

  constructor(config: ClaudeAgentSDKDriverConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? 300000,
      enableSandbox: config.enableSandbox ?? true,
      hooks: config.hooks ?? {},
      env: config.env ?? {},
    };
  }
}
```

#### 4.3.3 Implement isAvailable()

Check SDK availability:

```typescript
async isAvailable(): Promise<boolean> {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.debug('ANTHROPIC_API_KEY not set');
    return false;
  }

  // Check Claude CLI installed
  try {
    execSync('claude --version', { timeout: 5000 });
    return true;
  } catch {
    logger.debug('Claude CLI not available');
    return false;
  }
}
```

#### 4.3.4 Implement getCapabilities()

Return SDK-specific capabilities:

```typescript
getCapabilities(): DriverCapabilities {
  return {
    supportsSessionResume: true,
    supportsStructuredOutput: true,
    supportsToolRestriction: true,
    supportsTimeout: true,
    supportsHooks: true,
    supportsSandbox: true,
    supportsStreaming: true,
    supportsCostTracking: true,
    maxTurns: 100,
    billingMethod: 'api-key',
  };
}
```

#### 4.3.5 Implement execute()

Main execution method:

```typescript
async execute(request: AgentRequest): Promise<AgentResult> {
  const startTime = Date.now();
  const collector = new MessageCollector();

  // Build SDK options
  const options = buildSDKOptions(request, this.config);

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, request.timeoutMs ?? this.config.timeoutMs);

  try {
    // Change to workspace directory
    const originalCwd = process.cwd();
    process.chdir(request.workspacePath);

    // Set up environment
    const originalEnv = { ...process.env };
    Object.assign(process.env, this.config.env);

    try {
      // Execute query
      const result = query({
        prompt: request.taskPrompt,
        options,
      });

      // Iterate through messages
      for await (const message of result) {
        collector.add(message);
        // Could emit events here for real-time updates
      }

      clearTimeout(timeoutId);

      return buildAgentResult(
        collector,
        true,
        Date.now() - startTime
      );

    } finally {
      // Restore environment
      process.cwd = originalCwd;
      process.env = originalEnv;
    }

  } catch (error) {
    clearTimeout(timeoutId);

    if (controller.signal.aborted) {
      return buildAgentResult(
        collector,
        false,
        Date.now() - startTime,
        'Execution timed out'
      );
    }

    return buildAgentResult(
      collector,
      false,
      Date.now() - startTime,
      error instanceof Error ? error.message : String(error)
    );
  }
}
```

#### 4.3.6 Add Factory Function

Export factory for creating driver:

```typescript
export async function createClaudeAgentSDKDriver(
  config?: ClaudeAgentSDKDriverConfig
): Promise<ClaudeAgentSDKDriver> {
  const driver = new ClaudeAgentSDKDriver(config);

  if (!(await driver.isAvailable())) {
    throw new Error('Claude Agent SDK not available. Ensure ANTHROPIC_API_KEY is set.');
  }

  return driver;
}

export function tryCreateSDKDriver(
  config?: ClaudeAgentSDKDriverConfig
): Promise<ClaudeAgentSDKDriver | null> {
  try {
    return createClaudeAgentSDKDriver(config);
  } catch {
    return Promise.resolve(null);
  }
}
```

### 4.4 Verification Steps

1. Driver instantiates without errors
2. isAvailable() returns true with API key set
3. isAvailable() returns false without API key
4. Simple prompt execution works
5. Session ID returned in result
6. Cost tracked in result
7. Tool calls recorded
8. Timeout works correctly

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/sdk-options-builder.ts` | Created |
| `packages/server/src/agent/claude-agent-sdk-driver.ts` | Created |

---

## Execution Flow

### SDK Driver vs Subscription Driver

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AgentRequest                                     │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │    Driver Selection       │
                    │    (by agentType)         │
                    └─────────────┬─────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────────┐    ┌──────────────┐
│  SDK Driver     │    │  Subscription       │    │  Other       │
│                 │    │  Driver             │    │  Drivers     │
├─────────────────┤    ├─────────────────────┤    └──────────────┘
│ query({         │    │ spawn('claude',     │
│   prompt,       │    │   args, {           │
│   options       │    │     cwd, env        │
│ })              │    │   })                │
├─────────────────┤    ├─────────────────────┤
│ for await (msg) │    │ stdout.on('data')   │
│   collector.add │    │   collect output    │
├─────────────────┤    ├─────────────────────┤
│ return result   │    │ return result       │
└─────────────────┘    └─────────────────────┘
```

### Message Flow

```
query() called
     │
     ▼
┌─────────────────────────────────────────┐
│  SDKSystemMessage                        │
│  { session_id, model, tools }           │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  SDKAssistantMessage (may repeat)       │
│  { content, tool_use? }                 │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  SDKToolUseMessage (if tool called)     │
│  { tool, input }                        │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  SDKToolResultMessage                    │
│  { output }                             │
└─────────────────────────────────────────┘
     │
     ▼ (loop back to assistant)
     │
     ▼ (when complete)
┌─────────────────────────────────────────┐
│  SDKResultMessage                        │
│  { usage, cost, result }                │
└─────────────────────────────────────────┘
```
