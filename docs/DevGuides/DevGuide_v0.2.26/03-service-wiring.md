# 03: Service Wiring

## Overview

This document details how to wire real service implementations to the ExecutionEngine. The v0.2.25 service adapters provide the interface; v0.2.26 connects them to actual implementations.

---

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PhaseServices                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │   AgentDriver   │    │   Snapshotter   │    │    Verifier     │     │
│  │   (interface)   │    │   (interface)   │    │   (interface)   │     │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     │
│           │                      │                      │               │
│           ▼                      ▼                      ▼               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │ ClaudeCodeDriver│    │captureAfterState│    │     verify()    │     │
│  │ (real impl)     │    │ (real impl)     │    │   (real impl)   │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐                            │
│  │FeedbackGenerator│    │ ResultPersister │                            │
│  │   (interface)   │    │   (interface)   │                            │
│  └────────┬────────┘    └────────┬────────┘                            │
│           │                      │                                      │
│           ▼                      ▼                                      │
│  ┌─────────────────┐    ┌─────────────────┐                            │
│  │generateFeedback │    │ resultPersister │                            │
│  │+ formatForAgent │    │   (singleton)   │                            │
│  └─────────────────┘    └─────────────────┘                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. AgentDriver Wiring

### Interface (from phases/types.ts)

```typescript
interface AgentDriver {
  execute(request: AgentRequest, streamingCallback?: StreamingEventCallback): Promise<AgentResult>;
  cancel(sessionId: string): Promise<void>;
}

interface AgentRequest {
  workspacePath: string;
  taskPrompt: string;
  feedback: string | null;
  sessionId: string | null;
  iteration: number;
  constraints?: AgentConstraints;
  timeoutMs?: number;
}
```

### Real Implementation Connection

```typescript
// In engine-bridge.ts

import { ClaudeCodeDriver } from '../agent/claude-code-driver.js';
import { ClaudeCodeSubscriptionDriver } from '../agent/claude-code-subscription-driver.js';
import { DEFAULT_AGENT_CONSTRAINTS, EMPTY_CONTEXT_POINTERS } from '../agent/defaults.js';
import { generateGateSummary } from '../gate/summary.js';

export function createAgentDriverFromClaudeCode(
  driver: ClaudeCodeDriver | ClaudeCodeSubscriptionDriver,
  workOrder: WorkOrder,
  gatePlan: GatePlan,
  spawnLimits: SpawnLimits | null
): AgentDriver {
  return {
    async execute(request: AgentRequest): Promise<AgentResult> {
      const gatePlanSummary = generateGateSummary(gatePlan);

      const fullRequest: import('../types/index.js').AgentRequest = {
        workspacePath: request.workspacePath,
        taskPrompt: request.taskPrompt,
        priorFeedback: request.feedback,
        timeoutMs: request.timeoutMs ?? workOrder.maxWallClockSeconds * 1000,
        sessionId: request.sessionId,
        contextPointers: EMPTY_CONTEXT_POINTERS,
        gatePlanSummary,
        constraints: DEFAULT_AGENT_CONSTRAINTS,
        spawnLimits,
        workOrderId: workOrder.id,
      };

      return driver.execute(fullRequest);
    },

    async cancel(sessionId: string): Promise<void> {
      // ClaudeCodeDriver doesn't expose cancel directly
      // Process-level cancellation is handled by AgentProcessManager
      const { agentProcessManager } = await import('../agent/agent-process-manager.js');
      agentProcessManager.terminateBySession(sessionId);
    },
  };
}
```

---

## 2. Snapshotter Wiring

### Interface (from phases/types.ts)

```typescript
interface Snapshotter {
  capture(
    workspacePath: string,
    beforeState: BeforeState,
    options: SnapshotOptions
  ): Promise<Snapshot>;
}

interface SnapshotOptions {
  runId: string;
  iteration: number;
  taskPrompt: string;
}
```

### Real Implementation Connection

```typescript
// In engine-bridge.ts

import { captureBeforeState, captureAfterState } from '../snapshot/snapshotter.js';

export function createSnapshotterFromCallbacks(workspace: Workspace): Snapshotter {
  return {
    async capture(
      workspacePath: string,
      beforeState: BeforeState,
      options: SnapshotOptions
    ): Promise<Snapshot> {
      // captureAfterState expects workspace object, not just path
      const workspaceWithPath = { ...workspace, rootPath: workspacePath };

      return captureAfterState(
        workspaceWithPath,
        beforeState,
        options.runId,
        options.iteration,
        options.taskPrompt
      );
    },
  };
}

// Also need to capture before state at run start
export async function captureInitialState(workspace: Workspace): Promise<BeforeState> {
  return captureBeforeState(workspace);
}
```

---

## 3. Verifier Wiring

### Interface (from phases/types.ts)

```typescript
interface Verifier {
  verify(
    snapshot: Snapshot,
    gatePlan: GatePlan,
    options: VerifyOptions
  ): Promise<VerificationReport>;
}

interface VerifyOptions {
  runId: string;
  iteration: number;
  skip?: boolean;
}
```

### Real Implementation Connection

```typescript
// In engine-bridge.ts

import { verify } from '../verifier/verifier.js';

export function createVerifierFromCallbacks(
  workspace: Workspace,
  workOrder: WorkOrder
): Verifier {
  return {
    async verify(
      snapshot: Snapshot,
      gatePlan: GatePlan,
      options: VerifyOptions
    ): Promise<VerificationReport> {
      return verify({
        snapshotPath: workspace.rootPath,
        gatePlan,
        snapshotId: snapshot.id,
        runId: options.runId,
        iteration: options.iteration,
        cleanRoom: false, // TODO: Make configurable via TaskSpec
        timeoutMs: 5 * 60 * 1000, // 5 minute timeout per verification
        skip: workOrder.skipVerification ?? [],
      });
    },
  };
}
```

---

## 4. FeedbackGenerator Wiring

### Interface (from phases/types.ts)

```typescript
interface FeedbackGenerator {
  generate(
    snapshot: Snapshot,
    report: VerificationReport,
    gatePlan: GatePlan,
    options: FeedbackOptions
  ): Promise<string>;
}

interface FeedbackOptions {
  runId: string;
  iteration: number;
}
```

### Real Implementation Connection

```typescript
// In engine-bridge.ts

import { generateFeedback } from '../feedback/generator.js';
import { formatForAgent } from '../feedback/formatter.js';

export function createFeedbackGeneratorFromCallbacks(): FeedbackGenerator {
  return {
    async generate(
      _snapshot: Snapshot,
      report: VerificationReport,
      _gatePlan: GatePlan,
      _options: FeedbackOptions
    ): Promise<string> {
      // Generate structured feedback
      const structuredFeedback = generateFeedback(report, report.iteration);

      // Format for agent consumption
      return formatForAgent(structuredFeedback);
    },
  };
}
```

---

## 5. ResultPersister Wiring

### Interface (from phases/types.ts)

```typescript
interface ResultPersister {
  saveAgentResult(runId: string, iteration: number, result: AgentResult): Promise<string | null>;
  saveVerificationReport(runId: string, iteration: number, report: VerificationReport): Promise<string | null>;
  saveSnapshot(runId: string, iteration: number, snapshot: Snapshot): Promise<string | null>;
}
```

### Real Implementation Connection

```typescript
// In engine-bridge.ts

import { resultPersister } from '../orchestrator/result-persister.js';

export function createResultPersisterFromSingleton(): ResultPersister {
  return {
    async saveAgentResult(
      runId: string,
      iteration: number,
      result: AgentResult
    ): Promise<string | null> {
      try {
        return await resultPersister.saveAgentResult(runId, iteration, result);
      } catch (error) {
        log.error({ runId, iteration, error }, 'Failed to save agent result');
        return null;
      }
    },

    async saveVerificationReport(
      runId: string,
      iteration: number,
      report: VerificationReport
    ): Promise<string | null> {
      try {
        return await resultPersister.saveVerificationReport(runId, iteration, report);
      } catch (error) {
        log.error({ runId, iteration, error }, 'Failed to save verification report');
        return null;
      }
    },

    async saveSnapshot(
      _runId: string,
      _iteration: number,
      _snapshot: Snapshot
    ): Promise<string | null> {
      // Snapshots are saved as part of iteration data in run-store
      // No separate file needed
      return null;
    },
  };
}
```

---

## Complete Service Factory

```typescript
// engine-bridge.ts

export interface ServiceFactoryOptions {
  driver: ClaudeCodeDriver | ClaudeCodeSubscriptionDriver;
  workspace: Workspace;
  gatePlan: GatePlan;
  workOrder: WorkOrder;
  spawnLimits: SpawnLimits | null;
}

export function createServicesFromCallbacks(
  options: ServiceFactoryOptions
): PhaseServices {
  const { driver, workspace, gatePlan, workOrder, spawnLimits } = options;

  return {
    agentDriver: createAgentDriverFromClaudeCode(driver, workOrder, gatePlan, spawnLimits),
    snapshotter: createSnapshotterFromCallbacks(workspace),
    verifier: createVerifierFromCallbacks(workspace, workOrder),
    feedbackGenerator: createFeedbackGeneratorFromCallbacks(),
    resultPersister: createResultPersisterFromSingleton(),
  };
}
```

---

## Verification Checklist

- [ ] AgentDriver executes Claude Code correctly
- [ ] Snapshotter captures git diff accurately
- [ ] Verifier runs all gate levels (L0-L3)
- [ ] FeedbackGenerator produces actionable feedback
- [ ] ResultPersister saves to correct paths
- [ ] All services handle errors gracefully
- [ ] Services work with both ClaudeCodeDriver and SubscriptionDriver
