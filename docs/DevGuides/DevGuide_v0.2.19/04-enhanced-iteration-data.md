# 04: Thrust 3 - Enhanced IterationData

## Overview

Extend the `IterationData` structure to include references to persisted files, agent metrics, and verification details, creating a complete picture of each iteration.

---

## Current State

### IterationData Interface (Existing)

**Location:** `packages/server/src/types/run.ts`

```typescript
export interface IterationData {
  iteration: number;
  state: RunState;
  snapshotId: string | null;
  feedbackGenerated: boolean;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}
```

### What's Missing

| Field | Purpose | Impact of Absence |
|-------|---------|-------------------|
| `agentSessionId` | Link to agent session | Can't correlate with agent logs |
| `agentResultFile` | Path to `agent-{N}.json` | Don't know where output is |
| `agentDurationMs` | Agent execution time | Can't measure agent performance |
| `agentSuccess` | Agent result | Have to infer from state |
| `verificationFile` | Path to `verification-{N}.json` | Don't know where report is |
| `verificationPassed` | Verification result | Have to infer from state |
| `errorType` | Classified error | Only have generic error string |
| `errorMessage` | Error details | Limited context |

---

## Target State

### Enhanced IterationData Interface

**Location:** `packages/server/src/types/run.ts`

```typescript
export interface IterationData {
  // Existing fields
  iteration: number;
  state: RunState;
  snapshotId: string | null;
  feedbackGenerated: boolean;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;

  // NEW: Agent execution details
  agentSessionId: string | null;
  agentResultFile: string | null;  // e.g., "agent-1.json"
  agentDurationMs: number | null;
  agentSuccess: boolean | null;
  agentModel: string | null;
  agentTokensUsed: {
    input: number;
    output: number;
    total: number;
  } | null;
  agentCostUsd: number | null;

  // NEW: Verification details
  verificationFile: string | null;  // e.g., "verification-1.json"
  verificationPassed: boolean | null;
  verificationLevelsRun: string[];  // e.g., ["L0", "L1"]
  verificationDurationMs: number | null;

  // NEW: Error classification
  errorType: IterationErrorType;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
}

export enum IterationErrorType {
  NONE = 'none',
  AGENT_CRASH = 'agent_crash',
  AGENT_FAILURE = 'agent_failure',
  VERIFICATION_FAILED = 'verification_failed',
  TIMEOUT = 'timeout',
  SYSTEM_ERROR = 'system_error',
}
```

### Storage Location

```
~/.agentgate/runs/{runId}/iteration-{N}.json
```

### Example Persisted File

```json
{
  "iteration": 1,
  "state": "verifying",
  "snapshotId": "snap-abc123",
  "feedbackGenerated": false,
  "startedAt": "2026-01-02T15:30:00.000Z",
  "completedAt": "2026-01-02T15:35:30.000Z",
  "durationMs": 330000,

  "agentSessionId": "2de21b33-1af5-4d8f-aa65-6751bfdff78f",
  "agentResultFile": "agent-1.json",
  "agentDurationMs": 45000,
  "agentSuccess": true,
  "agentModel": "claude-3-opus-20240229",
  "agentTokensUsed": {
    "input": 15000,
    "output": 8000,
    "total": 23000
  },
  "agentCostUsd": 0.58,

  "verificationFile": "verification-1.json",
  "verificationPassed": false,
  "verificationLevelsRun": ["L0", "L1"],
  "verificationDurationMs": 7400,

  "errorType": "verification_failed",
  "errorMessage": "L0 failed: TypeScript compilation errors",
  "errorDetails": {
    "failedLevel": "L0",
    "failedCheck": "typecheck"
  }
}
```

---

## Implementation

### Step 1: Update Type Definitions

**File:** `packages/server/src/types/run.ts`

```typescript
/**
 * Error types for iterations.
 */
export enum IterationErrorType {
  NONE = 'none',
  AGENT_CRASH = 'agent_crash',
  AGENT_FAILURE = 'agent_failure',
  VERIFICATION_FAILED = 'verification_failed',
  TIMEOUT = 'timeout',
  SYSTEM_ERROR = 'system_error',
}

/**
 * Enhanced iteration data with full diagnostic information.
 */
export interface IterationData {
  // Core metadata
  iteration: number;
  state: RunState;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;

  // Snapshot
  snapshotId: string | null;

  // Feedback loop
  feedbackGenerated: boolean;

  // Agent execution (NEW)
  agentSessionId: string | null;
  agentResultFile: string | null;
  agentDurationMs: number | null;
  agentSuccess: boolean | null;
  agentModel: string | null;
  agentTokensUsed: {
    input: number;
    output: number;
    total: number;
  } | null;
  agentCostUsd: number | null;

  // Verification (NEW)
  verificationFile: string | null;
  verificationPassed: boolean | null;
  verificationLevelsRun: string[];
  verificationDurationMs: number | null;

  // Error handling (NEW)
  errorType: IterationErrorType;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
}

/**
 * Create default iteration data with new fields.
 */
export function createIterationData(iteration: number): IterationData {
  return {
    iteration,
    state: RunState.QUEUED,
    startedAt: new Date(),
    completedAt: null,
    durationMs: null,
    snapshotId: null,
    feedbackGenerated: false,

    // Agent defaults
    agentSessionId: null,
    agentResultFile: null,
    agentDurationMs: null,
    agentSuccess: null,
    agentModel: null,
    agentTokensUsed: null,
    agentCostUsd: null,

    // Verification defaults
    verificationFile: null,
    verificationPassed: null,
    verificationLevelsRun: [],
    verificationDurationMs: null,

    // Error defaults
    errorType: IterationErrorType.NONE,
    errorMessage: null,
    errorDetails: null,
  };
}
```

### Step 2: Update RunStore

**File:** `packages/server/src/orchestrator/run-store.ts`

Add iteration-specific save/load:

```typescript
import { IterationData, createIterationData } from '../types/run.js';

/**
 * Save iteration data to disk.
 */
export async function saveIterationData(
  runId: string,
  data: IterationData
): Promise<string> {
  const runDir = await getRunDir(runId);
  const filePath = join(runDir, `iteration-${data.iteration}.json`);

  await writeFile(filePath, JSON.stringify(data, null, 2));

  log.debug({ runId, iteration: data.iteration }, 'Saved iteration data');
  return filePath;
}

/**
 * Load iteration data from disk.
 */
export async function loadIterationData(
  runId: string,
  iteration: number
): Promise<IterationData | null> {
  try {
    const runDir = await getRunDir(runId);
    const filePath = join(runDir, `iteration-${iteration}.json`);
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as IterationData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * List all iteration numbers for a run.
 */
export async function listIterations(runId: string): Promise<number[]> {
  const runDir = await getRunDir(runId);
  const files = await readdir(runDir);

  return files
    .filter(f => f.startsWith('iteration-') && f.endsWith('.json'))
    .map(f => parseInt(f.replace('iteration-', '').replace('.json', ''), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
}

/**
 * Update iteration data with agent result info.
 */
export function updateWithAgentResult(
  data: IterationData,
  result: AgentResult,
  resultFile: string
): IterationData {
  return {
    ...data,
    agentSessionId: result.sessionId,
    agentResultFile: resultFile,
    agentDurationMs: result.durationMs,
    agentSuccess: result.success,
    agentModel: result.model ?? null,
    agentTokensUsed: result.tokensUsed,
    agentCostUsd: result.totalCostUsd ?? null,
  };
}

/**
 * Update iteration data with verification result info.
 */
export function updateWithVerificationResult(
  data: IterationData,
  report: VerificationReport,
  reportFile: string
): IterationData {
  return {
    ...data,
    verificationFile: reportFile,
    verificationPassed: report.overall.passed,
    verificationLevelsRun: Object.keys(report.levels).filter(
      k => report.levels[k as keyof typeof report.levels] !== null
    ),
    verificationDurationMs: report.duration,
  };
}

/**
 * Update iteration data with error info.
 */
export function updateWithError(
  data: IterationData,
  errorType: IterationErrorType,
  message: string,
  details?: Record<string, unknown>
): IterationData {
  return {
    ...data,
    errorType,
    errorMessage: message,
    errorDetails: details ?? null,
    completedAt: new Date(),
    durationMs: new Date().getTime() - data.startedAt.getTime(),
  };
}
```

### Step 3: Integrate with RunExecutor

**File:** `packages/server/src/orchestrator/run-executor.ts`

```typescript
import {
  createIterationData,
  saveIterationData,
  updateWithAgentResult,
  updateWithVerificationResult,
  updateWithError,
  IterationErrorType,
} from './run-store.js';

// At start of iteration:
let iterationData = createIterationData(iteration);

// After agent execution:
const agentResultFile = await resultPersister.saveAgentResult(runId, iteration, result);
iterationData = updateWithAgentResult(
  iterationData,
  result,
  basename(agentResultFile)
);

if (!result.success) {
  iterationData = updateWithError(
    iterationData,
    result.exitCode === 137 ? IterationErrorType.TIMEOUT : IterationErrorType.AGENT_FAILURE,
    result.stderr || 'Agent execution failed',
    { exitCode: result.exitCode }
  );
  await saveIterationData(runId, iterationData);
  break;
}

// After verification:
const verificationFile = await resultPersister.saveVerificationReport(runId, iteration, report);
iterationData = updateWithVerificationResult(
  iterationData,
  report,
  basename(verificationFile)
);

if (!report.overall.passed) {
  iterationData = updateWithError(
    iterationData,
    IterationErrorType.VERIFICATION_FAILED,
    report.overall.summary,
    {
      failedLevel: this.findFailedLevel(report),
      failedCheck: this.findFailedCheck(report),
    }
  );
}

// At end of iteration (success or feedback):
iterationData = {
  ...iterationData,
  completedAt: new Date(),
  durationMs: new Date().getTime() - iterationData.startedAt.getTime(),
};
await saveIterationData(runId, iterationData);
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/iteration-data.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  createIterationData,
  updateWithAgentResult,
  updateWithVerificationResult,
  updateWithError,
  IterationErrorType,
} from '../src/orchestrator/run-store.js';

describe('IterationData', () => {
  describe('createIterationData', () => {
    it('should create default iteration data', () => {
      const data = createIterationData(1);

      expect(data.iteration).toBe(1);
      expect(data.agentSessionId).toBeNull();
      expect(data.verificationFile).toBeNull();
      expect(data.errorType).toBe(IterationErrorType.NONE);
    });
  });

  describe('updateWithAgentResult', () => {
    it('should update with agent result info', () => {
      const data = createIterationData(1);
      const result = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        sessionId: 'session-123',
        model: 'claude-3-opus',
        durationMs: 5000,
        tokensUsed: { input: 1000, output: 500, total: 1500 },
        totalCostUsd: 0.25,
        structuredOutput: null,
      };

      const updated = updateWithAgentResult(data, result, 'agent-1.json');

      expect(updated.agentSessionId).toBe('session-123');
      expect(updated.agentResultFile).toBe('agent-1.json');
      expect(updated.agentSuccess).toBe(true);
      expect(updated.agentModel).toBe('claude-3-opus');
      expect(updated.agentCostUsd).toBe(0.25);
    });
  });

  describe('updateWithVerificationResult', () => {
    it('should update with verification info', () => {
      const data = createIterationData(1);
      const report = {
        runId: 'run-1',
        iteration: 1,
        overall: { passed: true, summary: 'OK' },
        levels: {
          L0: { level: 'L0', passed: true, checks: [], duration: 1000 },
          L1: { level: 'L1', passed: true, checks: [], duration: 2000 },
        },
        duration: 3000,
        completedAt: new Date(),
      };

      const updated = updateWithVerificationResult(data, report, 'verification-1.json');

      expect(updated.verificationFile).toBe('verification-1.json');
      expect(updated.verificationPassed).toBe(true);
      expect(updated.verificationLevelsRun).toEqual(['L0', 'L1']);
      expect(updated.verificationDurationMs).toBe(3000);
    });
  });

  describe('updateWithError', () => {
    it('should update with error info and complete iteration', () => {
      const data = createIterationData(1);

      const updated = updateWithError(
        data,
        IterationErrorType.VERIFICATION_FAILED,
        'L0 failed',
        { failedLevel: 'L0' }
      );

      expect(updated.errorType).toBe(IterationErrorType.VERIFICATION_FAILED);
      expect(updated.errorMessage).toBe('L0 failed');
      expect(updated.errorDetails).toEqual({ failedLevel: 'L0' });
      expect(updated.completedAt).not.toBeNull();
      expect(updated.durationMs).toBeGreaterThan(0);
    });
  });
});
```

---

## Verification Checklist

- [ ] `IterationErrorType` enum added to `types/run.ts`
- [ ] `IterationData` interface extended with new fields
- [ ] `createIterationData` function creates proper defaults
- [ ] `saveIterationData` persists to `iteration-{N}.json`
- [ ] `loadIterationData` reads from disk
- [ ] `listIterations` returns iteration numbers
- [ ] `updateWithAgentResult` populates agent fields
- [ ] `updateWithVerificationResult` populates verification fields
- [ ] `updateWithError` classifies and records errors
- [ ] RunExecutor uses new functions throughout
- [ ] Unit tests pass
- [ ] Existing code handles missing new fields gracefully

---

## Migration Notes

### Backwards Compatibility

Existing runs won't have `iteration-{N}.json` files. The system should:

1. Not fail when files don't exist
2. Return null or default values for missing data
3. Continue to work with run.json-only data

### Reading Legacy Runs

```typescript
export async function getIterationData(
  runId: string,
  iteration: number
): Promise<IterationData | null> {
  // Try new format first
  const data = await loadIterationData(runId, iteration);
  if (data) return data;

  // Fall back to extracting from run.json
  const run = await loadRun(runId);
  if (!run || !run.iterations?.[iteration - 1]) {
    return null;
  }

  // Convert legacy format to new format
  return convertLegacyIteration(run.iterations[iteration - 1]);
}
```
