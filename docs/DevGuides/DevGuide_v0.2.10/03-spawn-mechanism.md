# DevGuide v0.2.10: Spawn Mechanism

## Thrust 3: Spawn Processor

### 3.1 Objective

Implement the spawn processor that detects and validates spawn requests from agents.

### 3.2 Background

After the BUILD phase, the orchestrator checks for `.agentgate/spawn-requests.json` in the workspace. If found, it parses the file, validates the request against limits, and creates child work orders.

### 3.3 Subtasks

#### 3.3.1 Create Spawn Processor Module

Create `packages/server/src/orchestrator/spawn-processor.ts` with:

**SpawnProcessor class** with methods:
- `checkForSpawnRequest(workspacePath: string): Promise<SpawnRequest | null>` - Check for spawn file
- `validateSpawnRequest(request: SpawnRequest, parent: WorkOrder, limits: SpawnLimits): ValidationResult` - Validate against limits
- `createChildWorkOrders(parent: WorkOrder, request: SpawnRequest, workspace: Workspace): Promise<WorkOrder[]>` - Create children
- `deleteSpawnRequestFile(workspacePath: string): Promise<void>` - Cleanup after processing

#### 3.3.2 Implement Spawn Detection

The `checkForSpawnRequest` method should:
1. Look for `.agentgate/spawn-requests.json` in workspace
2. Parse JSON and validate with Zod schema
3. Return parsed SpawnRequest or null if not found
4. Handle parse errors gracefully (log warning, return null)

#### 3.3.3 Implement Validation Logic

The `validateSpawnRequest` method should check:
1. Depth limit: `parent.depth + 1 <= limits.maxDepth`
2. Children count: `request.children.length <= limits.maxChildrenPerParent`
3. Tree size: Current descendants + new children <= limits.maxTotalDescendants
4. Return `{ valid: boolean, errors: string[] }`

#### 3.3.4 Implement Child Creation

The `createChildWorkOrders` method should:
1. For each child in request.children:
   - Generate unique ID
   - Set parentId to parent.id
   - Set rootId to parent.rootId
   - Set depth to parent.depth + 1
   - Set siblingIndex based on position
   - Inherit workspaceSource from parent
   - Inherit policies from parent
2. Submit each child via workOrderService
3. Update parent.childIds with new child IDs
4. Return array of created work orders

### 3.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Create unit tests for spawn-processor
3. Test with sample spawn request JSON
4. Verify validation rejects requests exceeding limits

### 3.5 Files Created

| File | Action |
|------|--------|
| `packages/server/src/orchestrator/spawn-processor.ts` | Created |

---

## Thrust 4: CLAUDE.md Injection

### 4.1 Objective

Inject spawn instructions into the system prompt so agents know how to spawn children.

### 4.2 Background

Agents need to know:
1. That they CAN spawn children
2. HOW to spawn children (file format)
3. WHEN to spawn children (guidelines)
4. What LIMITS apply

This information is injected via the command builder that creates the agent's system prompt.

### 4.3 Subtasks

#### 4.3.1 Add Spawn Instructions Template

Create a template string with spawn instructions:

```markdown
## Spawning Child Agents (Optional)

If a task is too complex to complete in one session, you may decompose it into subtasks
by creating `.agentgate/spawn-requests.json` in the workspace root.

Format:
{
  "children": [
    {
      "taskPrompt": "Description of the subtask",
      "rationale": "Why this was split out",
      "estimatedComplexity": "low" | "medium" | "high"
    }
  ],
  "integrationStrategy": "merge-branches",
  "pauseUntilComplete": true
}

Guidelines:
- Only spawn when genuinely needed (task too complex for single session)
- Keep subtasks independent when possible
- Each child should be testable in isolation
- Maximum {maxChildren} children per parent
- Maximum {maxDepth} levels of nesting
- Total tree size limited to {maxTreeSize} work orders

After creating spawn-requests.json, your current iteration will pause.
Children will execute in parallel, and an integration agent will merge results.
```

#### 4.3.2 Modify Command Builder

Update `packages/server/src/agent/command-builder.ts`:

1. Add `spawnLimits` to builder options
2. Create `buildSpawnInstructions(limits: SpawnLimits): string` function
3. Append spawn instructions to system prompt in `buildSystemPromptAppend`
4. Only include if spawning is enabled (check config flag)

#### 4.3.3 Add Spawn Configuration

Add to orchestrator config:
- `enableSpawning: boolean` (default: true)
- `spawnLimits: SpawnLimits` (use defaults)

Pass config through to command builder.

### 4.4 Verification Steps

1. Run `pnpm --filter @agentgate/server typecheck` - should pass
2. Run agent with spawning enabled, verify instructions appear in prompt
3. Verify limits are correctly interpolated in the template

### 4.5 Files Modified

| File | Action |
|------|--------|
| `packages/server/src/agent/command-builder.ts` | Modified |
| `packages/server/src/orchestrator/orchestrator.ts` | Modified |
