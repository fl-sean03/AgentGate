# 04: Hooks & Driver Registry

## Thrust 5: Hooks Integration

### 5.1 Objective

Integrate SDK hooks for tool validation, logging, and gate integration.

### 5.2 Background

The SDK provides a hooks system for intercepting agent behavior:

| Hook | When | Use Case |
|------|------|----------|
| PreToolUse | Before tool executes | Validate, block, log |
| PostToolUse | After tool completes | Log, track changes |
| Notification | System notifications | Progress updates |
| Stop | Stop condition check | Custom termination |

Hooks enable:
- Tool call logging for observability
- File change tracking for verification
- Blocking dangerous operations
- Custom validation logic

### 5.3 Subtasks

#### 5.3.1 Create Hooks Utility Module

Create `packages/server/src/agent/sdk-hooks.ts`:

**PreToolUse Logger:**
```typescript
function createToolLoggerHook(
  logger: Logger
): PreToolUseHook {
  return {
    callback: async (tool, input) => {
      logger.debug({ tool, input }, 'Tool invocation');
      return { allow: true };
    },
  };
}
```

**File Change Tracker:**
```typescript
function createFileChangeTrackerHook(
  tracker: FileChangeTracker
): PostToolUseHook {
  return {
    filter: { tools: ['Write', 'Edit'] },
    callback: async (tool, input, output) => {
      if (tool === 'Write' || tool === 'Edit') {
        const filePath = (input as { file_path: string }).file_path;
        tracker.recordChange(filePath, tool);
      }
    },
  };
}
```

**Dangerous Tool Blocker:**
```typescript
function createDangerousToolBlocker(
  blockedPatterns: RegExp[]
): PreToolUseHook {
  return {
    filter: { tools: ['Bash'] },
    callback: async (tool, input) => {
      const command = (input as { command: string }).command;

      for (const pattern of blockedPatterns) {
        if (pattern.test(command)) {
          return {
            allow: false,
            reason: `Blocked dangerous command matching ${pattern}`,
          };
        }
      }

      return { allow: true };
    },
  };
}
```

#### 5.3.2 Create FileChangeTracker

Track file modifications during execution:

```typescript
class FileChangeTracker {
  private changes: Map<string, { action: string; timestamp: Date }[]> = new Map();

  recordChange(filePath: string, action: string): void {
    if (!this.changes.has(filePath)) {
      this.changes.set(filePath, []);
    }
    this.changes.get(filePath)!.push({
      action,
      timestamp: new Date(),
    });
  }

  getChangedFiles(): string[] {
    return Array.from(this.changes.keys());
  }

  getChangeHistory(filePath: string): { action: string; timestamp: Date }[] {
    return this.changes.get(filePath) ?? [];
  }

  clear(): void {
    this.changes.clear();
  }
}
```

#### 5.3.3 Build Hooks Configuration

Build SDK hooks from config:

```typescript
function buildHooksConfig(config: SDKHooksConfig): HooksConfig {
  const hooks: HooksConfig = {};

  const preToolHooks: PreToolUseHook[] = [];
  const postToolHooks: PostToolUseHook[] = [];

  // Add logging hook
  if (config.logToolUse) {
    preToolHooks.push(createToolLoggerHook(logger));
  }

  // Add file tracking hook
  if (config.trackFileChanges) {
    const tracker = new FileChangeTracker();
    postToolHooks.push(createFileChangeTrackerHook(tracker));
  }

  // Add custom validators
  if (config.preToolValidators) {
    for (const validator of config.preToolValidators) {
      preToolHooks.push({ callback: validator });
    }
  }

  // Add custom handlers
  if (config.postToolHandlers) {
    for (const handler of config.postToolHandlers) {
      postToolHooks.push({ callback: handler });
    }
  }

  if (preToolHooks.length > 0) {
    hooks.PreToolUse = preToolHooks;
  }
  if (postToolHooks.length > 0) {
    hooks.PostToolUse = postToolHooks;
  }

  return hooks;
}
```

#### 5.3.4 Integrate with Gate Verification

Connect hooks to gate verification:

```typescript
function createGateIntegrationHooks(
  gateConfig: GateConfig
): HooksConfig {
  const hooks: HooksConfig = {};

  // Block file modifications if gate restricts
  if (gateConfig.restrictedPaths) {
    hooks.PreToolUse = [{
      filter: { tools: ['Write', 'Edit'] },
      callback: async (tool, input) => {
        const filePath = (input as { file_path: string }).file_path;

        for (const restricted of gateConfig.restrictedPaths) {
          if (filePath.startsWith(restricted)) {
            return {
              allow: false,
              reason: `Path ${restricted} is restricted by gate`,
            };
          }
        }

        return { allow: true };
      },
    }];
  }

  return hooks;
}
```

### 5.4 Verification Steps

1. Tool logger hook logs all tool calls
2. File change tracker records Write/Edit operations
3. Dangerous tool blocker rejects matching commands
4. Custom validators are called
5. Gate integration respects restrictions
6. Hooks don't break normal execution

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/sdk-hooks.ts` | Created |

---

## Thrust 6: Driver Registry

### 6.1 Objective

Update driver registry to include SDK driver and handle driver selection.

### 6.2 Background

The driver registry manages available drivers:
- Registration of drivers
- Selection by agent type
- Availability checking

We need to add the SDK driver without breaking existing selection.

### 6.3 Subtasks

#### 6.3.1 Register SDK Driver

Update `packages/server/src/agent/registry.ts`:

**Add SDK driver to registry:**

```typescript
import { ClaudeAgentSDKDriver, tryCreateSDKDriver } from './claude-agent-sdk-driver.js';

const driverRegistry: Map<string, () => Promise<AgentDriver | null>> = new Map([
  ['claude-agent-sdk', async () => tryCreateSDKDriver()],
  ['claude-code-subscription', async () => tryCreateSubscriptionDriver()],
  ['openai-codex', async () => tryCreateCodexDriver()],
  ['opencode', async () => tryCreateOpenCodeDriver()],
]);
```

#### 6.3.2 Update Default Driver Selection

Modify driver selection logic:

```typescript
async function getDefaultDriver(): Promise<AgentDriver> {
  // Priority order:
  // 1. Subscription if available (free for Pro/Max users)
  // 2. SDK if API key available
  // 3. OpenAI Codex if available
  // 4. OpenCode if available

  const subscription = await tryCreateSubscriptionDriver();
  if (subscription) {
    logger.info('Using subscription driver (default)');
    return subscription;
  }

  const sdk = await tryCreateSDKDriver();
  if (sdk) {
    logger.info('Using SDK driver (API key)');
    return sdk;
  }

  // ... other fallbacks
}
```

#### 6.3.3 Update Agent Index Exports

Update `packages/server/src/agent/index.ts`:

```typescript
// Export new driver
export {
  ClaudeAgentSDKDriver,
  createClaudeAgentSDKDriver,
  tryCreateSDKDriver,
} from './claude-agent-sdk-driver.js';

// Export hooks utilities
export {
  createToolLoggerHook,
  createFileChangeTrackerHook,
  createDangerousToolBlocker,
  FileChangeTracker,
} from './sdk-hooks.js';
```

#### 6.3.4 Update Type Exports

Ensure SDK types are exported from types index.

#### 6.3.5 Add Agent Type Documentation

Update documentation to describe agent types:

| Agent Type | Driver | Billing | Notes |
|------------|--------|---------|-------|
| `claude-agent-sdk` | ClaudeAgentSDKDriver | API key | Full SDK features |
| `claude-code-subscription` | ClaudeCodeSubscriptionDriver | Subscription | CLI subprocess |
| `openai-codex` | OpenAICodexDriver | OpenAI API | OpenAI Codex |
| `opencode` | OpenCodeDriver | OpenCode API | OpenCode SDK |

### 6.4 Verification Steps

1. SDK driver registered in registry
2. Can get SDK driver by type 'claude-agent-sdk'
3. Default selection prioritizes subscription
4. Falls back to SDK when no subscription
5. All exports work correctly
6. Existing drivers still work

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/registry.ts` | Modified |
| `packages/server/src/agent/index.ts` | Modified |

---

## Driver Selection Matrix

### Automatic Selection

When `agentType` is not specified:

```
┌─────────────────────────────────────────────────────────────┐
│ Check subscription credentials                               │
│ ~/.claude/.credentials.json                                  │
└─────────────────────────────┬───────────────────────────────┘
                              │
           ┌──────────────────┴──────────────────┐
           │ Valid?                              │
           │                                     │
     ┌─────┴─────┐                        ┌──────┴──────┐
     │   Yes     │                        │    No       │
     ▼           │                        ▼             │
┌─────────────┐  │               ┌───────────────────┐  │
│ Subscription│  │               │ Check API Key     │  │
│ Driver      │  │               │ ANTHROPIC_API_KEY │  │
└─────────────┘  │               └─────────┬─────────┘  │
                 │                         │            │
                 │          ┌──────────────┴─────────┐  │
                 │          │ Valid?                 │  │
                 │    ┌─────┴─────┐           ┌──────┴──┐
                 │    │   Yes     │           │   No    │
                 │    ▼           │           ▼         │
                 │ ┌──────────┐   │    ┌────────────┐   │
                 │ │SDK Driver│   │    │ Error: No  │   │
                 │ └──────────┘   │    │ credentials│   │
                 │                │    └────────────┘   │
                 └────────────────┴─────────────────────┘
```

### Explicit Selection

When `agentType` is specified:

| Request | Result |
|---------|--------|
| `agentType: 'claude-agent-sdk'` | SDK driver or error if unavailable |
| `agentType: 'claude-code-subscription'` | Subscription driver or error |
| `agentType: 'openai-codex'` | Codex driver or error |
