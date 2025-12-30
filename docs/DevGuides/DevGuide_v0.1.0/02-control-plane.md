# Module A: Control Plane

## Purpose

Accept work orders and show results. The control plane is the user-facing interface to AgentGate.

---

## Thrust 1: Project Setup and Type Definitions

### 1.1 Objective

Initialize the TypeScript project with all dependencies and define core type interfaces.

### 1.2 Background

AgentGate is a Node.js TypeScript application. We use strict types throughout to ensure compile-time safety and enable IDE tooling.

### 1.3 Subtasks

#### 1.3.1 Initialize Node.js Project

Create the project root at `agentgate/` with package.json configured for:
- ES modules (`"type": "module"`)
- TypeScript compilation
- Bin entry for CLI (`agentgate`)
- Scripts for build, test, lint

#### 1.3.2 Configure TypeScript

Set up `tsconfig.json` with:
- Target: ES2022
- Module: NodeNext
- Strict mode enabled
- Output to `dist/`
- Include `src/**/*`

#### 1.3.3 Install Dependencies

Runtime dependencies:
- `commander` (^12.0.0) - CLI framework
- `simple-git` (^3.22.0) - Git operations
- `zod` (^3.22.0) - Schema validation
- `yaml` (^2.3.0) - YAML parsing
- `pino` (^8.17.0) - Structured logging
- `pino-pretty` (^10.3.0) - Log formatting
- `execa` (^8.0.0) - Subprocess execution
- `nanoid` (^5.0.0) - ID generation

Dev dependencies:
- `typescript` (^5.3.0)
- `vitest` (^1.2.0)
- `@types/node` (^20.0.0)
- `eslint` + `@typescript-eslint/*`
- `prettier`

#### 1.3.4 Create Type Definitions

Create the `src/types/` directory with comprehensive interfaces:

**work-order.ts**: WorkOrder interface with fields:
- `id`: string (nanoid)
- `taskPrompt`: string (user intent)
- `workspaceSource`: WorkspaceSource (local path or git URL)
- `agentType`: AgentType enum ('claude-code')
- `maxIterations`: number (default 3)
- `maxWallClockSeconds`: number (default 3600)
- `gatePlanSource`: GatePlanSource ('verify-profile' | 'ci-workflow' | 'auto')
- `policies`: ExecutionPolicies
- `createdAt`: Date
- `status`: WorkOrderStatus

**workspace.ts**: Workspace interface with fields:
- `id`: string
- `rootPath`: string (absolute path)
- `source`: WorkspaceSource
- `leaseId`: string | null
- `leasedAt`: Date | null
- `status`: WorkspaceStatus

**run.ts**: Run interface with fields:
- `id`: string
- `workOrderId`: string
- `workspaceId`: string
- `iteration`: number (current iteration, starts at 1)
- `maxIterations`: number
- `state`: RunState (state machine state)
- `snapshotBeforeSha`: string | null
- `snapshotAfterSha`: string | null
- `startedAt`: Date
- `completedAt`: Date | null
- `result`: RunResult | null

**snapshot.ts**: Snapshot interface with fields:
- `id`: string (git SHA)
- `runId`: string
- `iteration`: number
- `beforeSha`: string
- `afterSha`: string
- `patchPath`: string (path to unified diff)
- `createdAt`: Date

**gate-plan.ts**: GatePlan interface with fields:
- `id`: string
- `source`: GatePlanSource
- `sourceFile`: string | null
- `contractChecks`: ContractCheck[]
- `environmentSetup`: EnvironmentSetup
- `testCommands`: TestCommand[]
- `blackboxTests`: BlackboxTest[]
- `executionPolicy`: ExecutionPolicy

**verification.ts**: VerificationReport interface with fields:
- `id`: string
- `snapshotId`: string
- `runId`: string
- `iteration`: number
- `passed`: boolean
- `l0Result`: LevelResult
- `l1Result`: LevelResult
- `l2Result`: LevelResult
- `l3Result`: LevelResult
- `logs`: string (path to log file)
- `diagnostics`: Diagnostic[]
- `createdAt`: Date

#### 1.3.5 Create Index Barrel

Create `src/types/index.ts` that re-exports all types.

### 1.4 Verification Steps

1. Run `pnpm install` - all dependencies install without errors
2. Run `pnpm build` - TypeScript compiles successfully
3. Run `pnpm lint` - no linting errors
4. Import types in a test file - no type errors

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/package.json` | Created |
| `agentgate/tsconfig.json` | Created |
| `agentgate/.eslintrc.cjs` | Created |
| `agentgate/.prettierrc` | Created |
| `agentgate/src/types/index.ts` | Created |
| `agentgate/src/types/work-order.ts` | Created |
| `agentgate/src/types/workspace.ts` | Created |
| `agentgate/src/types/run.ts` | Created |
| `agentgate/src/types/snapshot.ts` | Created |
| `agentgate/src/types/gate-plan.ts` | Created |
| `agentgate/src/types/verification.ts` | Created |

---

## Thrust 2: CLI Framework Setup

### 2.1 Objective

Create the CLI entry point with command structure using Commander.

### 2.2 Subtasks

#### 2.2.1 Create CLI Entry Point

Create `src/index.ts` as the main entry point:
- Import Commander and configure program
- Set name, description, version
- Register all subcommands
- Handle errors gracefully with proper exit codes

#### 2.2.2 Create Command Directory Structure

Create `src/control-plane/commands/` with individual command files.

#### 2.2.3 Implement Submit Command

Create `src/control-plane/commands/submit.ts`:

The submit command accepts:
- `--task, -t <prompt>`: Task description (required)
- `--workspace, -w <path>`: Workspace path (required)
- `--max-iterations <n>`: Max retry iterations (default: 3)
- `--timeout <seconds>`: Max wall clock time (default: 3600)
- `--gate-source <source>`: Gate plan source (auto|verify-profile|ci)

Command behavior:
- Validate inputs with Zod schema
- Create WorkOrder object
- Call WorkOrderService.submit()
- Print work order ID and status
- Exit with appropriate code

#### 2.2.4 Implement Status Command

Create `src/control-plane/commands/status.ts`:

The status command accepts:
- `<work-order-id>`: Work order ID to check

Command behavior:
- Fetch work order by ID
- Fetch associated run(s)
- Display current state, iteration, timing
- If completed, show result and artifact paths
- Exit with appropriate code

#### 2.2.5 Implement List Command

Create `src/control-plane/commands/list.ts`:

The list command accepts:
- `--status <status>`: Filter by status (optional)
- `--limit <n>`: Max results (default: 20)

Command behavior:
- Query all work orders matching filters
- Display table with: ID, status, task (truncated), created time
- Exit with appropriate code

#### 2.2.6 Implement Cancel Command

Create `src/control-plane/commands/cancel.ts`:

The cancel command accepts:
- `<work-order-id>`: Work order ID to cancel

Command behavior:
- Validate work order exists and is cancelable
- Call WorkOrderService.cancel()
- Print confirmation
- Exit with appropriate code

### 2.3 Verification Steps

1. Run `pnpm build` - compiles successfully
2. Run `./dist/index.js --help` - shows all commands
3. Run `./dist/index.js submit --help` - shows submit options
4. Run `./dist/index.js submit -t "test" -w "/tmp"` - creates work order (with mock service)

### 2.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/index.ts` | Created |
| `agentgate/src/control-plane/cli.ts` | Created |
| `agentgate/src/control-plane/commands/submit.ts` | Created |
| `agentgate/src/control-plane/commands/status.ts` | Created |
| `agentgate/src/control-plane/commands/list.ts` | Created |
| `agentgate/src/control-plane/commands/cancel.ts` | Created |

---

## Thrust 3: Work Order Service

### 3.1 Objective

Implement the service layer that manages work order lifecycle.

### 3.2 Subtasks

#### 3.2.1 Create Work Order Service

Create `src/control-plane/work-order-service.ts`:

The service provides:
- `submit(request: SubmitRequest): Promise<WorkOrder>` - Create and queue work order
- `get(id: string): Promise<WorkOrder | null>` - Get work order by ID
- `list(filters: ListFilters): Promise<WorkOrder[]>` - List work orders
- `cancel(id: string): Promise<void>` - Cancel a work order
- `updateStatus(id: string, status: WorkOrderStatus): Promise<void>` - Update status

#### 3.2.2 Implement Work Order Validation

Create `src/control-plane/validators.ts`:

Zod schemas for:
- `submitRequestSchema` - Validates submit command inputs
- `workOrderSchema` - Validates full work order object
- `listFiltersSchema` - Validates list filters

Validation rules:
- Task prompt: non-empty string, max 10000 chars
- Workspace path: valid absolute path or git URL
- Max iterations: 1-10
- Timeout: 60-86400 seconds

#### 3.2.3 Implement Work Order Persistence

For MVP, use in-memory storage with JSON file backup:

Create `src/control-plane/work-order-store.ts`:
- `save(workOrder: WorkOrder): Promise<void>`
- `load(id: string): Promise<WorkOrder | null>`
- `loadAll(): Promise<WorkOrder[]>`
- `delete(id: string): Promise<void>`

Storage location: `~/.agentgate/work-orders/`

#### 3.2.4 Create Logging Setup

Create `src/utils/logger.ts`:
- Configure Pino with structured logging
- Log levels: trace, debug, info, warn, error
- Include timestamp, module name
- Pretty printing for development
- JSON for production

### 3.3 Verification Steps

1. Create a work order via CLI - returns valid ID
2. Check status of work order - shows QUEUED
3. List work orders - shows the created work order
4. Cancel work order - status changes to CANCELED
5. Restart process - work orders persist from file

### 3.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/control-plane/work-order-service.ts` | Created |
| `agentgate/src/control-plane/validators.ts` | Created |
| `agentgate/src/control-plane/work-order-store.ts` | Created |
| `agentgate/src/utils/logger.ts` | Created |
| `agentgate/src/utils/index.ts` | Created |

---

## Thrust 4: CLI Output Formatting

### 4.1 Objective

Create consistent, readable CLI output for all commands.

### 4.2 Subtasks

#### 4.2.1 Create Output Formatter

Create `src/control-plane/formatter.ts`:

Functions for:
- `formatWorkOrder(wo: WorkOrder): string` - Single work order display
- `formatWorkOrderTable(wos: WorkOrder[]): string` - Table display
- `formatRunStatus(run: Run): string` - Run progress display
- `formatVerificationReport(report: VerificationReport): string` - Report display
- `formatError(error: Error): string` - Error display

Use Unicode box drawing for tables, colors for status.

#### 4.2.2 Implement Status Indicators

Create status color mapping:
- QUEUED: yellow
- LEASED: cyan
- BUILDING: blue
- SNAPSHOTTING: blue
- VERIFYING: magenta
- FEEDBACK: yellow
- SUCCEEDED: green
- FAILED: red
- CANCELED: gray

#### 4.2.3 Add Progress Indicators

For long-running operations, show:
- Spinner for active states
- Elapsed time
- Current iteration (e.g., "Iteration 2/3")

### 4.3 Verification Steps

1. Submit work order - output is formatted nicely
2. Status command - shows colored status
3. List command - displays aligned table
4. Cancel command - confirmation message is clear

### 4.4 Files Created/Modified

| File | Action |
|------|--------|
| `agentgate/src/control-plane/formatter.ts` | Created |
| `agentgate/src/control-plane/commands/submit.ts` | Modified |
| `agentgate/src/control-plane/commands/status.ts` | Modified |
| `agentgate/src/control-plane/commands/list.ts` | Modified |

---

## Module A Complete Checklist

- [ ] Project initialized with TypeScript
- [ ] All dependencies installed
- [ ] Type definitions complete
- [ ] CLI entry point working
- [ ] Submit command functional
- [ ] Status command functional
- [ ] List command functional
- [ ] Cancel command functional
- [ ] Work order service implemented
- [ ] Persistence working
- [ ] Output formatting polished
- [ ] Unit tests passing

---

## Next Steps

Proceed to [03-workspace-manager.md](./03-workspace-manager.md) for Module B implementation.
