# 03: Thrust 2 - Persist VerificationReport

## Overview

Save the complete `VerificationReport` from each verification cycle to disk, enabling understanding of what verification found and why it passed or failed.

---

## Current State

### VerificationReport Interface (Existing)

**Location:** `packages/server/src/verifier/types.ts`

```typescript
export interface VerificationReport {
  runId: string;
  iteration: number;
  overall: VerificationResult;
  levels: {
    L0?: LevelResult;  // Contracts (lint, typecheck)
    L1?: LevelResult;  // Tests
    L2?: LevelResult;  // Blackbox
    L3?: LevelResult;  // Sanity
  };
  duration: number;
  completedAt: Date;
}

export interface LevelResult {
  level: string;
  passed: boolean;
  checks: CheckResult[];
  duration: number;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  output?: string;
  duration: number;
}
```

### What Gets Saved Today

**Answer:** Nothing. The VerificationReport is used in memory to determine pass/fail, then discarded.

**Location:** `packages/server/src/orchestrator/run-executor.ts:459-471`

```typescript
const verificationReport = await verifier.verify({...});

if (verificationReport.overall.passed) {
  // Continue to next phase
} else {
  // Generate feedback from report
  const feedback = generateFeedback(verificationReport);
  // But report itself is NOT saved
}
```

---

## Target State

### Storage Location

```
~/.agentgate/runs/{runId}/verification-{iteration}.json
```

### Example Persisted File

```json
{
  "runId": "ac31daa7-620a-451e-86e0-4269fe15b824",
  "iteration": 1,
  "capturedAt": "2026-01-02T15:35:00.000Z",
  "overall": {
    "passed": false,
    "summary": "L0 failed: TypeScript compilation errors"
  },
  "levels": {
    "L0": {
      "level": "L0",
      "passed": false,
      "checks": [
        {
          "name": "typecheck",
          "passed": false,
          "output": "src/test.ts(45,3): error TS2304: Cannot find name 'foo'\nsrc/test.ts(67,5): error TS2339: Property 'bar' does not exist",
          "duration": 5234
        },
        {
          "name": "lint",
          "passed": true,
          "output": "",
          "duration": 2100
        }
      ],
      "duration": 7334
    },
    "L1": null,
    "L2": null,
    "L3": null
  },
  "duration": 7400,
  "completedAt": "2026-01-02T15:35:07.400Z",
  "skippedLevels": ["L2", "L3"],
  "harnessConfig": {
    "waitForCI": false,
    "skipLevels": ["L2", "L3"]
  }
}
```

---

## Implementation

### Step 1: Extend Types

**File:** `packages/server/src/types/persisted-results.ts`

Add to existing file:

```typescript
import { VerificationReport, LevelResult, CheckResult } from '../verifier/types.js';

/**
 * Full verification report persisted to disk.
 */
export interface PersistedVerificationReport extends VerificationReport {
  /** When this report was captured */
  capturedAt: string;
  /** Levels that were skipped (not just not-run) */
  skippedLevels: string[];
  /** Harness config that affected verification */
  harnessConfig: {
    waitForCI: boolean;
    skipLevels: string[];
  };
}
```

### Step 2: Extend ResultPersister

**File:** `packages/server/src/orchestrator/result-persister.ts`

Add methods:

```typescript
import { VerificationReport } from '../verifier/types.js';
import { PersistedVerificationReport } from '../types/persisted-results.js';

// Add to ResultPersister class:

/**
 * Save verification report to disk.
 */
async saveVerificationReport(
  runId: string,
  iteration: number,
  report: VerificationReport,
  harnessConfig?: { waitForCI?: boolean; skipLevels?: string[] }
): Promise<string> {
  const runDir = await getRunDir(runId);

  const persisted: PersistedVerificationReport = {
    ...report,
    capturedAt: new Date().toISOString(),
    skippedLevels: this.determineSkippedLevels(report, harnessConfig?.skipLevels ?? []),
    harnessConfig: {
      waitForCI: harnessConfig?.waitForCI ?? false,
      skipLevels: harnessConfig?.skipLevels ?? [],
    },
  };

  const filePath = join(runDir, `verification-${iteration}.json`);
  await writeFile(filePath, JSON.stringify(persisted, null, 2));

  log.debug({ runId, iteration, filePath }, 'Saved verification report');
  return filePath;
}

/**
 * Load verification report from disk.
 */
async loadVerificationReport(
  runId: string,
  iteration: number
): Promise<PersistedVerificationReport | null> {
  try {
    const runDir = await getRunDir(runId);
    const filePath = join(runDir, `verification-${iteration}.json`);
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as PersistedVerificationReport;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * List all verification report iterations for a run.
 */
async listVerificationReports(runId: string): Promise<number[]> {
  const runDir = await getRunDir(runId);
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(runDir);

  return files
    .filter(f => f.startsWith('verification-') && f.endsWith('.json'))
    .map(f => parseInt(f.replace('verification-', '').replace('.json', ''), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
}

private determineSkippedLevels(
  report: VerificationReport,
  configSkipLevels: string[]
): string[] {
  const allLevels = ['L0', 'L1', 'L2', 'L3'];
  const ranLevels = Object.keys(report.levels).filter(
    k => report.levels[k as keyof typeof report.levels] !== null
  );
  return allLevels.filter(l => !ranLevels.includes(l) || configSkipLevels.includes(l));
}
```

### Step 3: Integrate with Verifier or RunExecutor

**File:** `packages/server/src/orchestrator/run-executor.ts`

Modify verification handling:

```typescript
import { resultPersister } from './result-persister.js';

// After verification completes:
const verificationReport = await verifier.verify({...});

// Save the report
try {
  await resultPersister.saveVerificationReport(
    runId,
    iteration,
    verificationReport,
    {
      waitForCI: harnessConfig.verification?.waitForCI,
      skipLevels: harnessConfig.verification?.skipLevels,
    }
  );
} catch (persistError) {
  log.error({ runId, iteration, error: persistError }, 'Failed to persist verification report');
  // Continue - don't fail the run
}

if (verificationReport.overall.passed) {
  // ...
}
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/result-persister.test.ts`

Add tests:

```typescript
describe('saveVerificationReport', () => {
  it('should save full verification report to disk', async () => {
    const report = {
      runId: testRunId,
      iteration: 1,
      overall: { passed: false, summary: 'L0 failed' },
      levels: {
        L0: {
          level: 'L0',
          passed: false,
          checks: [
            { name: 'typecheck', passed: false, output: 'Error...', duration: 5000 }
          ],
          duration: 5000,
        },
      },
      duration: 5100,
      completedAt: new Date(),
    };

    const filePath = await resultPersister.saveVerificationReport(
      testRunId,
      1,
      report,
      { waitForCI: false, skipLevels: ['L2', 'L3'] }
    );

    expect(filePath).toContain('verification-1.json');

    const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
    expect(loaded).not.toBeNull();
    expect(loaded!.overall.passed).toBe(false);
    expect(loaded!.skippedLevels).toContain('L2');
    expect(loaded!.harnessConfig.skipLevels).toContain('L2');
  });

  it('should record skipped levels from config', async () => {
    const report = {
      runId: testRunId,
      iteration: 1,
      overall: { passed: true, summary: 'Passed' },
      levels: {
        L0: { level: 'L0', passed: true, checks: [], duration: 1000 },
        L1: { level: 'L1', passed: true, checks: [], duration: 2000 },
      },
      duration: 3000,
      completedAt: new Date(),
    };

    await resultPersister.saveVerificationReport(
      testRunId,
      1,
      report,
      { skipLevels: ['L2', 'L3'] }
    );

    const loaded = await resultPersister.loadVerificationReport(testRunId, 1);
    expect(loaded!.skippedLevels).toEqual(['L2', 'L3']);
  });
});

describe('listVerificationReports', () => {
  it('should list all iterations', async () => {
    const baseReport = {
      runId: testRunId,
      iteration: 1,
      overall: { passed: true, summary: 'OK' },
      levels: {},
      duration: 100,
      completedAt: new Date(),
    };

    await resultPersister.saveVerificationReport(testRunId, 1, baseReport);
    await resultPersister.saveVerificationReport(testRunId, 2, { ...baseReport, iteration: 2 });

    const iterations = await resultPersister.listVerificationReports(testRunId);
    expect(iterations).toEqual([1, 2]);
  });
});
```

---

## Verification Checklist

- [ ] `PersistedVerificationReport` interface added to `types/persisted-results.ts`
- [ ] `saveVerificationReport` method added to ResultPersister
- [ ] `loadVerificationReport` method added to ResultPersister
- [ ] `listVerificationReports` method added to ResultPersister
- [ ] RunExecutor calls `saveVerificationReport` after verification
- [ ] Skipped levels are recorded correctly
- [ ] Harness config that affected verification is saved
- [ ] Persistence errors don't fail the run
- [ ] Unit tests pass for verification persistence
- [ ] Integration with verifier module works correctly

---

## Benefits

1. **Debug verification failures** - See exactly which check failed and why
2. **Audit verification config** - Know if levels were skipped intentionally
3. **Performance analysis** - Track duration of each check over time
4. **CI integration debugging** - Understand CI wait behavior
