# 02: SDK Setup - Dependencies & Types

## Thrust 1: SDK Dependencies

### 1.1 Objective

Install the official Claude Agent SDK and verify TypeScript integration.

### 1.2 Background

The Claude Agent SDK is available as:
- **TypeScript**: `@anthropic-ai/claude-agent-sdk` (we'll use this)
- **Python**: `claude-agent-sdk`

The SDK requires:
- Node.js 18+ (we have 20)
- Claude Code CLI installed globally
- ANTHROPIC_API_KEY environment variable

### 1.3 Subtasks

#### 1.3.1 Install SDK Package

Add to `packages/server/package.json`:

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.x"
  }
}
```

Run `pnpm install` to install.

#### 1.3.2 Verify Claude Code CLI

The SDK uses Claude Code CLI internally. Verify it's available:

```bash
claude --version
```

If not installed:
```bash
npm install -g @anthropic-ai/claude-code
```

#### 1.3.3 Verify SDK Imports

Create a test file to verify SDK exports are available:

```typescript
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
```

#### 1.3.4 Check API Key Detection

The SDK reads ANTHROPIC_API_KEY from environment. Verify detection works and handle missing key gracefully.

### 1.4 Verification Steps

1. Run `pnpm install` - completes without errors
2. Import SDK in TypeScript file - no type errors
3. SDK types are available: `Options`, `SDKMessage`, `Query`
4. `claude --version` shows installed CLI version

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/package.json` | Modified - add SDK |
| `pnpm-lock.yaml` | Modified - lockfile |

---

## Thrust 2: SDK Types

### 2.1 Objective

Define TypeScript types for SDK integration, bridging SDK types to AgentGate types.

### 2.2 Background

The SDK has its own type system. We need to:
- Re-export relevant SDK types
- Define AgentGate-specific wrappers
- Ensure type compatibility with existing interfaces

### 2.3 Subtasks

#### 2.3.1 Create SDK Types Module

Create `packages/server/src/types/sdk.ts`:

**Re-export SDK types:**
- `SDKMessage` - Base message type
- `SDKSystemMessage` - Session info
- `SDKAssistantMessage` - Claude responses
- `SDKUserMessage` - User prompts
- `SDKToolUseMessage` - Tool invocations
- `SDKToolResultMessage` - Tool results
- `SDKResultMessage` - Final result
- `Options` - Query options
- `Query` - Query return type

**Define AgentGate wrappers:**

```typescript
/**
 * SDK driver configuration
 */
interface ClaudeAgentSDKDriverConfig {
  /** Timeout for queries in ms (default: 300000) */
  timeoutMs?: number;
  /** Enable SDK sandboxing (default: true) */
  enableSandbox?: boolean;
  /** Custom hooks configuration */
  hooks?: SDKHooksConfig;
  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Hooks configuration for SDK driver
 */
interface SDKHooksConfig {
  /** Enable tool logging hook */
  logToolUse?: boolean;
  /** Enable file change tracking hook */
  trackFileChanges?: boolean;
  /** Custom PreToolUse validators */
  preToolValidators?: PreToolValidator[];
  /** Custom PostToolUse handlers */
  postToolHandlers?: PostToolHandler[];
}

/**
 * Tool call record from SDK execution
 */
interface ToolCallRecord {
  tool: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  timestamp: Date;
}

/**
 * SDK-specific execution result
 */
interface SDKExecutionResult {
  sessionId: string;
  model: string;
  turns: number;
  totalCostUsd: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls: ToolCallRecord[];
  messages: SDKMessage[];
}
```

#### 2.3.2 Define Hook Types

```typescript
/**
 * PreToolUse validator function
 */
type PreToolValidator = (
  tool: string,
  input: unknown
) => Promise<{ allow: boolean; reason?: string }>;

/**
 * PostToolUse handler function
 */
type PostToolHandler = (
  tool: string,
  input: unknown,
  output: unknown,
  durationMs: number
) => Promise<void>;
```

#### 2.3.3 Extend DriverCapabilities

Modify `packages/server/src/types/agent.ts`:

Add new capability flags:

```typescript
interface DriverCapabilities {
  // Existing...
  supportsSessionResume: boolean;
  supportsStructuredOutput: boolean;
  supportsToolRestriction: boolean;
  supportsTimeout: boolean;
  maxTurns: number;

  // New SDK-specific capabilities
  supportsHooks?: boolean;
  supportsSandbox?: boolean;
  supportsStreaming?: boolean;
  supportsCostTracking?: boolean;
  billingMethod?: 'api-key' | 'subscription';
}
```

#### 2.3.4 Extend AgentResult

Add optional SDK-specific fields:

```typescript
interface AgentResult {
  // Existing fields...
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  structuredOutput: unknown;
  sessionId: string | null;
  tokensUsed: TokenUsage | null;
  durationMs: number;

  // New SDK-specific fields
  totalCostUsd?: number;
  toolCalls?: ToolCallRecord[];
  model?: string;
  turns?: number;
}
```

#### 2.3.5 Export Types

Update `packages/server/src/types/index.ts` to export SDK types.

### 2.4 Verification Steps

1. All new types compile without errors
2. Types can be imported from `../types/index.js`
3. SDK types are re-exported correctly
4. No circular dependencies

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/types/sdk.ts` | Created |
| `packages/server/src/types/agent.ts` | Modified |
| `packages/server/src/types/index.ts` | Modified |

---

## SDK Type Reference

### SDKMessage Union

The SDK uses a discriminated union for messages:

```typescript
type SDKMessage =
  | SDKSystemMessage      // type: 'system'
  | SDKAssistantMessage   // type: 'assistant'
  | SDKUserMessage        // type: 'user'
  | SDKToolUseMessage     // type: 'tool_use'
  | SDKToolResultMessage  // type: 'tool_result'
  | SDKResultMessage;     // type: 'result'
```

### Key Message Fields

**SDKSystemMessage:**
- `session_id` - Session identifier for resume
- `tools` - Available tools list
- `model` - Model being used

**SDKAssistantMessage:**
- `content` - Claude's response text
- `tool_use` - Tool calls if any

**SDKResultMessage:**
- `usage.input_tokens` - Input token count
- `usage.output_tokens` - Output token count
- `cost` - Total cost in USD
- `result` - Final result status

### Options Interface

```typescript
interface Options {
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  model?: string;
  systemPrompt?: string;
  resume?: string;  // Session ID to resume
  hooks?: {
    PreToolUse?: HookMatcher[];
    PostToolUse?: HookMatcher[];
    // ... other hooks
  };
}
```
