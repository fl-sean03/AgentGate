# 06: Appendices

## Master Checklist

### Thrust 1: SDK Dependencies
- [ ] Add `@anthropic-ai/claude-agent-sdk` to package.json
- [ ] Run `pnpm install`
- [ ] Verify SDK imports work
- [ ] Verify Claude CLI is installed
- [ ] Document SDK version

### Thrust 2: SDK Types
- [ ] Create `packages/server/src/types/sdk.ts`
- [ ] Define ClaudeAgentSDKDriverConfig
- [ ] Define SDKHooksConfig
- [ ] Define ToolCallRecord
- [ ] Define SDKExecutionResult
- [ ] Define PreToolValidator type
- [ ] Define PostToolHandler type
- [ ] Extend DriverCapabilities
- [ ] Extend AgentResult
- [ ] Export from types/index.ts

### Thrust 3: Message Parser
- [ ] Create `packages/server/src/agent/sdk-message-parser.ts`
- [ ] Implement type guards
- [ ] Implement MessageCollector class
- [ ] Implement buildAgentResult function
- [ ] Handle all message types
- [ ] Track tool calls with duration

### Thrust 4: SDK Driver
- [ ] Create `packages/server/src/agent/sdk-options-builder.ts`
- [ ] Create `packages/server/src/agent/claude-agent-sdk-driver.ts`
- [ ] Implement isAvailable()
- [ ] Implement getCapabilities()
- [ ] Implement execute()
- [ ] Handle timeout via AbortController
- [ ] Handle session resume
- [ ] Create factory functions

### Thrust 5: Hooks Integration
- [ ] Create `packages/server/src/agent/sdk-hooks.ts`
- [ ] Implement tool logger hook
- [ ] Implement file change tracker
- [ ] Implement dangerous tool blocker
- [ ] Create FileChangeTracker class
- [ ] Implement buildHooksConfig

### Thrust 6: Driver Registry
- [ ] Register SDK driver in registry
- [ ] Update default driver selection
- [ ] Export from agent/index.ts
- [ ] Update type exports
- [ ] Document agent types

### Thrust 7: Configuration
- [ ] Add SDK config to schema
- [ ] Add environment variable mapping
- [ ] Update .env.example
- [ ] Add SDK status to health endpoint

### Thrust 8: Testing
- [ ] Create SDK mock
- [ ] Create driver unit tests
- [ ] Create message parser tests
- [ ] Create hooks tests
- [ ] Create integration tests
- [ ] Create comparison tests
- [ ] Verify CI configuration

---

## Troubleshooting Guide

### SDK Issues

#### "ANTHROPIC_API_KEY not set"

**Symptoms:**
- isAvailable() returns false
- Error: "Claude Agent SDK not available"

**Solutions:**
1. Set environment variable: `export ANTHROPIC_API_KEY=sk-ant-api-...`
2. Add to .env file
3. Verify key is valid at console.anthropic.com

#### "Claude CLI not found"

**Symptoms:**
- SDK fails to initialize
- Error: "claude: command not found"

**Solutions:**
1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Verify installation: `claude --version`
3. Check PATH includes npm global bin

#### "Rate limit exceeded"

**Symptoms:**
- Execution fails with 429 error
- "Too many requests"

**Solutions:**
1. Wait for rate limit reset
2. Upgrade API tier
3. Reduce concurrent executions
4. Consider subscription billing instead

#### "Query timeout"

**Symptoms:**
- Execution aborted
- timedOut: true in result

**Solutions:**
1. Increase AGENTGATE_SDK_TIMEOUT_MS
2. Reduce task complexity
3. Check if agent is stuck in loop

### Driver Selection Issues

#### "Using wrong driver"

**Symptoms:**
- Expected SDK but got subscription
- Expected subscription but got SDK

**Solutions:**
1. Explicitly specify agentType in request
2. Check credential availability
3. Review driver selection logs

---

## Comparison: SDK vs Subscription Driver

### Feature Comparison

| Feature | SDK Driver | Subscription Driver |
|---------|------------|---------------------|
| Billing | Pay-per-token | Flat monthly rate |
| Cost tracking | Exact | Estimated |
| Sandboxing | Built-in | Container (v0.2.13) |
| Streaming | Native | Parse stdout |
| Hooks | Native | Not available |
| Session resume | SDK param | CLI flag |
| Tool blocking | PreToolUse hook | Not available |
| File tracking | PostToolUse hook | Manual |

### When to Use Each

**Use SDK Driver when:**
- You have API credits
- Need exact cost tracking
- Want built-in sandboxing
- Need hook system
- Want streaming updates

**Use Subscription Driver when:**
- You have Claude Pro/Max subscription
- Cost is already covered
- Don't need hooks
- Using container sandbox (v0.2.13)

### Performance Comparison

| Metric | SDK | Subscription |
|--------|-----|--------------|
| Startup overhead | ~100ms | ~200ms |
| Message streaming | Native | Parse |
| Memory usage | Lower | Higher |
| Error detail | Rich | Exit code |

---

## SDK Message Reference

### Message Types

**SDKSystemMessage:**
```typescript
{
  type: 'system',
  session_id: string,
  model: string,
  tools: string[],
  subtype?: string,
}
```

**SDKAssistantMessage:**
```typescript
{
  type: 'assistant',
  content: string,
  tool_use?: {
    id: string,
    name: string,
    input: unknown,
  }[],
}
```

**SDKToolUseMessage:**
```typescript
{
  type: 'tool_use',
  id: string,
  name: string,
  input: unknown,
}
```

**SDKToolResultMessage:**
```typescript
{
  type: 'tool_result',
  tool_use_id: string,
  content: unknown,
}
```

**SDKResultMessage:**
```typescript
{
  type: 'result',
  usage: {
    input_tokens: number,
    output_tokens: number,
  },
  cost: number,
  result: 'success' | 'error' | 'interrupted',
}
```

---

## References

### Official Documentation
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [SDK Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart)
- [SDK Hooks](https://platform.claude.com/docs/en/agent-sdk/hooks)
- [SDK Hosting](https://platform.claude.com/docs/en/agent-sdk/hosting)

### GitHub Repositories
- [claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python)

### Related DevGuides
- [v0.2.13 - Container Sandboxing](../DevGuide_v0.2.13/00-index.md)
- [v0.2.6 - Subscription Driver](../DevGuide_v0.2.6/00-index.md)
- [v0.2.0 - Original SDK Integration](../DevGuide_v0.2.0/00-index.md)

---

## Future Enhancements

### Streaming Dashboard Updates (v0.2.15+)

Expose SDK streaming for real-time dashboard:
- WebSocket message forwarding
- Progress indicators
- Tool execution visualization

### Custom MCP Tools (v0.2.16+)

Register custom MCP tools with SDK:
- AgentGate-specific tools
- Gate verification tools
- Spawn request tools

### Multi-Model Support (v0.3.x)

SDK supports model selection:
- Claude Opus for complex tasks
- Claude Sonnet for routine tasks
- Automatic model selection
