# DevGuide v0.2.1: Overview

## Current State

AgentGate currently supports a single agent backend:
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) - recommended driver

The architecture includes a driver registry pattern that supports multiple drivers, but only Claude is implemented.

---

## Target State

After this DevGuide:
1. **Three agent drivers** available
2. **Provider-agnostic** execution
3. **Dynamic driver selection** based on availability and configuration
4. **Unified interface** - all drivers implement `AgentDriver`

---

## SDK Comparison

### Claude Agent SDK
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({ prompt, options })) {
  // Process streaming messages
}
```
- Streaming via async iterator
- Messages: system, assistant, user, result
- Built-in tool execution
- Session management via sessionId

### OpenAI Codex SDK
```typescript
import { Codex } from '@openai/codex-sdk';

const codex = new Codex();
const thread = codex.startThread();
const turn = await thread.run("task prompt");
// Or streaming:
const { events } = await thread.runStreamed("task prompt");
```
- Thread-based execution
- Session persistence in ~/.codex/sessions
- Events: item.completed, response.streaming, etc.
- Wraps Codex CLI binary

### OpenAI Agents SDK
```typescript
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'Coder',
  instructions: 'You are a coding assistant',
  tools: [customTool],
});
const result = await run(agent, userInput, { maxTurns });
```
- Provider-agnostic (defaults to OpenAI)
- Custom tools with Zod schemas
- Multi-agent handoffs
- Guardrails support

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AgentGate                            │
├─────────────────────────────────────────────────────────┤
│                  Driver Registry                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │   Claude    │ │   Codex     │ │   Agents    │       │
│  │  SDK Driver │ │  SDK Driver │ │  SDK Driver │       │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘       │
│         │               │               │               │
└─────────┼───────────────┼───────────────┼───────────────┘
          │               │               │
          ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ Claude Agent │ │   OpenAI     │ │   OpenAI     │
   │     SDK      │ │  Codex SDK   │ │  Agents SDK  │
   └──────────────┘ └──────────────┘ └──────────────┘
```

---

## AgentDriver Interface

All drivers must implement:

```typescript
interface AgentDriver {
  readonly name: string;
  readonly version: string;
  execute(request: AgentRequest): Promise<AgentResult>;
  isAvailable(): Promise<boolean>;
  getCapabilities(): DriverCapabilities;
}
```

### AgentRequest
- `workspacePath` - Directory for agent to work in
- `taskPrompt` - What the agent should do
- `constraints` - Tool restrictions, max turns, permission mode
- `timeoutMs` - Execution timeout
- `sessionId` - For resuming sessions (if supported)

### AgentResult
- `success` - Whether task completed successfully
- `exitCode` - 0 for success, non-zero for failure
- `stdout` - Agent's final response/output
- `stderr` - Error messages
- `sessionId` - For session resumption
- `tokensUsed` - Input/output token counts
- `durationMs` - Execution time

---

## Environment Configuration

```bash
# .env file
ANTHROPIC_API_KEY=sk-ant-...     # For Claude
OPENAI_API_KEY=sk-proj-...       # For Codex and Agents SDK
OPENAI_API_MODEL=gpt-5.2-...     # Default model for OpenAI
```

---

## Driver Selection Strategy

1. **Explicit Selection**: User specifies driver by name
2. **Auto-Detection**: Check `isAvailable()` for each driver
3. **Fallback Order**: Claude → Codex → Agents SDK
4. **Environment-Based**: Skip drivers without API keys
