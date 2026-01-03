# Thrust 3: Unified Gates Framework

## 3.1 Objective

Create a unified "gates" framework that treats all verification mechanisms (L0-L3 levels, CI checks, custom commands, human approvals) as pluggable gate implementations with consistent interfaces for checking, failure handling, and feedback generation.

---

## 3.2 Background

### Current State

Verification is currently fragmented:

1. **L0-L3 Verification** (`packages/server/src/verifier/`)
   - Hardcoded levels with fixed semantics
   - Runs sequentially, stops on first failure
   - Integrated directly into run-executor

2. **CI Integration** (`packages/server/src/orchestrator/ci-feedback.ts`)
   - Separate polling and feedback logic
   - Different retry mechanism (`ciRetryEnabled` vs `localRetryEnabled`)
   - Not abstracted as a "gate"

3. **Gate Plan** (`packages/server/src/gate/`)
   - Exists but only for configuration loading
   - Not used as execution abstraction

### The Unified Gate Concept

A **Gate** is a checkpoint that:
- Has a **check** to perform
- Has a **failure policy** (iterate, stop, escalate)
- Has a **success policy** (continue, skip remaining)
- Can generate **feedback** on failure
- Is **pluggable** - new gate types can be added

---

## 3.3 Subtasks

### 3.3.1 Define Gate Interface

**Files Created**:
- `packages/server/src/gate/types.ts`

**Specification**:

```typescript
interface GateRunner {
  // Metadata
  readonly name: string;
  readonly type: GateCheckType;

  // Execute the gate check
  run(context: GateContext): Promise<GateResult>;

  // Generate feedback for failures
  generateFeedback(result: GateResult): Promise<GateFeedback>;

  // Validate gate configuration
  validate(config: GateCheck): ValidationResult;
}

interface GateContext {
  taskSpec: ResolvedTaskSpec;
  workOrderId: string;
  runId: string;
  iteration: number;
  snapshot: Snapshot;
  workspacePath: string;
  previousResults?: GateResult[];
}

interface GateResult {
  gate: string;                  // Gate name
  type: GateCheckType;           // Check type
  passed: boolean;
  timestamp: Date;
  duration: number;              // ms

  // Type-specific results
  details: GateDetails;

  // For feedback generation
  failures?: GateFailure[];
}

type GateDetails =
  | VerificationDetails
  | GitHubActionsDetails
  | CustomCommandDetails
  | ApprovalDetails
  | ConvergenceDetails;

interface VerificationDetails {
  type: 'verification-levels';
  levels: {
    level: 'L0' | 'L1' | 'L2' | 'L3';
    passed: boolean;
    checks: CheckResult[];
    duration: number;
  }[];
}

interface GitHubActionsDetails {
  type: 'github-actions';
  workflows: {
    name: string;
    status: 'success' | 'failure' | 'pending' | 'skipped';
    url?: string;
  }[];
  pollDuration: number;
}

interface CustomCommandDetails {
  type: 'custom';
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface GateFailure {
  level?: string;                // For verification
  workflow?: string;             // For CI
  command?: string;              // For custom
  message: string;
  file?: string;
  line?: number;
  details?: string;
}

interface GateFeedback {
  summary: string;
  failures: FormattedFailure[];
  suggestions: string[];
  formatted: string;             // Ready for agent consumption
}
```

**Verification**:
- [ ] Interface supports all gate types
- [ ] Results include all information for feedback
- [ ] Types exported correctly

---

### 3.3.2 Implement Verification Levels Gate Runner

**Files Created**:
- `packages/server/src/gate/runners/verification.ts`

**Specification**:

Wraps existing L0-L3 verifier as a gate:

```typescript
class VerificationLevelsGateRunner implements GateRunner {
  readonly name = 'verification-levels';
  readonly type = 'verification-levels' as const;

  private verifier: Verifier;

  constructor(verifier: Verifier) {
    this.verifier = verifier;
  }

  async run(context: GateContext): Promise<GateResult> {
    const gate = context.taskSpec.spec.convergence.gates.find(
      g => g.check.type === 'verification-levels'
    );
    const levels = (gate?.check as VerificationLevelsCheck).levels;

    // Create gate plan from levels
    const gatePlan = await this.buildGatePlan(context, levels);

    // Run verification
    const report = await this.verifier.verify(
      context.snapshot,
      gatePlan,
      context.workspacePath
    );

    // Convert to GateResult
    return this.toGateResult(gate?.name || 'verification', report);
  }

  private async buildGatePlan(
    context: GateContext,
    levels: ('L0' | 'L1' | 'L2' | 'L3')[]
  ): Promise<GatePlan> {
    // Load from verify.yaml or auto-detect
    const basePlan = await loadGatePlan(context.workspacePath);

    // Filter to requested levels
    return {
      ...basePlan,
      skipLevels: ['L0', 'L1', 'L2', 'L3'].filter(
        l => !levels.includes(l as any)
      ),
    };
  }

  private toGateResult(name: string, report: VerificationReport): GateResult {
    const failures: GateFailure[] = [];

    // Extract failures from each level
    for (const level of [report.l0Result, report.l1Result, report.l2Result, report.l3Result]) {
      if (!level.passed) {
        for (const check of level.checks) {
          if (!check.passed) {
            failures.push({
              level: level.level,
              message: check.message || 'Check failed',
              details: check.details,
            });
          }
        }
      }
    }

    return {
      gate: name,
      type: 'verification-levels',
      passed: report.passed,
      timestamp: new Date(),
      duration: report.totalDuration,
      details: {
        type: 'verification-levels',
        levels: [
          { level: 'L0', ...report.l0Result },
          { level: 'L1', ...report.l1Result },
          { level: 'L2', ...report.l2Result },
          { level: 'L3', ...report.l3Result },
        ],
      },
      failures,
    };
  }

  async generateFeedback(result: GateResult): Promise<GateFeedback> {
    // Use existing feedback generator
    const feedback = generateFeedback(result.details as any, result.failures);
    return {
      summary: feedback.summary,
      failures: feedback.failures,
      suggestions: feedback.suggestions,
      formatted: formatForAgent(feedback),
    };
  }

  validate(config: GateCheck): ValidationResult {
    if (config.type !== 'verification-levels') {
      return { valid: false, error: 'Wrong type' };
    }
    if (!config.levels || config.levels.length === 0) {
      return { valid: false, error: 'At least one level required' };
    }
    return { valid: true };
  }
}
```

**Verification**:
- [ ] Runs L0-L3 checks correctly
- [ ] Skips unconfigured levels
- [ ] Converts results to GateResult
- [ ] Generates feedback using existing system

---

### 3.3.3 Implement GitHub Actions Gate Runner

**Files Created**:
- `packages/server/src/gate/runners/github-actions.ts`

**Specification**:

Polls GitHub Actions for workflow status:

```typescript
class GitHubActionsGateRunner implements GateRunner {
  readonly name = 'github-actions';
  readonly type = 'github-actions' as const;

  private octokit: Octokit;

  constructor(octokit: Octokit) {
    this.octokit = octokit;
  }

  async run(context: GateContext): Promise<GateResult> {
    const gate = context.taskSpec.spec.convergence.gates.find(
      g => g.check.type === 'github-actions'
    );
    const config = gate?.check as GitHubActionsCheck;

    // Get workflow info from TaskSpec
    const { owner, repo } = context.taskSpec.spec.execution.workspace as GitHubWorkspace;

    // Get the commit SHA from snapshot
    const sha = context.snapshot.commitSha;

    // Poll for workflow runs
    const startTime = Date.now();
    const timeout = this.parseTimeout(config.timeout || '30m');
    const pollInterval = this.parseInterval(config.pollInterval || '30s');

    while (Date.now() - startTime < timeout) {
      const runs = await this.getWorkflowRuns(owner, repo, sha, config.workflows);

      const allComplete = runs.every(r => r.status === 'completed');
      if (allComplete) {
        const allPassed = runs.every(r => r.conclusion === 'success');

        return {
          gate: gate?.name || 'ci-checks',
          type: 'github-actions',
          passed: allPassed,
          timestamp: new Date(),
          duration: Date.now() - startTime,
          details: {
            type: 'github-actions',
            workflows: runs.map(r => ({
              name: r.name,
              status: r.conclusion as any,
              url: r.html_url,
            })),
            pollDuration: Date.now() - startTime,
          },
          failures: runs
            .filter(r => r.conclusion !== 'success')
            .map(r => ({
              workflow: r.name,
              message: `Workflow ${r.name} ${r.conclusion}`,
            })),
        };
      }

      await this.sleep(pollInterval);
    }

    // Timeout
    return {
      gate: gate?.name || 'ci-checks',
      type: 'github-actions',
      passed: false,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      details: {
        type: 'github-actions',
        workflows: [],
        pollDuration: Date.now() - startTime,
      },
      failures: [{ message: 'CI polling timed out' }],
    };
  }

  private async getWorkflowRuns(
    owner: string,
    repo: string,
    sha: string,
    workflows?: string[]
  ) {
    const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      head_sha: sha,
    });

    let runs = data.workflow_runs;

    // Filter to specific workflows if configured
    if (workflows && workflows.length > 0) {
      runs = runs.filter(r => workflows.includes(r.name));
    }

    return runs;
  }

  async generateFeedback(result: GateResult): Promise<GateFeedback> {
    const details = result.details as GitHubActionsDetails;
    const failed = details.workflows.filter(w => w.status !== 'success');

    return {
      summary: `CI failed: ${failed.length} workflow(s) did not pass`,
      failures: failed.map(w => ({
        type: 'ci_failure',
        message: `Workflow '${w.name}' ${w.status}`,
        url: w.url,
      })),
      suggestions: [
        'Review the workflow logs for details',
        'Fix the failing checks and push again',
      ],
      formatted: this.formatForAgent(failed),
    };
  }

  private formatForAgent(failed: any[]): string {
    return `## CI Check Failed

${failed.map(w => `- **${w.name}**: ${w.status}\n  ${w.url || ''}`).join('\n')}

Please fix the CI failures above and try again.`;
  }

  validate(config: GateCheck): ValidationResult {
    if (config.type !== 'github-actions') {
      return { valid: false, error: 'Wrong type' };
    }
    return { valid: true };
  }

  private parseTimeout(s: string): number {
    // Parse "30m", "1h", etc. to milliseconds
    const match = s.match(/^(\d+)(s|m|h)$/);
    if (!match) return 30 * 60 * 1000; // default 30m
    const [, num, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000 };
    return parseInt(num) * multipliers[unit as keyof typeof multipliers];
  }

  private parseInterval(s: string): number {
    return this.parseTimeout(s);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Verification**:
- [ ] Polls GitHub Actions correctly
- [ ] Respects timeout configuration
- [ ] Filters to specific workflows
- [ ] Generates CI feedback

---

### 3.3.4 Implement Custom Command Gate Runner

**Files Created**:
- `packages/server/src/gate/runners/custom.ts`

**Specification**:

Run arbitrary shell command as a gate:

```typescript
class CustomCommandGateRunner implements GateRunner {
  readonly name = 'custom';
  readonly type = 'custom' as const;

  async run(context: GateContext): Promise<GateResult> {
    const gate = context.taskSpec.spec.convergence.gates.find(
      g => g.check.type === 'custom' && g.name === context.currentGate
    );
    const config = gate?.check as CustomCommandCheck;

    const timeout = this.parseTimeout(config.timeout || '5m');
    const expectedExit = config.expectedExit ?? 0;

    const startTime = Date.now();

    try {
      const result = await execa(config.command, {
        cwd: context.workspacePath,
        shell: true,
        timeout,
        env: {
          ...process.env,
          CI: 'true',
          AGENTGATE: 'true',
        },
      });

      const passed = result.exitCode === expectedExit;

      return {
        gate: gate?.name || 'custom',
        type: 'custom',
        passed,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        details: {
          type: 'custom',
          command: config.command,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        },
        failures: passed ? undefined : [{
          command: config.command,
          message: `Exit code ${result.exitCode} (expected ${expectedExit})`,
          details: result.stderr || result.stdout,
        }],
      };
    } catch (error) {
      return {
        gate: gate?.name || 'custom',
        type: 'custom',
        passed: false,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        details: {
          type: 'custom',
          command: config.command,
          exitCode: -1,
          stdout: '',
          stderr: error.message,
        },
        failures: [{
          command: config.command,
          message: error.message,
        }],
      };
    }
  }

  async generateFeedback(result: GateResult): Promise<GateFeedback> {
    const details = result.details as CustomCommandDetails;

    return {
      summary: `Custom gate '${result.gate}' failed`,
      failures: result.failures?.map(f => ({
        type: 'command_failure',
        message: f.message,
        command: f.command,
      })) || [],
      suggestions: [
        `Review the command output: ${details.stderr || details.stdout}`,
        'Fix the issue and run again',
      ],
      formatted: `## Custom Gate Failed

**Command**: \`${details.command}\`
**Exit Code**: ${details.exitCode}

### Output
\`\`\`
${details.stderr || details.stdout || '(no output)'}
\`\`\`

Please fix the issue above and try again.`,
    };
  }

  validate(config: GateCheck): ValidationResult {
    if (config.type !== 'custom') {
      return { valid: false, error: 'Wrong type' };
    }
    if (!config.command) {
      return { valid: false, error: 'Command required' };
    }
    return { valid: true };
  }

  private parseTimeout(s: string): number {
    const match = s.match(/^(\d+)(s|m|h)$/);
    if (!match) return 5 * 60 * 1000;
    const [, num, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000 };
    return parseInt(num) * multipliers[unit as keyof typeof multipliers];
  }
}
```

**Verification**:
- [ ] Runs command in workspace
- [ ] Respects timeout
- [ ] Checks exit code
- [ ] Captures stdout/stderr

---

### 3.3.5 Create Gate Runner Registry

**Files Created**:
- `packages/server/src/gate/registry.ts`

**Specification**:

```typescript
interface GateRunnerRegistry {
  // Register a gate runner
  register(type: GateCheckType, runner: GateRunner): void;

  // Get runner for gate type
  get(type: GateCheckType): GateRunner;

  // Check if runner exists
  has(type: GateCheckType): boolean;

  // List available types
  list(): GateCheckType[];
}

type GateCheckType =
  | 'verification-levels'
  | 'github-actions'
  | 'custom'
  | 'approval'
  | 'convergence';

class DefaultGateRunnerRegistry implements GateRunnerRegistry {
  private runners = new Map<GateCheckType, GateRunner>();

  register(type: GateCheckType, runner: GateRunner): void {
    this.runners.set(type, runner);
  }

  get(type: GateCheckType): GateRunner {
    const runner = this.runners.get(type);
    if (!runner) {
      throw new GateRunnerNotFoundError(type);
    }
    return runner;
  }

  has(type: GateCheckType): boolean {
    return this.runners.has(type);
  }

  list(): GateCheckType[] {
    return [...this.runners.keys()];
  }
}

// Factory function to create initialized registry
export function createGateRunnerRegistry(deps: {
  verifier: Verifier;
  octokit?: Octokit;
}): GateRunnerRegistry {
  const registry = new DefaultGateRunnerRegistry();

  // Register built-in runners
  registry.register('verification-levels', new VerificationLevelsGateRunner(deps.verifier));

  if (deps.octokit) {
    registry.register('github-actions', new GitHubActionsGateRunner(deps.octokit));
  }

  registry.register('custom', new CustomCommandGateRunner());

  return registry;
}
```

**Verification**:
- [ ] Registers all built-in runners
- [ ] Returns correct runner for type
- [ ] Throws for unknown types

---

### 3.3.6 Create Gate Pipeline Executor

**Files Created**:
- `packages/server/src/gate/pipeline.ts`

**Specification**:

Executes gates in order with failure policy handling:

```typescript
interface GatePipeline {
  // Execute all gates in order
  execute(context: GateContext): Promise<GatePipelineResult>;
}

interface GatePipelineResult {
  passed: boolean;
  results: GateResult[];
  stoppedAt?: string;            // Gate that caused stop
  feedback?: GateFeedback[];     // Collected feedback
}

class DefaultGatePipeline implements GatePipeline {
  constructor(
    private registry: GateRunnerRegistry,
    private gates: Gate[]
  ) {}

  async execute(context: GateContext): Promise<GatePipelineResult> {
    const results: GateResult[] = [];
    const feedback: GateFeedback[] = [];
    let stoppedAt: string | undefined;

    for (const gate of this.gates) {
      // Check gate condition
      if (gate.condition?.when === 'manual') {
        continue; // Skip manual gates
      }

      // Get runner for this gate type
      const runner = this.registry.get(gate.check.type);

      // Execute gate
      const result = await runner.run({
        ...context,
        currentGate: gate.name,
      });
      results.push(result);

      if (!result.passed) {
        // Generate feedback if configured
        if (gate.onFailure.feedback !== 'manual') {
          const gateFeedback = await runner.generateFeedback(result);
          feedback.push(gateFeedback);
        }

        // Apply failure policy
        switch (gate.onFailure.action) {
          case 'stop':
            stoppedAt = gate.name;
            return { passed: false, results, stoppedAt, feedback };

          case 'escalate':
            // Log/notify but continue
            await this.escalate(gate, result);
            break;

          case 'iterate':
            // Will be handled by convergence controller
            break;
        }
      } else {
        // Apply success policy
        if (gate.onSuccess?.action === 'skip-remaining') {
          break;
        }
      }
    }

    const passed = results.every(r => r.passed);
    return { passed, results, feedback };
  }

  private async escalate(gate: Gate, result: GateResult): Promise<void> {
    // TODO: Implement escalation (notifications, etc.)
    console.warn(`Gate ${gate.name} failed, escalating...`);
  }
}
```

**Verification**:
- [ ] Executes gates in order
- [ ] Stops on 'stop' action
- [ ] Continues on 'iterate' action
- [ ] Escalates on 'escalate' action
- [ ] Generates feedback for failures

---

## 3.4 Verification Steps

```bash
# Test gate runners
pnpm --filter @agentgate/server test -- --grep "GateRunner"

# Test pipeline
pnpm --filter @agentgate/server test -- --grep "GatePipeline"

# Test registry
pnpm --filter @agentgate/server test -- --grep "GateRunnerRegistry"

# Integration test
pnpm --filter @agentgate/server test:integration -- --grep "gates"
```

---

## 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/gate/types.ts` | Created |
| `packages/server/src/gate/runners/verification.ts` | Created |
| `packages/server/src/gate/runners/github-actions.ts` | Created |
| `packages/server/src/gate/runners/custom.ts` | Created |
| `packages/server/src/gate/runners/index.ts` | Created |
| `packages/server/src/gate/registry.ts` | Created |
| `packages/server/src/gate/pipeline.ts` | Created |
| `packages/server/src/gate/index.ts` | Modified |
| `packages/server/test/unit/gate/` | Created (tests) |

---

## 3.6 Dependencies

- **Depends on**: Thrust 1 (TaskSpec types define Gate)
- **Enables**: Convergence controller (Thrust 2) uses gate pipeline
