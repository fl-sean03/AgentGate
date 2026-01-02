# 02: Thrust 1 - Persist Full AgentResult

## Overview

Save the complete `AgentResult` from agent execution to disk, enabling post-mortem debugging of failed runs.

---

## Current State

### AgentResult Interface (Existing)

**Location:** `packages/server/src/types/agent.ts:41-56`

```typescript
export interface AgentResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  structuredOutput: AgentStructuredOutput | null;
  sessionId: string | null;
  tokensUsed: TokenUsage | null;
  durationMs: number;
  totalCostUsd?: number;
  toolCalls?: ToolCallRecord[];
  model?: string;
}
```

### What Gets Saved Today

**Location:** `packages/server/src/orchestrator/orchestrator.ts:435-451`

```typescript
const buildResult: { sessionId: string; success: boolean; error?: string } = {
  sessionId: result.sessionId ?? randomUUID(),
  success: result.success,
};
if (!result.success) {
  buildResult.error = result.stderr || 'Build failed';
}
return buildResult;
```

**Result:** Only `sessionId`, `success`, and partial `error` are preserved. Everything else is lost.

---

## Target State

### PersistedAgentResult Interface (New)

**Location:** `packages/server/src/types/persisted-results.ts`

```typescript
export interface PersistedAgentResult {
  // Metadata
  runId: string;
  iteration: number;
  capturedAt: string;  // ISO timestamp

  // Agent identification
  sessionId: string;
  model: string | null;

  // Execution result
  success: boolean;
  exitCode: number;

  // Full output (not truncated)
  stdout: string;
  stderr: string;

  // Structured data
  structuredOutput: AgentStructuredOutput | null;
  toolCalls: ToolCallRecord[];

  // Metrics
  durationMs: number;
  tokensUsed: TokenUsage | null;
  totalCostUsd: number | null;
}
```

### Storage Location

```
~/.agentgate/runs/{runId}/agent-{iteration}.json
```

### Example Persisted File

```json
{
  "runId": "ac31daa7-620a-451e-86e0-4269fe15b824",
  "iteration": 1,
  "capturedAt": "2026-01-02T15:30:00.000Z",
  "sessionId": "2de21b33-1af5-4d8f-aa65-6751bfdff78f",
  "model": "claude-3-opus-20240229",
  "success": false,
  "exitCode": 1,
  "stdout": "I'll create the test files for you...\n\n[Tool: Write]\nCreating test/routes-profiles.test.ts...\n...",
  "stderr": "Error: TypeScript compilation failed\n  at buildProject (/home/user/project/build.ts:45)\n...",
  "structuredOutput": null,
  "toolCalls": [
    {
      "tool": "Write",
      "input": { "path": "test/routes-profiles.test.ts", "content": "..." },
      "output": "File created",
      "durationMs": 45
    },
    {
      "tool": "Bash",
      "input": { "command": "pnpm build" },
      "output": "Error: ...",
      "durationMs": 12000
    }
  ],
  "durationMs": 45000,
  "tokensUsed": {
    "input": 15000,
    "output": 8000,
    "total": 23000
  },
  "totalCostUsd": 0.58
}
```

---

## Implementation

### Step 1: Create Type Definitions

**File:** `packages/server/src/types/persisted-results.ts`

```typescript
import { AgentStructuredOutput, TokenUsage, ToolCallRecord } from './agent.js';

/**
 * Full agent result persisted to disk for debugging.
 */
export interface PersistedAgentResult {
  // Metadata
  runId: string;
  iteration: number;
  capturedAt: string;

  // Agent identification
  sessionId: string;
  model: string | null;

  // Execution result
  success: boolean;
  exitCode: number;

  // Full output
  stdout: string;
  stderr: string;

  // Structured data
  structuredOutput: AgentStructuredOutput | null;
  toolCalls: ToolCallRecord[];

  // Metrics
  durationMs: number;
  tokensUsed: TokenUsage | null;
  totalCostUsd: number | null;
}

/**
 * Options for saving agent results.
 */
export interface SaveAgentResultOptions {
  /** Maximum stdout size in bytes (default: 1MB) */
  maxStdoutBytes?: number;
  /** Maximum stderr size in bytes (default: 1MB) */
  maxStderrBytes?: number;
  /** Whether to include tool calls (default: true) */
  includeToolCalls?: boolean;
}

export const DEFAULT_SAVE_OPTIONS: SaveAgentResultOptions = {
  maxStdoutBytes: 1024 * 1024,  // 1MB
  maxStderrBytes: 1024 * 1024,  // 1MB
  includeToolCalls: true,
};
```

### Step 2: Create ResultPersister

**File:** `packages/server/src/orchestrator/result-persister.ts`

```typescript
import { join } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { AgentResult } from '../types/agent.js';
import {
  PersistedAgentResult,
  SaveAgentResultOptions,
  DEFAULT_SAVE_OPTIONS,
} from '../types/persisted-results.js';
import { getRunDir } from './run-store.js';
import { createLogger } from '../logging/index.js';

const log = createLogger('result-persister');

/**
 * Persists full agent results to disk.
 */
export class ResultPersister {
  /**
   * Save agent result to disk.
   */
  async saveAgentResult(
    runId: string,
    iteration: number,
    result: AgentResult,
    options: SaveAgentResultOptions = {}
  ): Promise<string> {
    const opts = { ...DEFAULT_SAVE_OPTIONS, ...options };
    const runDir = await getRunDir(runId);

    const persisted: PersistedAgentResult = {
      runId,
      iteration,
      capturedAt: new Date().toISOString(),
      sessionId: result.sessionId ?? 'unknown',
      model: result.model ?? null,
      success: result.success,
      exitCode: result.exitCode,
      stdout: this.truncate(result.stdout, opts.maxStdoutBytes!),
      stderr: this.truncate(result.stderr, opts.maxStderrBytes!),
      structuredOutput: result.structuredOutput,
      toolCalls: opts.includeToolCalls ? (result.toolCalls ?? []) : [],
      durationMs: result.durationMs,
      tokensUsed: result.tokensUsed,
      totalCostUsd: result.totalCostUsd ?? null,
    };

    const filePath = join(runDir, `agent-${iteration}.json`);
    await writeFile(filePath, JSON.stringify(persisted, null, 2));

    log.debug({ runId, iteration, filePath }, 'Saved agent result');
    return filePath;
  }

  /**
   * Load agent result from disk.
   */
  async loadAgentResult(
    runId: string,
    iteration: number
  ): Promise<PersistedAgentResult | null> {
    try {
      const runDir = await getRunDir(runId);
      const filePath = join(runDir, `agent-${iteration}.json`);
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as PersistedAgentResult;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all agent result iterations for a run.
   */
  async listAgentResults(runId: string): Promise<number[]> {
    const runDir = await getRunDir(runId);
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(runDir);

    return files
      .filter(f => f.startsWith('agent-') && f.endsWith('.json'))
      .map(f => parseInt(f.replace('agent-', '').replace('.json', ''), 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
  }

  private truncate(text: string, maxBytes: number): string {
    if (Buffer.byteLength(text) <= maxBytes) {
      return text;
    }

    // Truncate with message
    const truncatedText = Buffer.from(text).slice(0, maxBytes - 100).toString('utf-8');
    return truncatedText + `\n\n[TRUNCATED - exceeded ${maxBytes} bytes]`;
  }
}

// Singleton instance
export const resultPersister = new ResultPersister();
```

### Step 3: Integrate with Orchestrator

**File:** `packages/server/src/orchestrator/orchestrator.ts`

**Add import:**
```typescript
import { resultPersister } from './result-persister.js';
```

**Modify `executeIteration` (around line 435):**

```typescript
// BEFORE: Only extract minimal data
const buildResult: { sessionId: string; success: boolean; error?: string } = {
  sessionId: result.sessionId ?? randomUUID(),
  success: result.success,
};

// AFTER: Persist full result first, then extract
try {
  await resultPersister.saveAgentResult(runId, iteration, result);
} catch (persistError) {
  log.error({ runId, iteration, error: persistError }, 'Failed to persist agent result');
  // Continue execution - don't fail the run because of persistence issues
}

const buildResult: { sessionId: string; success: boolean; error?: string } = {
  sessionId: result.sessionId ?? randomUUID(),
  success: result.success,
};
```

### Step 4: Integrate with RunExecutor

**File:** `packages/server/src/orchestrator/run-executor.ts`

**Modify error handling (around line 407):**

```typescript
// BEFORE: Generic error
if (!buildResult.success) {
  run.error = buildResult.error ?? 'Build failed';
}

// AFTER: Include file reference
if (!buildResult.success) {
  const agentFile = `agent-${iteration}.json`;
  run.error = `Build failed. Details: ${agentFile}`;
  run.errorDetails = {
    type: 'agent_failure',
    agentResultFile: agentFile,
    message: buildResult.error,
  };
}
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/result-persister.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resultPersister } from '../src/orchestrator/result-persister.js';
import { rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';

describe('ResultPersister', () => {
  const testRunId = 'test-run-' + Date.now();

  afterEach(async () => {
    // Cleanup test files
    try {
      await rm(join(process.env.HOME!, '.agentgate/runs', testRunId), {
        recursive: true
      });
    } catch {}
  });

  describe('saveAgentResult', () => {
    it('should save full agent result to disk', async () => {
      const result = {
        success: false,
        exitCode: 1,
        stdout: 'Agent output here',
        stderr: 'Error message here',
        sessionId: 'test-session',
        model: 'claude-3-opus',
        durationMs: 5000,
        tokensUsed: { input: 1000, output: 500, total: 1500 },
        structuredOutput: null,
        toolCalls: [
          { tool: 'Write', input: {}, output: 'ok', durationMs: 100 }
        ],
      };

      const filePath = await resultPersister.saveAgentResult(testRunId, 1, result);

      expect(filePath).toContain('agent-1.json');

      const loaded = await resultPersister.loadAgentResult(testRunId, 1);
      expect(loaded).not.toBeNull();
      expect(loaded!.stdout).toBe('Agent output here');
      expect(loaded!.stderr).toBe('Error message here');
      expect(loaded!.toolCalls).toHaveLength(1);
    });

    it('should truncate large output', async () => {
      const result = {
        success: true,
        exitCode: 0,
        stdout: 'x'.repeat(2_000_000),  // 2MB
        stderr: '',
        sessionId: 'test-session',
        model: null,
        durationMs: 1000,
        tokensUsed: null,
        structuredOutput: null,
      };

      await resultPersister.saveAgentResult(testRunId, 1, result, {
        maxStdoutBytes: 1024,
      });

      const loaded = await resultPersister.loadAgentResult(testRunId, 1);
      expect(loaded!.stdout.length).toBeLessThan(2000);
      expect(loaded!.stdout).toContain('[TRUNCATED');
    });
  });

  describe('listAgentResults', () => {
    it('should list all iterations', async () => {
      const baseResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        sessionId: 'test',
        model: null,
        durationMs: 1000,
        tokensUsed: null,
        structuredOutput: null,
      };

      await resultPersister.saveAgentResult(testRunId, 1, baseResult);
      await resultPersister.saveAgentResult(testRunId, 2, baseResult);
      await resultPersister.saveAgentResult(testRunId, 3, baseResult);

      const iterations = await resultPersister.listAgentResults(testRunId);
      expect(iterations).toEqual([1, 2, 3]);
    });
  });
});
```

### Integration Tests

**File:** `packages/server/test/observability-integration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { resultPersister } from '../src/orchestrator/result-persister.js';
import { getRunDir } from '../src/orchestrator/run-store.js';
import { readdir } from 'node:fs/promises';

describe('Observability Integration', () => {
  it('should persist agent result when run completes', async () => {
    // This test would run a full work order and verify files are created
    // Implementation depends on test harness availability
  });

  it('should include diagnostic info in error message', async () => {
    // Verify error messages include file references
  });
});
```

---

## Verification Checklist

- [ ] `PersistedAgentResult` interface defined in `types/persisted-results.ts`
- [ ] `ResultPersister` class created in `orchestrator/result-persister.ts`
- [ ] `saveAgentResult` saves full result to `agent-{iteration}.json`
- [ ] `loadAgentResult` can read saved files
- [ ] `listAgentResults` returns iteration numbers
- [ ] Large output is truncated with warning message
- [ ] Orchestrator calls `saveAgentResult` after agent execution
- [ ] Persistence errors don't fail the run
- [ ] Run errors include reference to agent result file
- [ ] Unit tests pass for ResultPersister
- [ ] Type exports added to package index

---

## Rollback Plan

If issues arise:

1. Remove `resultPersister.saveAgentResult()` call from orchestrator
2. Keep types and persister module for future use
3. No breaking changes to existing behavior
