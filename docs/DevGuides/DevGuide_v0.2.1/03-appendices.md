# DevGuide v0.2.1: Appendices

---

## A. SDK Quick Reference

### OpenAI Codex SDK

**Package**: `@openai/codex-sdk`
**Docs**: https://developers.openai.com/codex/sdk/

```typescript
import { Codex } from '@openai/codex-sdk';

// Start new thread
const codex = new Codex();
const thread = codex.startThread();
const turn = await thread.run("task");
console.log(turn.finalResponse);

// Resume thread
const thread2 = codex.resumeThread(threadId);

// Streaming
const { events } = await thread.runStreamed("task");
for await (const event of events) {
  switch (event.type) {
    case 'item.completed':
      console.log(event.item);
      break;
  }
}
```

### OpenAI Agents SDK

**Package**: `@openai/agents`
**Docs**: https://openai.github.io/openai-agents-js/

```typescript
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';

// Define tool
const myTool = tool({
  name: 'read_file',
  description: 'Read file contents',
  parameters: z.object({
    path: z.string(),
  }),
  execute: async (input) => {
    return fs.readFileSync(input.path, 'utf-8');
  },
});

// Create agent
const agent = new Agent({
  name: 'Coder',
  instructions: 'You are a coding assistant',
  tools: [myTool],
});

// Execute
const result = await run(agent, userPrompt, { maxTurns: 10 });
console.log(result.finalOutput);
```

---

## B. Environment Variables

| Variable | Driver | Required | Description |
|----------|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude | Yes | Anthropic API key |
| `OPENAI_API_KEY` | Codex, Agents | Yes | OpenAI API key |
| `OPENAI_API_MODEL` | Agents | No | Default model (gpt-4o) |
| `CLAUDE_MODEL` | Claude | No | Default Claude model |

---

## C. File Checklist

### New Files
- [ ] `src/agent/openai-codex-driver.ts`
- [ ] `src/agent/openai-agents-driver.ts`
- [ ] `src/agent/openai-agents-tools.ts`
- [ ] `test/openai-codex-driver.test.ts`
- [ ] `test/openai-agents-driver.test.ts`
- [ ] `scripts/live-codex-test.ts`
- [ ] `scripts/live-agents-test.ts`
- [ ] `.env.example`

### Modified Files
- [ ] `package.json`
- [ ] `src/agent/index.ts`
- [ ] `src/agent/defaults.ts`

---

## D. Thrust Completion Checklist

- [ ] Thrust 1: Install Dependencies
- [ ] Thrust 2: OpenAI Codex Driver
- [ ] Thrust 3: OpenAI Agents Driver
- [ ] Thrust 4: Update Registry
- [ ] Thrust 5: Environment Config
- [ ] Thrust 6: Unit Tests
- [ ] Thrust 7: E2E Validation

---

## E. Error Handling Patterns

### API Key Missing
```typescript
async isAvailable(): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) {
    logger.debug('OPENAI_API_KEY not set');
    return false;
  }
  return true;
}
```

### Timeout Handling
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
try {
  // Execute with controller.signal
} finally {
  clearTimeout(timeoutId);
}
```

### Tool Execution Error
```typescript
execute: async (input) => {
  try {
    return await operation(input);
  } catch (error) {
    return `Error: ${error.message}`;
  }
}
```

---

## F. Testing Strategy

### Unit Tests (No API)
- Driver instantiation
- Configuration handling
- Capability reporting
- Availability checks (mocked env)

### Integration Tests (Mock API)
- Request building
- Response parsing
- Error handling

### E2E Tests (Real API)
- Simple task execution
- File creation verification
- Session management (Codex)

---

## G. Research Sources

- [OpenAI Codex SDK](https://developers.openai.com/codex/sdk/)
- [OpenAI Codex CLI](https://github.com/openai/codex)
- [OpenAI Agents SDK TypeScript](https://openai.github.io/openai-agents-js/)
- [OpenAI Agents SDK GitHub](https://github.com/openai/openai-agents-js)
- [@openai/codex-sdk npm](https://www.npmjs.com/package/@openai/codex-sdk)
- [@openai/agents npm](https://www.npmjs.com/package/@openai/agents)
